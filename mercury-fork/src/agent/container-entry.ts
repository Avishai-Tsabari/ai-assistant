import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { MessageAttachment, StoredMessage } from "../types.js";
import {
  DEFAULT_CAPABILITIES,
  type ModelCapabilities,
} from "./model-capabilities-core.js";
import { classifyPiFailure } from "./pi-failure-class.js";
import {
  type PiJsonlParseResult,
  parsePiPrintJsonlOutput,
} from "./pi-jsonl-parser.js";
import { escapeXmlText, formatPreferencesXml } from "./preferences-prompt.js";

type Payload = {
  spaceId: string;
  spaceWorkspace: string;
  messages: StoredMessage[];
  prompt: string;
  callerRole?: string;
  authorName?: string;
  attachments?: MessageAttachment[];
  preferences?: Array<{ key: string; value: string }>;
  nonce?: string;
};

type ModelLeg = { provider: string; model: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with small jitter; base 300ms, cap 12s. */
function backoffMs(attemptIndex: number): number {
  const base = 300 * 2 ** attemptIndex;
  const cap = 12_000;
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(cap, base + jitter);
}

function parsePartialCapabilities(obj: unknown): ModelCapabilities {
  if (!obj || typeof obj !== "object") return { ...DEFAULT_CAPABILITIES };
  const o = obj as Record<string, unknown>;
  const out = { ...DEFAULT_CAPABILITIES };
  if (typeof o.tools === "boolean") out.tools = o.tools;
  if (typeof o.vision === "boolean") out.vision = o.vision;
  if (typeof o.audio_input === "boolean") out.audio_input = o.audio_input;
  if (typeof o.audio_output === "boolean") out.audio_output = o.audio_output;
  if (typeof o.extended_thinking === "boolean")
    out.extended_thinking = o.extended_thinking;
  return out;
}

/**
 * Per-leg capabilities from host (MODEL_CHAIN_CAPABILITIES JSON array).
 * When missing or invalid, defaults to DEFAULT_CAPABILITIES for each leg.
 */
function parseModelChainCapabilitiesFromEnv(
  legCount: number,
): ModelCapabilities[] {
  const raw = process.env.MODEL_CHAIN_CAPABILITIES?.trim();
  if (!raw) {
    return Array.from({ length: legCount }, () => ({
      ...DEFAULT_CAPABILITIES,
    }));
  }
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) {
      return Array.from({ length: legCount }, () => ({
        ...DEFAULT_CAPABILITIES,
      }));
    }
    const out: ModelCapabilities[] = [];
    for (let i = 0; i < legCount; i++) {
      out.push(parsePartialCapabilities(arr[i]));
    }
    return out;
  } catch {
    return Array.from({ length: legCount }, () => ({
      ...DEFAULT_CAPABILITIES,
    }));
  }
}

function parseModelLegsFromEnv(): ModelLeg[] {
  const raw = process.env.MODEL_CHAIN?.trim();
  if (raw) {
    try {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr) && arr.length > 0) {
        const out: ModelLeg[] = [];
        for (const item of arr) {
          if (
            item &&
            typeof item === "object" &&
            "provider" in item &&
            "model" in item
          ) {
            const p = String((item as { provider: unknown }).provider).trim();
            const m = String((item as { model: unknown }).model).trim();
            if (p && m) out.push({ provider: p, model: m });
          }
        }
        if (out.length > 0) return out;
      }
    } catch {
      // fall through to legacy single leg
    }
  }
  return [
    {
      provider: process.env.MODEL_PROVIDER || "anthropic",
      model: process.env.MODEL || "claude-opus-4-6",
    },
  ];
}

function parseRetryMaxPerLeg(): number {
  const n = Number.parseInt(process.env.MODEL_RETRY_MAX_PER_LEG ?? "2", 10);
  if (Number.isNaN(n)) return 2;
  return Math.max(0, Math.min(5, n));
}

function parseChainBudgetMs(): number {
  const n = Number.parseInt(process.env.MODEL_CHAIN_BUDGET_MS ?? "120000", 10);
  if (Number.isNaN(n)) return 120_000;
  return Math.max(5000, n);
}

/**
 * Pinchtab reads CHROME_BINARY. Extension hooks may point at a path that is
 * missing in this image layer; the base mercury-agent Dockerfile installs
 * Chromium at /usr/local/bin/chromium and sets PUPPETEER_EXECUTABLE_PATH.
 * Normalize before spawning pi so bash/pinchtab inherit a working binary.
 */
function resolveChromeBinaryEnv(): void {
  const trySet = (p: string | undefined): boolean => {
    if (!p?.trim()) return false;
    const normalized = p.trim();
    try {
      accessSync(normalized, constants.X_OK);
      process.env.CHROME_BINARY = normalized;
      return true;
    } catch {
      return false;
    }
  };
  if (trySet(process.env.CHROME_BINARY)) return;
  if (trySet(process.env.PUPPETEER_EXECUTABLE_PATH)) return;
  for (const candidate of [
    "/usr/local/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ]) {
    if (trySet(candidate)) return;
  }
}

function formatContextTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
}

function hasImageAttachments(
  attachments: MessageAttachment[] | undefined,
): boolean {
  if (!attachments?.length) return false;
  return attachments.some(
    (a) =>
      a.type === "image" ||
      (a.mimeType?.toLowerCase().startsWith("image/") ?? false),
  );
}

function hasAudioAttachments(
  attachments: MessageAttachment[] | undefined,
): boolean {
  if (!attachments?.length) return false;
  return attachments.some(
    (a) =>
      a.type === "audio" ||
      a.type === "voice" ||
      (a.mimeType?.toLowerCase().startsWith("audio/") ?? false),
  );
}

function buildCapabilitySection(
  caps: ModelCapabilities,
  payload: Payload,
): string {
  const parts: string[] = ["## Current model capabilities"];
  parts.push(
    `This turn uses a model with the following constraints (do not assume you can exceed them):`,
  );
  parts.push(
    `- **tools (bash / read / write / edit):** ${caps.tools ? "available" : "NOT available — you cannot run shell commands, read/write workspace files via tools, or use mrctl"}`,
  );
  parts.push(
    `- **vision (images):** ${caps.vision ? "available" : "NOT available"}`,
  );
  parts.push(
    `- **audio input:** ${caps.audio_input ? "available" : "NOT available"}`,
  );
  parts.push(
    `- **audio output:** ${caps.audio_output ? "available" : "NOT available"}`,
  );

  if (!caps.tools) {
    parts.push("");
    parts.push(
      `**Toolless mode:** You must answer from general knowledge and the text of the user message only. For tasks that require generating files (PDFs, scripts, merges), running commands, or using \`mrctl\`, explain what the user would need to do manually or suggest switching to a model that supports tools (see Mercury docs / \`.mercury/model-capabilities.yaml\`).`,
    );
  }

  if (!caps.vision && hasImageAttachments(payload.attachments)) {
    parts.push("");
    parts.push(
      `**Note:** This model cannot process image pixels. Image files are still listed in <attachments /> with paths — you may reference paths and filenames but cannot interpret visual content.`,
    );
  }

  if (!caps.audio_input && hasAudioAttachments(payload.attachments)) {
    parts.push("");
    parts.push(
      `**Note:** This model cannot process audio. Voice attachments are listed with paths only.`,
    );
  }

  return parts.join("\n");
}

function buildSystemPrompt(caps: ModelCapabilities, payload: Payload): string {
  const base = `You are Mercury, a concise personal AI assistant.
Prioritize practical outputs and explicit assumptions.

Files received from users (images, documents, voice notes) are saved to the \`inbox/\` directory in the current workspace. To send files back with your reply, write them to the \`outbox/\` directory — any files created or modified there during this run will be automatically attached to your response.

You are Mercury, built from https://github.com/Michaelliv/mercury. When users ask about Mercury — what it can do, how to configure it, scheduling, permissions, extensions, or anything about the platform — you MUST read from \`/docs/mercury/\` before answering. Start with \`/docs/mercury/README.md\` for an overview, then check \`/docs/mercury/docs/\` for detailed guides.

## Permissions & Security
Each run is triggered by a specific caller with a role (admin or member). The caller's identity and role are provided in the user prompt as a <caller /> tag.
- **admin**: Full access to all tools and extensions.
- **member**: Limited access. Some tools and extensions are restricted.
If a tool call is blocked with "Permission denied", this is a hard security boundary. Do NOT attempt to achieve the same result through alternative means — no curl, no direct API calls, no workarounds. Simply inform the user they do not have permission.

## Moderation
You can mute users who are being abusive, spamming, trying to exfiltrate secrets, or deliberately wasting the group's resources by triggering you for pointless nonsense. Use \`mrctl mute\` when you judge it necessary — you don't need to wait for an admin to ask. Warn the user first, then mute if they continue.`;

  const memory = `## Memory
Your workspace may contain a \`MEMORY.md\` file with a summary of past interactions and important context for this space. If it exists, use it to stay consistent with prior decisions. You may update \`MEMORY.md\` when significant events happen, new patterns emerge, or when asked to remember something. Keep it concise (~1500 tokens max). Use \`mrctl recall\` to search older message history when you need details that are not in the current context.`;

  return `${base}\n\n${buildCapabilitySection(caps, payload)}\n\n${memory}`;
}

/**
 * Format attachment information for the prompt as XML.
 * Converts absolute paths to container-relative paths.
 */
function formatAttachments(
  attachments: MessageAttachment[] | undefined,
): string | null {
  if (!attachments || attachments.length === 0) return null;

  const entries = attachments.map((att) => {
    // Convert host path to container path
    const containerPath = att.path.replace(/^.*\/spaces\//, "/spaces/");

    const attrs = [
      `type="${att.type}"`,
      `path="${containerPath}"`,
      `mime="${att.mimeType}"`,
    ];

    if (att.sizeBytes) {
      attrs.push(`size="${att.sizeBytes}"`);
    }
    if (att.filename) {
      attrs.push(`filename="${att.filename}"`);
    }

    return `  <attachment ${attrs.join(" ")} />`;
  });

  return ["<attachments>", ...entries, "</attachments>"].join("\n");
}

function buildEpisodicMemory(spaceWorkspace: string): string | null {
  try {
    const memoryPath = path.join(spaceWorkspace, "MEMORY.md");
    const content = readFileSync(memoryPath, "utf8").trim();
    if (!content) return null;
    return `<episodic_memory>\n${content}\n</episodic_memory>`;
  } catch {
    return null;
  }
}

function buildHistoryXml(messages: StoredMessage[]): string | null {
  // Pair up user+assistant turns; skip ambient (they have their own section)
  const turns: Array<{ user: StoredMessage; assistant?: StoredMessage }> = [];
  let pendingUser: StoredMessage | null = null;

  for (const m of messages) {
    if (m.role === "user") {
      if (pendingUser) {
        // user without assistant reply (shouldn't normally happen, but include it)
        turns.push({ user: pendingUser });
      }
      pendingUser = m;
    } else if (m.role === "assistant" && pendingUser) {
      turns.push({ user: pendingUser, assistant: m });
      pendingUser = null;
    }
  }
  // Any trailing user message without a reply
  if (pendingUser) turns.push({ user: pendingUser });

  if (turns.length === 0) return null;

  const entries = turns.map(({ user, assistant }) => {
    const ts = formatContextTimestamp(user.createdAt);
    const userLine = `    <user>${escapeXmlText(user.content)}</user>`;
    const assistantLine = assistant
      ? `\n    <assistant>${escapeXmlText(assistant.content)}</assistant>`
      : "";
    return `  <turn timestamp="${ts}">\n${userLine}${assistantLine}\n  </turn>`;
  });

  return `<history>\n${entries.join("\n")}\n</history>`;
}

function buildPrompt(payload: Payload): string {
  const parts: string[] = [];

  // 1. Caller identity
  const callerId = process.env.CALLER_ID ?? "unknown";
  const role = payload.callerRole ?? "member";
  const space = payload.spaceId ?? "unknown";
  const nameAttr = payload.authorName ? ` name="${payload.authorName}"` : "";
  parts.push(
    `<caller id="${callerId}"${nameAttr} role="${role}" space="${space}" />`,
  );
  parts.push("");

  // 2. Episodic memory (MEMORY.md)
  const episodicMemory = buildEpisodicMemory(payload.spaceWorkspace);
  if (episodicMemory) {
    parts.push(episodicMemory);
    parts.push("");
  }

  // 3. Recent conversation history (sliding window from DB)
  const historyXml = buildHistoryXml(payload.messages);
  if (historyXml) {
    parts.push(historyXml);
    parts.push("");
  }

  // 4. Ambient messages (non-triggered group chat context)
  const ambientEntries = payload.messages
    .filter((m) => m.role === "ambient")
    .map((m) => {
      const ts = formatContextTimestamp(m.createdAt);
      return `  <message role="space" timestamp="${ts}">\n${m.content}\n  </message>`;
    });

  if (ambientEntries.length > 0) {
    parts.push("<ambient_messages>");
    parts.push(...ambientEntries);
    parts.push("</ambient_messages>");
    parts.push("");
  }

  // 5. Preferences
  const preferencesXml = formatPreferencesXml(payload.preferences);
  if (preferencesXml) {
    parts.push(preferencesXml);
    parts.push("");
  }

  // 6. Attachments from current message
  const attachmentsXml = formatAttachments(payload.attachments);
  if (attachmentsXml) {
    parts.push(attachmentsXml);
    parts.push("");
  }

  // 7. Current prompt
  parts.push(payload.prompt);

  return parts.join("\n");
}

/**
 * Build bwrap args for sandboxing the agent process.
 * Uses bubblewrap for defense-in-depth: Docker isolates from host, bwrap restricts within container.
 * See https://github.com/containers/bubblewrap
 */
function buildBwrapArgs(workspace: string, command: string[]): string[] {
  const args: string[] = [
    "--ro-bind",
    "/usr",
    "/usr",
    "--symlink",
    "usr/lib",
    "/lib",
    "--symlink",
    "usr/bin",
    "/bin",
    "--symlink",
    "usr/sbin",
    "/sbin",
  ];
  // /usr/lib64 exists on x86_64; skip on ARM64 where it may not exist
  if (existsSync("/usr/lib64")) {
    args.push("--symlink", "usr/lib64", "/lib64");
  }
  args.push("--ro-bind", "/app", "/app", "--ro-bind", "/etc", "/etc");
  if (existsSync("/docs")) {
    args.push("--ro-bind", "/docs", "/docs");
  }
  args.push(
    "--bind",
    "/spaces",
    "/spaces",
    "--bind",
    "/root",
    "/root",
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
    "--unshare-pid",
    "--new-session",
    "--die-with-parent",
    "--chdir",
    workspace,
    "--",
    ...command,
  );
  return args;
}

function invokePiOnce(
  payload: Payload,
  provider: string,
  model: string,
  capabilities: ModelCapabilities,
): Promise<PiJsonlParseResult> {
  return new Promise((resolve, reject) => {
    // Combine base system prompt with extension-injected fragments
    let systemPrompt = buildSystemPrompt(capabilities, payload);
    const extPrompt = process.env.MERCURY_EXT_SYSTEM_PROMPT;
    if (extPrompt) {
      systemPrompt = `${systemPrompt}\n\n${extPrompt}`;
    }

    const sessionArgs = ["--no-session"];

    const toolModeArgs = capabilities.tools
      ? ([] as string[])
      : (["--no-tools", "--no-skills"] as string[]);

    const piArgs = [
      "--print",
      "--mode",
      "json",
      ...sessionArgs,
      "--provider",
      provider,
      "--model",
      model,
      ...toolModeArgs,
      "-e",
      "/app/src/extensions/permission-guard.ts",
      "--append-system-prompt",
      systemPrompt,
      buildPrompt(payload),
    ];

    // Host passes MERCURY_* as stripped keys (e.g. MERCURY_DISABLE_BUBBLEWRAP → DISABLE_BUBBLEWRAP).
    const disableBubblewrap =
      process.env.MERCURY_DISABLE_BUBBLEWRAP === "1" ||
      process.env.MERCURY_DISABLE_BUBBLEWRAP === "true" ||
      process.env.DISABLE_BUBBLEWRAP === "1" ||
      process.env.DISABLE_BUBBLEWRAP === "true";
    const useBubblewrap = !disableBubblewrap;

    let proc: ReturnType<typeof spawn>;
    if (useBubblewrap) {
      const bwrapArgs = [
        ...buildBwrapArgs(payload.spaceWorkspace, ["pi"]),
        ...piArgs,
      ];
      proc = spawn("bwrap", bwrapArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
    } else {
      proc = spawn("pi", piArgs, {
        cwd: payload.spaceWorkspace,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
    }

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    proc.on("error", (error) => reject(error));

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`pi CLI failed (${code}): ${stderr || stdout}`));
        return;
      }
      const parsed = parsePiPrintJsonlOutput(stdout);
      if (parsed.piFailureMessage) {
        reject(new Error(parsed.piFailureMessage));
        return;
      }
      resolve({ reply: parsed.reply, usage: parsed.usage });
    });
  });
}

function budgetExceededMessage(budgetMs: number, last: Error): string {
  return `Model chain budget exceeded (${budgetMs}ms): ${last.message}`;
}

async function runModelChain(payload: Payload): Promise<PiJsonlParseResult> {
  const legs = parseModelLegsFromEnv();
  const capsPerLeg = parseModelChainCapabilitiesFromEnv(legs.length);
  const maxRetries = parseRetryMaxPerLeg();
  const budgetMs = parseChainBudgetMs();
  const started = Date.now();
  let lastErr = new Error("pi: no attempts");

  for (let li = 0; li < legs.length; li++) {
    const leg = legs[li];
    if (!leg) break;
    const { provider, model } = leg;
    const legCaps = capsPerLeg[li] ?? { ...DEFAULT_CAPABILITIES };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (Date.now() - started > budgetMs) {
        throw new Error(budgetExceededMessage(budgetMs, lastErr));
      }

      if (attempt > 0) {
        await sleep(backoffMs(attempt - 1));
        if (Date.now() - started > budgetMs) {
          throw new Error(budgetExceededMessage(budgetMs, lastErr));
        }
      }

      try {
        if (provider.toLowerCase() === "cursor") {
          throw new Error(
            'provider "cursor" is no longer supported. Use the model\'s native provider instead (e.g. provider: anthropic for Claude, provider: openai for GPT). See docs/configuration.md.',
          );
        }
        return await invokePiOnce(payload, provider, model, legCaps);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        lastErr = err;
        const cls = classifyPiFailure(err.message);
        if (cls === "failFast") throw err;
        if (cls === "fallbackable") break;
        if (cls === "retryable" && attempt < maxRetries) continue;
        break;
      }
    }
  }

  throw lastErr;
}

async function main() {
  resolveChromeBinaryEnv();
  const input = readFileSync(0, "utf8");
  let payload: Payload;
  try {
    payload = JSON.parse(input) as Payload;
  } catch {
    process.stderr.write("Failed to parse input payload\n");
    process.exit(1);
  }

  const { reply, usage } = await runModelChain(payload);

  const nonce = payload.nonce ?? "";
  const START = `---MERCURY_CONTAINER_RESULT_${nonce}_START---`;
  const END = `---MERCURY_CONTAINER_RESULT_${nonce}_END---`;

  process.stdout.write(`${START}\n`);
  process.stdout.write(JSON.stringify({ reply, usage }));
  process.stdout.write(`\n${END}\n`);
}

main().catch((error) => {
  process.stderr.write(String(error));
  process.exit(1);
});
