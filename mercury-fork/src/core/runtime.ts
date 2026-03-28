import { ContainerError } from "../agent/container-error.js";
import { AgentContainerRunner } from "../agent/container-runner.js";
import { type AppConfig, resolveProjectPath } from "../config.js";
import { createMercuryExtensionContext } from "../extensions/context.js";
import { HookDispatcher } from "../extensions/hooks.js";
import type { ExtensionRegistry } from "../extensions/loader.js";
import type { MercuryExtensionContext } from "../extensions/types.js";
import { logger } from "../logger.js";
import { Db } from "../storage/db.js";
import {
  ensurePiResourceDir,
  ensureSpaceWorkspace,
} from "../storage/memory.js";
import type {
  ContainerResult,
  IngressMessage,
  MessageAttachment,
  MessageRunMeta,
  MessageSender,
  TokenUsage,
} from "../types.js";
import { hasPermission, resolveRole } from "./permissions.js";
import { RateLimiter } from "./rate-limiter.js";
import { type RouteResult, routeInput } from "./router.js";
import { SpaceQueue } from "./space-queue.js";
import { TaskScheduler } from "./task-scheduler.js";

export type InputSource = "cli" | "scheduler" | "chat-sdk";

export type ShutdownHook = () => Promise<void> | void;

function agentMetaFromUsage(
  usage: TokenUsage | undefined,
): MessageRunMeta["agent"] {
  if (!usage) return undefined;
  const a: NonNullable<MessageRunMeta["agent"]> = {};
  if (usage.inputTokens != null) a.inputTokens = usage.inputTokens;
  if (usage.outputTokens != null) a.outputTokens = usage.outputTokens;
  if (usage.totalTokens != null) a.totalTokens = usage.totalTokens;
  if (usage.cacheReadTokens != null) a.cacheReadTokens = usage.cacheReadTokens;
  if (usage.cacheWriteTokens != null)
    a.cacheWriteTokens = usage.cacheWriteTokens;
  if (usage.cost != null) a.cost = usage.cost;
  if (usage.model != null) a.model = usage.model;
  if (usage.provider != null) a.provider = usage.provider;
  if (Object.keys(a).length === 0) return undefined;
  return a;
}

function userTurnRunMeta(agentUsage?: TokenUsage): MessageRunMeta {
  const meta: MessageRunMeta = {};
  const agent = agentMetaFromUsage(agentUsage);
  if (agent) meta.agent = agent;
  return meta;
}

export class MercuryCoreRuntime {
  readonly db: Db;
  readonly scheduler: TaskScheduler;
  readonly queue: SpaceQueue;
  readonly containerRunner: AgentContainerRunner;
  readonly rateLimiter: RateLimiter;
  hooks: HookDispatcher | null = null;
  private extensionCtx: MercuryExtensionContext | null = null;
  private extensionRegistry: ExtensionRegistry | null = null;
  private readonly shutdownHooks: ShutdownHook[] = [];
  private shuttingDown = false;
  private signalHandlersInstalled = false;

  constructor(readonly config: AppConfig) {
    this.db = new Db(resolveProjectPath(config.dbPath));
    this.queue = new SpaceQueue(config.maxConcurrency);
    this.scheduler = new TaskScheduler(this.db);
    this.containerRunner = new AgentContainerRunner(config);
    this.rateLimiter = new RateLimiter(
      config.rateLimitPerUser,
      config.rateLimitWindowMs,
    );

    // Scaffold global (pi agent dir) and "main" (default space)
    ensurePiResourceDir(resolveProjectPath(config.globalDir));
    ensureSpaceWorkspace(resolveProjectPath(config.spacesDir), "main");
  }

  /**
   * Initialize the runtime — must be called before accepting work.
   * Cleans up any orphaned containers from previous runs.
   */
  async initialize(): Promise<void> {
    await this.containerRunner.cleanupOrphans();
    this.rateLimiter.startCleanup();
  }

  /**
   * Wire extension system into the runtime.
   * Must be called after extensions are loaded and before accepting messages.
   */
  initExtensions(registry: ExtensionRegistry): void {
    this.hooks = new HookDispatcher(registry, logger);
    this.extensionRegistry = registry;
    this.extensionCtx = createMercuryExtensionContext({
      db: this.db,
      config: this.config,
      log: logger,
    });
  }

  startScheduler(sender?: MessageSender): void {
    this.scheduler.start(async (task) => {
      const result = await this.executePrompt(
        task.spaceId,
        task.prompt,
        "scheduler",
        task.createdBy,
      );
      if (!task.silent && sender) {
        await sender.send(task.spaceId, result.reply, result.files);
      }
    });
  }

  stopScheduler(): void {
    this.scheduler.stop();
  }

  async handleRawInput(
    message: IngressMessage,
    source: Exclude<InputSource, "scheduler">,
  ): Promise<RouteResult & { result?: ContainerResult }> {
    const route = routeInput({
      text: message.text,
      spaceId: message.spaceId,
      callerId: message.callerId,
      isDM: message.isDM,
      isReplyToBot: message.isReplyToBot,
      db: this.db,
      config: this.config,
      attachments: message.attachments,
      hadIncomingAttachments: message.hadIncomingAttachments,
    });

    if (route.type === "command") {
      const reply = await this.executeCommand(message.spaceId, route.command);
      return { ...route, result: { reply, files: [] } };
    }

    // Check mute — silently drop messages from muted users
    if (
      route.type === "assistant" &&
      this.db.isMuted(message.spaceId, message.callerId)
    ) {
      return { type: "ignore" };
    }

    // Check rate limit for assistant requests (not commands, not ignored messages)
    if (route.type === "assistant") {
      // Check per-group override first
      const groupLimit = this.db.getSpaceConfig(message.spaceId, "rate_limit");
      const effectiveLimit = groupLimit
        ? Number.parseInt(groupLimit, 10)
        : this.config.rateLimitPerUser;

      if (
        effectiveLimit > 0 &&
        !this.checkRateLimit(message.spaceId, message.callerId, effectiveLimit)
      ) {
        return {
          type: "denied",
          reason: "Rate limit exceeded. Try again shortly.",
        };
      }
    }

    if (route.type !== "assistant") {
      // Store ambient messages in group chats (non-triggered, non-DM)
      // Default: enabled. Set ambient.enabled=false for tag-only mode.
      const ambientEnabled =
        this.db.getSpaceConfig(message.spaceId, "ambient.enabled") !== "false";
      if (
        route.type === "ignore" &&
        source === "chat-sdk" &&
        !message.isDM &&
        ambientEnabled
      ) {
        const ambientText = message.authorName
          ? `${message.authorName}: ${message.text.trim()}`
          : message.text.trim();

        if (ambientText) {
          this.db.ensureSpace(message.spaceId);
          this.db.addMessage(message.spaceId, "ambient", ambientText);
        }
      }

      return route;
    }

    const noPromptText = !message.text.trim();
    const noSavedFiles = (message.attachments?.length ?? 0) === 0;
    if (
      noPromptText &&
      noSavedFiles &&
      (message.hadIncomingAttachments ?? false)
    ) {
      return {
        type: "denied",
        reason:
          "Could not use your attachment (media disabled, over the size limit, or download failed). Check MERCURY_MEDIA_ENABLED and logs.",
      };
    }

    try {
      const result = await this.executePrompt(
        message.spaceId,
        route.prompt,
        source,
        message.callerId,
        message.attachments,
        message.authorName,
      );
      return { ...route, result };
    } catch (error) {
      if (error instanceof ContainerError) {
        switch (error.reason) {
          case "aborted":
            return { type: "denied", reason: "Stopped current run." };
          case "timeout":
            return { type: "denied", reason: "Container timed out." };
          case "oom":
            return {
              type: "denied",
              reason: "Container was killed (possibly out of memory).",
            };
          case "error": {
            logger.error(
              "Container error",
              error instanceof Error ? error : undefined,
            );
            const errMsg = error.message.toLowerCase();
            const isQuota = /429|quota|rate.?limit|billing/.test(errMsg);
            if (isQuota) {
              return {
                type: "denied",
                reason:
                  "AI model quota exceeded. Check your plan and billing, or switch to a different model in .env.",
              };
            }
            return {
              type: "denied",
              reason: "The AI request failed. Check server logs for details.",
            };
          }
        }
      }
      throw error;
    }
  }

  /**
   * Check if a request is allowed under rate limiting.
   * Uses per-group override if set, otherwise uses the default limit.
   */
  private checkRateLimit(
    spaceId: string,
    userId: string,
    effectiveLimit: number,
  ): boolean {
    return this.rateLimiter.isAllowed(spaceId, userId, effectiveLimit);
  }

  private async executeCommand(
    spaceId: string,
    command: string,
  ): Promise<string> {
    switch (command) {
      case "stop": {
        const stopped = this.containerRunner.abort(spaceId);
        const dropped = this.queue.cancelPending(spaceId);
        if (stopped)
          return `Stopped.${dropped > 0 ? ` Dropped ${dropped} queued request(s).` : ""}`;
        if (dropped > 0) return `Dropped ${dropped} queued request(s).`;
        return "No active run.";
      }
      case "compact": {
        this.db.setSessionBoundaryToLatest(spaceId);
        return "Compacted.";
      }
      case "clear": {
        this.db.setClearBoundary(spaceId);
        return "Cleared.";
      }
      default:
        return `Unknown command: ${command}`;
    }
  }

  onShutdown(hook: ShutdownHook): void {
    this.shutdownHooks.push(hook);
  }

  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  installSignalHandlers(): void {
    if (this.signalHandlersInstalled) return;
    this.signalHandlersInstalled = true;

    let forceCount = 0;

    const handler = (signal: string) => {
      if (this.shuttingDown) {
        forceCount++;
        if (forceCount >= 1) {
          logger.warn("Second signal received, forcing exit");
          process.exit(1);
        }
        return;
      }
      logger.info("Received signal, starting graceful shutdown", { signal });
      void this.shutdown().then(
        () => process.exit(0),
        (err) => {
          logger.error(
            "Shutdown failed",
            err instanceof Error ? err : undefined,
          );
          process.exit(1);
        },
      );
    };

    process.on("SIGTERM", () => handler("SIGTERM"));
    process.on("SIGINT", () => handler("SIGINT"));
  }

  async shutdown(timeoutMs = 10_000): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    const forceTimer = setTimeout(() => {
      logger.error("Shutdown timed out, forcing exit");
      process.exit(1);
    }, timeoutMs);
    // Don't keep the process alive just for this timer
    if (forceTimer.unref) forceTimer.unref();

    try {
      // 1. Stop schedulers
      logger.info("Shutdown: stopping task scheduler");
      this.scheduler.stop();

      // 2. Drain queue — cancel pending, wait for active
      logger.info("Shutdown: draining group queue");
      const dropped = this.queue.cancelAll();
      if (dropped > 0)
        logger.info("Shutdown: cancelled pending queue entries", {
          count: dropped,
        });

      // 3. Kill running containers
      logger.info("Shutdown: stopping running containers");
      this.containerRunner.killAll();

      // 4. Wait for active work to finish (with a shorter timeout)
      const drainTimeout = Math.max(timeoutMs - 2000, 1000);
      const drained = await this.queue.waitForActive(drainTimeout);
      if (!drained) {
        logger.warn("Shutdown: active work did not finish in time");
      }

      // 5. Emit extension shutdown hooks
      if (this.hooks && this.extensionCtx) {
        logger.info("Shutdown: notifying extensions");
        await this.hooks.emit("shutdown", {}, this.extensionCtx);
      }

      // 6. Run registered shutdown hooks (adapters, server, etc.)
      for (const hook of this.shutdownHooks) {
        try {
          await hook();
        } catch (err) {
          logger.error(
            "Shutdown hook failed",
            err instanceof Error ? err : undefined,
          );
        }
      }

      // 6. Stop rate limiter cleanup
      this.rateLimiter.stopCleanup();

      // 7. Close database
      logger.info("Shutdown: closing database");
      this.db.close();

      logger.info("Shutdown: complete");
    } finally {
      clearTimeout(forceTimer);
    }
  }

  private async executePrompt(
    spaceId: string,
    prompt: string,
    _source: InputSource,
    callerId: string,
    attachments?: MessageAttachment[],
    authorName?: string,
  ): Promise<ContainerResult> {
    this.db.ensureSpace(spaceId);

    return this.queue.enqueue(spaceId, async () => {
      const workspace = ensureSpaceWorkspace(
        resolveProjectPath(this.config.spacesDir),
        spaceId,
      );

      // Container-relative workspace path
      const containerWorkspace = `/spaces/${spaceId}`;

      // Emit workspace_init hook (extensions should be idempotent)
      if (this.hooks && this.extensionCtx) {
        await this.hooks.emit(
          "workspace_init",
          { spaceId, workspace, containerWorkspace },
          this.extensionCtx,
        );
      }

      // Emit before_container hook
      let extraEnv: Record<string, string> | undefined;
      let finalPrompt = prompt;
      if (this.hooks && this.extensionCtx) {
        const result = await this.hooks.emitBeforeContainer(
          {
            spaceId,
            prompt,
            callerId,
            workspace,
            containerWorkspace,
            attachments,
          },
          this.extensionCtx,
        );
        if (result?.block) {
          return { reply: result.block.reason, files: [] };
        }
        if (result) {
          if (result.env) {
            extraEnv = { ...extraEnv, ...result.env };
          }
          if (result.systemPrompt) {
            extraEnv = {
              ...extraEnv,
              MERCURY_EXT_SYSTEM_PROMPT: result.systemPrompt,
            };
          }
          if (result.promptAppend) {
            finalPrompt = [prompt, result.promptAppend]
              .filter(Boolean)
              .join("\n\n");
          }
        }
      }

      // Fetch prior completed turns BEFORE storing the current message,
      // so the current prompt doesn't appear twice (once in history, once as prompt).
      const history = this.db.getRecentTurns(spaceId, 10);
      // One-shot clear: reset temporary boundary immediately after reading history.
      this.db.resetClearBoundary(spaceId);

      const userMessageId = this.db.addMessage(
        spaceId,
        "user",
        finalPrompt,
        attachments,
      );

      // Compute caller role, denied CLIs, and permitted env vars
      let callerRole = "member";
      if (this.extensionRegistry) {
        const seededAdmins = this.config.admins
          ? this.config.admins
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        callerRole = resolveRole(this.db, spaceId, callerId, seededAdmins);

        const cliExtensions = this.extensionRegistry.getCliExtensions();
        if (cliExtensions.length > 0) {
          const denied = cliExtensions
            .filter(
              (ext) =>
                ext.clis.length > 0 &&
                !hasPermission(this.db, spaceId, callerRole, ext.name),
            )
            .flatMap((ext) => ext.clis.map((c) => c.name));
          if (denied.length > 0) {
            extraEnv = {
              ...extraEnv,
              MERCURY_DENIED_CLIS: denied.join(","),
            };
          }
        }

        // Inject extension env vars only when caller has permission
        for (const ext of this.extensionRegistry.list()) {
          if (ext.envVars.length === 0) continue;
          if (
            ext.permission &&
            !hasPermission(this.db, spaceId, callerRole, ext.name)
          )
            continue;
          for (const envDef of ext.envVars) {
            const value = process.env[envDef.from];
            if (value) {
              const containerKey =
                envDef.as ?? envDef.from.replace(/^MERCURY_/, "");
              extraEnv = { ...extraEnv, [containerKey]: value };
            }
          }
        }
      }

      const startTime = Date.now();

      const preferences = this.db.listSpacePreferences(spaceId).map((p) => ({
        key: p.key,
        value: p.value,
      }));

      let containerResult: ContainerResult;
      try {
        containerResult = await this.containerRunner.reply({
          spaceId,
          spaceWorkspace: workspace,
          messages: history,
          prompt: finalPrompt,
          callerId,
          callerRole,
          authorName,
          attachments,
          preferences,
          extraEnv,
          claimedEnvSources: this.extensionRegistry?.getClaimedEnvSources(),
        });
      } catch (err) {
        this.db.updateMessageRunMeta(userMessageId, userTurnRunMeta(undefined));
        throw err;
      }

      const durationMs = Date.now() - startTime;

      // Emit after_container hook
      if (this.hooks && this.extensionCtx) {
        const hookResult = await this.hooks.emitAfterContainer(
          {
            spaceId,
            workspace,
            callerId,
            prompt: finalPrompt,
            reply: containerResult.reply,
            durationMs,
          },
          this.extensionCtx,
        );
        if (hookResult?.suppress) {
          this.db.updateMessageRunMeta(
            userMessageId,
            userTurnRunMeta(containerResult.usage),
          );
          return { reply: "", files: [] };
        }
        if (hookResult?.reply !== undefined) {
          containerResult.reply = hookResult.reply;
        }
        if (hookResult?.files?.length) {
          containerResult.files = [
            ...containerResult.files,
            ...hookResult.files,
          ];
        }
      }

      this.db.addMessage(spaceId, "assistant", containerResult.reply);

      if (containerResult.usage) {
        this.db.recordUsage(spaceId, containerResult.usage);
      } else {
        logger.debug(
          "Container run finished without token usage (old agent image, non-JSON pi output, or zero reported usage)",
          { spaceId },
        );
      }

      this.db.updateMessageRunMeta(
        userMessageId,
        userTurnRunMeta(containerResult.usage),
      );

      return containerResult;
    });
  }
}
