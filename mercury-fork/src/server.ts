import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Adapter } from "chat";
import { Hono } from "hono";
import type { WhatsAppBaileysAdapter } from "./adapters/whatsapp.js";
import type { AppConfig } from "./config.js";
import { createApiApp } from "./core/api.js";
import { createChatRoute } from "./core/routes/chat.js";
import { createConsoleApp } from "./core/routes/console.js";
import { createDashboardRoutes } from "./core/routes/dashboard.js";
import type { MercuryCoreRuntime } from "./core/runtime.js";
import type { ConfigRegistry } from "./extensions/config-registry.js";
import { createMercuryExtensionContext } from "./extensions/context.js";
import type { ExtensionRegistry } from "./extensions/loader.js";
import { logger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAX_BODY_SIZE = 50 * 1024 * 1024; // 50 MB

type WaitUntil = (task: Promise<unknown>) => void;

type WebhookHandler = (
  request: Request,
  options?: { waitUntil?: WaitUntil },
) => Promise<Response>;

export interface ServerContext {
  core: MercuryCoreRuntime;
  config: AppConfig;
  adapters: Record<string, Adapter>;
  webhooks: Record<string, WebhookHandler>;
  startTime: number;
  registry: ExtensionRegistry;
  configRegistry: ConfigRegistry;
  /** Current Mercury project directory (usually `process.cwd()`). */
  projectRoot: string;
  /** Root of the mercury-ai package (for bundled `examples/extensions`). */
  packageRoot: string;
}

export function createApp(ctx: ServerContext): Hono {
  const {
    core,
    config,
    adapters,
    webhooks,
    startTime,
    projectRoot,
    packageRoot,
  } = ctx;

  const waitUntil: WaitUntil = (task) => {
    void task.catch((error) => {
      logger.error(
        "Background task failed",
        error instanceof Error ? error : undefined,
      );
    });
  };

  const app = new Hono();

  // ─── Body Size Limit ──────────────────────────────────────────────────
  app.use("*", async (c, next) => {
    const contentLength = c.req.header("content-length");
    if (contentLength && Number.parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return c.json({ error: "Request body too large" }, 413);
    }
    await next();
  });

  // ─── Dashboard Auth ───────────────────────────────────────────────────

  // ─── Dashboard ──────────────────────────────────────────────────────────

  // Cache dashboard HTML at startup
  let dashboardHtml: string | null = null;
  try {
    dashboardHtml = readFileSync(
      join(__dirname, "dashboard/index.html"),
      "utf8",
    );
  } catch {
    // Dashboard not found — will return 404
  }

  app.get("/", (c) => {
    if (!dashboardHtml) return c.text("Dashboard not found", 404);
    return c.html(dashboardHtml);
  });

  app.get("/dashboard", (c) => {
    if (!dashboardHtml) return c.text("Dashboard not found", 404);
    return c.html(dashboardHtml);
  });

  // Dashboard partials (htmx)
  const adapterStatus: Record<string, boolean> = {};
  for (const name of Object.keys(adapters)) {
    adapterStatus[name] = true;
  }

  const dashboardRoutes = createDashboardRoutes({
    core,
    adapters: adapterStatus,
    startTime,
    registry: ctx.registry,
    configRegistry: ctx.configRegistry,
    extensionCtx: createMercuryExtensionContext({
      db: core.db,
      config,
      log: logger,
    }),
    projectRoot,
    packageRoot,
  });

  app.use("/dashboard/*", async (c, next) => {
    const secret = config.apiSecret;
    if (secret) {
      const authHeader = c.req.header("authorization");
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : undefined;
      const cookie = c.req.header("cookie");
      const cookieToken = cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("mercury_token="))
        ?.split("=")[1];

      const provided = token || cookieToken;
      if (
        !provided ||
        provided.length !== secret.length ||
        !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
      ) {
        return c.json({ error: "Unauthorized" }, 401);
      }
    }
    await next();
  });
  app.route("/dashboard", dashboardRoutes);

  // ─── Health & Auth ──────────────────────────────────────────────────────

  app.get("/health", (c) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const adapterStatus: Record<string, boolean> = {};
    for (const name of Object.keys(adapters)) {
      adapterStatus[name] = true;
    }
    return c.json({
      status: "ok",
      version:
        process.env.MERCURY_VERSION ??
        process.env.npm_package_version ??
        "unknown",
      uptime: uptimeSeconds,
      queue: {
        active: core.queue.activeCount,
        pending: core.queue.pendingCount,
      },
      containers: {
        active: core.containerRunner.activeCount,
      },
      adapters: adapterStatus,
    });
  });

  app.get("/auth/whatsapp", (c) => {
    const whatsappAdapter = adapters.whatsapp as
      | WhatsAppBaileysAdapter
      | undefined;
    if (!whatsappAdapter) {
      return c.json({ error: "WhatsApp adapter not enabled" }, 400);
    }
    const status = whatsappAdapter.getQrStatus();
    return c.json(status);
  });

  // ─── Control plane JSON API (Bearer MERCURY_API_SECRET) ─────────────────
  const consoleApp = createConsoleApp({
    projectRoot,
    packageRoot,
    apiSecret: config.apiSecret,
    db: core.db,
    spacesDir: config.spacesDir,
    dbPath: config.dbPath,
  });
  app.route("/api/console", consoleApp);

  // ─── Internal API ───────────────────────────────────────────────────────

  const apiApp = createApiApp({
    db: core.db,
    config,
    containerRunner: core.containerRunner,
    queue: core.queue,
    scheduler: core.scheduler,
    registry: ctx.registry,
    configRegistry: ctx.configRegistry,
  });

  app.route("/api", apiApp);
  app.route("/chat", createChatRoute(core));

  // ─── Webhooks ───────────────────────────────────────────────────────────

  app.all("/webhooks/:platform", async (c) => {
    const platform = c.req.param("platform");
    logger.info("Webhook dispatch", { platform });

    const handler = webhooks[platform];
    if (!handler) {
      return c.text(`Unknown platform: ${platform}`, 404);
    }

    return handler(c.req.raw, { waitUntil });
  });

  // ─── Fallback ───────────────────────────────────────────────────────────

  app.all("*", (c) => {
    return c.text("Not found", 404);
  });

  return app;
}
