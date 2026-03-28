import { execSync } from "node:child_process";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { NodeAgentConfig } from "./config.js";
import {
  getContainerStatus,
  listContainers,
  listImages,
  pullImage,
  removeContainer,
  restartContainer,
  startContainer,
  stopContainer,
  streamLogs,
} from "./docker.js";
import { getNodeHealth } from "./system.js";

export function createRoutes(config: NodeAgentConfig): Hono {
  const app = new Hono();

  // ─── Auth middleware ─────────────────────────────────────────────────
  app.use("*", async (c, next) => {
    // Skip auth for health endpoint
    if (c.req.path === "/health") return next();

    const authHeader = c.req.header("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    if (!token || token !== config.token) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });

  // ─── Node health ────────────────────────────────────────────────────
  app.get("/health", (c) => {
    const containers = listContainers();
    return c.json(getNodeHealth(containers.length));
  });

  // ─── Container lifecycle ────────────────────────────────────────────

  app.post("/containers/start", async (c) => {
    const body = await c.req.json<{
      agentId: string;
      image: string;
      env: Record<string, string>;
      memoryMb?: number;
      cpus?: string;
      labels?: Record<string, string>;
    }>();

    if (!body.agentId || !body.image) {
      return c.json({ error: "agentId and image are required" }, 400);
    }

    try {
      const containerId = startContainer(body, config);
      return c.json({ containerId, status: "started" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Failed to start container: ${message}` }, 500);
    }
  });

  app.post("/containers/:agentId/stop", (c) => {
    const agentId = c.req.param("agentId");
    try {
      stopContainer(agentId);
      return c.json({ status: "stopped" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Failed to stop container: ${message}` }, 500);
    }
  });

  app.post("/containers/:agentId/restart", (c) => {
    const agentId = c.req.param("agentId");
    try {
      restartContainer(agentId);
      return c.json({ status: "restarted" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json(
        { error: `Failed to restart container: ${message}` },
        500,
      );
    }
  });

  app.delete("/containers/:agentId", (c) => {
    const agentId = c.req.param("agentId");
    try {
      removeContainer(agentId);
      return c.json({ status: "removed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json(
        { error: `Failed to remove container: ${message}` },
        500,
      );
    }
  });

  app.get("/containers/:agentId/status", (c) => {
    const agentId = c.req.param("agentId");
    const status = getContainerStatus(agentId);
    return c.json(status);
  });

  app.get("/containers", (c) => {
    return c.json(listContainers());
  });

  // ─── Log streaming ──────────────────────────────────────────────────

  app.get("/containers/:agentId/logs", (c) => {
    const agentId = c.req.param("agentId");
    const tail = Number.parseInt(c.req.query("tail") ?? "100", 10);
    const follow = c.req.query("follow") === "true";

    if (!follow) {
      // Non-streaming: return recent logs as JSON
      try {
        const output = execSync(
          `docker logs --tail ${tail} mercury-agent-${agentId}`,
          { encoding: "utf-8", timeout: 10_000 },
        );
        return c.json({ logs: output });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: `Failed to get logs: ${message}` }, 500);
      }
    }

    // Streaming: SSE
    return streamSSE(c, async (stream) => {
      const proc = streamLogs(agentId, tail);

      proc.stdout?.on("data", (data: Buffer) => {
        void stream.writeSSE({ data: data.toString("utf-8"), event: "log" });
      });

      proc.stderr?.on("data", (data: Buffer) => {
        void stream.writeSSE({ data: data.toString("utf-8"), event: "log" });
      });

      await new Promise<void>((resolve) => {
        proc.on("close", resolve);
        stream.onAbort(() => {
          proc.kill();
          resolve();
        });
      });
    });
  });

  // ─── Image management ───────────────────────────────────────────────

  app.post("/images/pull", async (c) => {
    const body = await c.req.json<{ image: string }>();
    if (!body.image) {
      return c.json({ error: "image is required" }, 400);
    }

    try {
      const updated = pullImage(body.image);
      return c.json({ status: updated ? "pulled" : "already_latest" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Failed to pull image: ${message}` }, 500);
    }
  });

  app.get("/images", (c) => {
    return c.json(listImages());
  });

  return app;
}
