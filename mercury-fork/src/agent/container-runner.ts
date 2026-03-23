import {
  type ChildProcessWithoutNullStreams,
  execSync,
  spawn,
} from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "../config.js";
import { scanOutbox } from "../core/outbox.js";
import { mergeMinimalRunIntoSession } from "../core/session-merge.js";
import { type Logger, logger } from "../logger.js";
import { getApiKeyFromPiAuthFile } from "../storage/pi-auth.js";
import type {
  ContainerResult,
  MessageAttachment,
  StoredMessage,
  TokenUsage,
} from "../types.js";
import { ContainerError } from "./container-error.js";

const DELIMITER_PREFIX = "---MERCURY_CONTAINER_RESULT";
const START_SUFFIX = "_START---";
const END_SUFFIX = "_END---";
/** Legacy format (no nonce) for backward compatibility with older container images */
const LEGACY_START = "---MERCURY_CONTAINER_RESULT_START---";
const LEGACY_END = "---MERCURY_CONTAINER_RESULT_END---";

const CONTAINER_LABEL = "mercury.managed=true";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(__dirname, "../..");

/** Exit code 137 = SIGKILL (128 + 9), typically from OOM killer */
const OOM_EXIT_CODE = 137;

export class AgentContainerRunner {
  private readonly runningBySpace = new Map<
    string,
    { proc: ChildProcessWithoutNullStreams; containerName: string }
  >();
  private readonly abortedSpaces = new Set<string>();
  private readonly timedOutSpaces = new Set<string>();
  private containerCounter = 0;
  private imageOverride: string | undefined;

  constructor(private readonly config: AppConfig) {
    this.validateImage();
  }

  /** Override the container image (e.g., derived image with extension CLIs). */
  setImage(image: string): void {
    this.imageOverride = image;
  }

  /** The image to use for container spawns. */
  get image(): string {
    return this.imageOverride ?? this.config.agentContainerImage;
  }

  /**
   * Warn if using a custom image that might be missing required tools.
   * Known presets (mercury-agent:*) are assumed to be valid.
   */
  private validateImage(): void {
    const image = this.config.agentContainerImage;

    // Skip validation for known presets
    if (
      image.startsWith("mercury-agent:") ||
      image.includes("/mercury-agent:")
    ) {
      return;
    }

    // For custom images, log a warning about requirements
    logger.warn("Using custom agent image", {
      image,
      note: "Ensure image has: bun, pi, bubblewrap, mrctl",
      docs: "See docs/container-lifecycle.md for custom image requirements",
    });
  }

  /**
   * Ensure the agent image is available locally, pulling it if needed.
   * Should be called on startup before accepting work.
   */
  async ensureImage(): Promise<void> {
    const image = this.image;
    try {
      execSync(`docker image inspect ${image}`, {
        stdio: "ignore",
        timeout: 10_000,
      });
      logger.debug("Agent image found locally", { image });
    } catch {
      logger.info("Agent image not found locally, pulling...", { image });
      try {
        execSync(`docker pull ${image}`, {
          stdio: "inherit",
          timeout: 300_000,
        });
        logger.info("Agent image pulled successfully", { image });
      } catch {
        throw new Error(
          `Failed to pull agent image: ${image}\nRun manually: docker pull ${image}`,
        );
      }
    }
  }

  isRunning(spaceId: string): boolean {
    return this.runningBySpace.has(spaceId);
  }

  /**
   * Clean up any orphaned containers from previous runs.
   * Should be called on startup before accepting new work.
   */
  async cleanupOrphans(): Promise<number> {
    try {
      // Find all containers with our label (running or stopped)
      const result = execSync(
        `docker ps -a --filter "label=${CONTAINER_LABEL}" --format "{{.ID}}"`,
        { encoding: "utf8", timeout: 10_000 },
      ).trim();

      if (!result) return 0;

      const containerIds = result.split("\n").filter(Boolean);
      if (containerIds.length === 0) return 0;

      logger.info("Found orphaned containers, cleaning up", {
        count: containerIds.length,
      });

      // Force remove all orphaned containers
      execSync(`docker rm -f ${containerIds.join(" ")}`, {
        encoding: "utf8",
        timeout: 30_000,
      });

      logger.info("Cleaned up orphaned containers", {
        count: containerIds.length,
      });
      return containerIds.length;
    } catch (error) {
      // If docker command fails (e.g., docker not installed), log and continue
      if (error instanceof Error && error.message.includes("ENOENT")) {
        logger.warn("Docker not found, skipping orphan cleanup");
      } else {
        logger.warn(
          "Failed to cleanup orphaned containers",
          error instanceof Error ? error : undefined,
        );
      }
      return 0;
    }
  }

  /**
   * Kill all running containers using docker kill for reliable termination.
   * Note: runningBySpace entries are cleaned up by each process's 'close' handler.
   * During shutdown the process may exit before those fire, but that's fine —
   * Docker cleans up --rm containers regardless.
   */
  killAll(): void {
    for (const [spaceId, { proc, containerName }] of this.runningBySpace) {
      this.abortedSpaces.add(spaceId);
      try {
        execSync(`docker kill ${containerName}`, { timeout: 5000 });
      } catch {
        // docker kill can fail (container exited, daemon issues, etc.) — fall back to process signal
        proc.kill("SIGKILL");
      }
    }
  }

  get activeCount(): number {
    return this.runningBySpace.size;
  }

  getActiveSpaces(): string[] {
    return [...this.runningBySpace.keys()];
  }

  abort(spaceId: string): boolean {
    const entry = this.runningBySpace.get(spaceId);
    if (!entry) return false;

    this.abortedSpaces.add(spaceId);

    // Use docker kill for reliable container termination
    try {
      execSync(`docker kill ${entry.containerName}`, { timeout: 5000 });
    } catch {
      // docker kill can fail (container exited, daemon issues, etc.) — fall back to process signal
      entry.proc.kill("SIGKILL");
    }
    return true;
  }

  private generateContainerName(): string {
    const id = ++this.containerCounter;
    const timestamp = Date.now();
    return `mercury-${timestamp}-${id}`;
  }

  async reply(input: {
    spaceId: string;
    spaceWorkspace: string;
    messages: StoredMessage[];
    prompt: string;
    callerId: string;
    callerRole?: string;
    authorName?: string;
    attachments?: MessageAttachment[];
    preferences?: Array<{ key: string; value: string }>;
    extraEnv?: Record<string, string>;
    claimedEnvSources?: Set<string>;
    useMinimalContext?: boolean;
  }): Promise<ContainerResult> {
    const globalDir = path.resolve(this.config.globalDir);
    const spacesRoot = path.resolve(this.config.spacesDir);

    fs.mkdirSync(globalDir, { recursive: true });
    fs.mkdirSync(spacesRoot, { recursive: true });

    const authFromPi = await getApiKeyFromPiAuthFile({
      provider: this.config.modelProvider,
      authPath: this.config.authPath ?? path.join(globalDir, "auth.json"),
    });

    // Env vars that should never be passed to containers
    const BLOCKED_ENV_VARS = new Set([
      "MERCURY_API_SECRET",
      "MERCURY_CHAT_API_KEY",
      "MERCURY_ADMINS",
      // Host-only: affects `docker run` flags, not the agent process inside the container
      "MERCURY_CONTAINER_BWRAP_DOCKER_COMPAT",
      "MERCURY_SLACK_BOT_TOKEN",
      "MERCURY_SLACK_SIGNING_SECRET",
      "MERCURY_DISCORD_BOT_TOKEN",
      "MERCURY_DISCORD_GATEWAY_SECRET",
      "MERCURY_TELEGRAM_BOT_TOKEN",
      "MERCURY_TELEGRAM_WEBHOOK_SECRET_TOKEN",
      "MERCURY_TEAMS_APP_ID",
      "MERCURY_TEAMS_APP_PASSWORD",
      "MERCURY_WHATSAPP_AUTH_DIR",
    ]);

    // Pass MERCURY_* vars to container with prefix stripped, excluding blocked vars
    const claimed = input.claimedEnvSources;
    const passthroughEnvPairs = Object.entries(process.env)
      .filter(
        (entry): entry is [string, string] =>
          entry[0].startsWith("MERCURY_") &&
          entry[1] !== undefined &&
          !BLOCKED_ENV_VARS.has(entry[0]) &&
          (!claimed || !claimed.has(entry[0])),
      )
      .map(([key, value]) => ({
        key: key.replace("MERCURY_", ""),
        value: value,
      }));

    // Check for pi auth file fallback for Anthropic
    const hasAnthropicKey = passthroughEnvPairs.some(
      (p) => p.key === "ANTHROPIC_API_KEY" || p.key === "ANTHROPIC_OAUTH_TOKEN",
    );
    if (
      !hasAnthropicKey &&
      this.config.modelProvider === "anthropic" &&
      authFromPi
    ) {
      passthroughEnvPairs.push({
        key: "ANTHROPIC_OAUTH_TOKEN",
        value: authFromPi,
      });
    }

    const envPairs = [
      // Internal vars (set by code, not from env)
      { key: "HOME", value: "/root" },
      {
        key: "PATH",
        value:
          "/root/.local/bin:/root/.bun/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin",
      },
      { key: "PI_CODING_AGENT_DIR", value: "/root/.pi/agent" },
      { key: "CALLER_ID", value: input.callerId },
      { key: "SPACE_ID", value: input.spaceId },
      {
        key: "API_URL",
        value: `http://host.docker.internal:${this.config.port}`,
      },
      // API secret for mrctl auth from inside containers
      { key: "API_SECRET", value: this.config.apiSecret ?? "" },
      // Passthrough vars (MERCURY_* with prefix stripped)
      ...passthroughEnvPairs,
      // Host-resolved model chain (overrides any stale MODEL_CHAIN from passthrough)
      {
        key: "MODEL_CHAIN",
        value: JSON.stringify(this.config.resolvedModelChain),
      },
      {
        key: "MODEL_RETRY_MAX_PER_LEG",
        value: String(this.config.modelMaxRetriesPerLeg),
      },
      {
        key: "MODEL_CHAIN_BUDGET_MS",
        value: String(this.config.effectiveModelChainBudgetMs),
      },
      {
        key: "MODEL_CHAIN_CAPABILITIES",
        value: JSON.stringify(this.config.resolvedModelChainCapabilities),
      },
    ].filter((x): x is { key: string; value: string } => Boolean(x.value));

    const containerName = this.generateContainerName();

    // Resolve docs paths for self-documenting agent
    const docsDir = path.resolve(PACKAGE_ROOT, "docs");
    const readmePath = path.resolve(PACKAGE_ROOT, "README.md");

    // Mount only the specific space directory for isolation
    const spaceDir = path.resolve(spacesRoot, input.spaceId);
    fs.mkdirSync(spaceDir, { recursive: true });

    const args = [
      "run",
      "--rm",
      "-i",
      "--name",
      containerName,
      "--label",
      CONTAINER_LABEL,
      "-v",
      `${spaceDir}:/spaces/${input.spaceId}`,
      "-v",
      `${globalDir}:/root/.pi/agent`,
      "-v",
      `${readmePath}:/docs/mercury/README.md:ro`,
      "-v",
      `${docsDir}:/docs/mercury/docs:ro`,
    ];

    // Bubblewrap needs extra namespace syscalls; Docker's default seccomp/caps often block them
    // inside the agent container (common on Docker Desktop). Keeps bwrap enabled; relaxes outer layer only.
    if (this.config.containerBwrapDockerCompat) {
      args.push(
        "--security-opt",
        "seccomp=unconfined",
        "--cap-add",
        "SYS_ADMIN",
      );
    }

    for (const { key, value } of envPairs) {
      args.push("-e", `${key}=${value}`);
    }

    // Extension env vars from before_container hooks
    if (input.extraEnv) {
      for (const [key, value] of Object.entries(input.extraEnv)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    args.push(this.image);

    // Per-run nonce prevents prompt injection from manipulating output delimiters
    const nonce = randomBytes(8).toString("hex");
    const START = `${DELIMITER_PREFIX}_${nonce}${START_SUFFIX}`;
    const END = `${DELIMITER_PREFIX}_${nonce}${END_SUFFIX}`;

    const payload = {
      ...input,
      messages: input.useMinimalContext
        ? input.messages.filter((m) => m.role !== "ambient")
        : input.messages,
      spaceWorkspace: input.spaceWorkspace
        .replace(spacesRoot, "/spaces")
        .replaceAll("\\", "/"),
      callerRole: input.callerRole ?? "member",
      authorName: input.authorName,
      nonce,
    };

    // Create child logger with context for this container run
    const log: Logger = logger.child({
      spaceId: input.spaceId,
      container: containerName,
    });

    const startTime = Date.now();

    return new Promise<ContainerResult>((resolve, reject) => {
      const proc = spawn("docker", args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.runningBySpace.set(input.spaceId, { proc, containerName });

      // Log container start
      log.info("Container started", { event: "container.start" });

      let stdout = "";
      let stderr = "";
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

      // Set up timeout
      timeoutTimer = setTimeout(() => {
        if (this.runningBySpace.has(input.spaceId)) {
          this.timedOutSpaces.add(input.spaceId);
          log.warn("Container timeout, killing", {
            event: "container.timeout",
          });

          // Force kill the container by name (more reliable than SIGTERM to docker run)
          try {
            execSync(`docker kill ${containerName}`, { timeout: 5000 });
          } catch {
            // Container may have already exited
            proc.kill("SIGKILL");
          }
        }
      }, this.config.containerTimeoutMs);

      const cleanup = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        this.runningBySpace.delete(input.spaceId);
      };

      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      proc.on("error", (error) => {
        cleanup();
        reject(error);
      });

      proc.on("close", (code) => {
        cleanup();

        const durationMs = Date.now() - startTime;

        // Check timeout first (before abort check since timeout sets its own state)
        if (this.timedOutSpaces.has(input.spaceId)) {
          this.timedOutSpaces.delete(input.spaceId);
          log.warn("Container exited", {
            event: "container.end",
            exitCode: code,
            durationMs,
            reason: "timeout",
          });
          reject(ContainerError.timeout(input.spaceId));
          return;
        }

        if (this.abortedSpaces.has(input.spaceId)) {
          this.abortedSpaces.delete(input.spaceId);
          log.info("Container exited", {
            event: "container.end",
            exitCode: code,
            durationMs,
            reason: "aborted",
          });
          reject(ContainerError.aborted(input.spaceId));
          return;
        }

        if (code !== 0) {
          // Check for OOM kill (exit code 137 = 128 + SIGKILL)
          if (code === OOM_EXIT_CODE) {
            log.error("Container exited", {
              event: "container.end",
              exitCode: code,
              durationMs,
              reason: "oom",
            });
            reject(ContainerError.oom(input.spaceId, code));
            return;
          }

          log.error("Container exited", {
            event: "container.end",
            exitCode: code,
            durationMs,
            reason: "error",
          });
          reject(ContainerError.error(code ?? 1, stderr || stdout));
          return;
        }

        // Success case
        log.info("Container exited", {
          event: "container.end",
          exitCode: 0,
          durationMs,
        });

        let startIdx = stdout.indexOf(START);
        let endIdx = stdout.indexOf(END);
        let startMarker = START;

        // Fallback to legacy format (no nonce) for older container images
        if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
          startIdx = stdout.indexOf(LEGACY_START);
          endIdx = stdout.indexOf(LEGACY_END);
          startMarker = LEGACY_START;
        }

        if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
          reject(
            new Error(`Failed to parse container result: ${stdout || stderr}`),
          );
          return;
        }

        const jsonText = stdout
          .slice(startIdx + startMarker.length, endIdx)
          .trim();
        let parsed: { reply?: string; usage?: TokenUsage };
        try {
          parsed = JSON.parse(jsonText) as {
            reply?: string;
            usage?: TokenUsage;
          };
        } catch {
          reject(
            new Error(`Malformed container output: ${jsonText.slice(0, 200)}`),
          );
          return;
        }

        const replyText = parsed.reply ?? "Done.";
        const files = scanOutbox(input.spaceWorkspace, startTime);

        if (input.useMinimalContext) {
          const sessionFile = path.join(
            spacesRoot,
            input.spaceId,
            ".mercury.session.jsonl",
          );
          mergeMinimalRunIntoSession(
            sessionFile,
            input.prompt,
            replyText,
            this.config,
          ).catch((err) => {
            log.error("Merge failed, reply still returned", {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }

        resolve({ reply: replyText, files, usage: parsed.usage });
      });

      proc.stdin.write(JSON.stringify(payload));
      proc.stdin.end();
    });
  }
}
