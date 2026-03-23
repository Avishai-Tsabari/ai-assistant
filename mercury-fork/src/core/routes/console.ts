import { spawnSync } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { Hono } from "hono";
import {
  EXTENSION_CATALOG,
  getCatalogEntryByName,
} from "../../extensions/catalog.js";
import {
  installExtensionFromDirectory,
  removeInstalledExtension,
  resolveExamplesExtensionDir,
} from "../../extensions/installer.js";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * JSON control-plane API (Bearer MERCURY_API_SECRET only).
 * Complements dashboard HTML forms for remote provisioning tools.
 */
export function createConsoleApp(opts: {
  projectRoot: string;
  packageRoot: string;
  apiSecret: string | undefined;
}): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    if (!opts.apiSecret) {
      return c.json(
        { error: "MERCURY_API_SECRET must be set for /api/console" },
        503,
      );
    }
    const auth = c.req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!safeCompare(token, opts.apiSecret)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });

  app.get("/extensions/catalog", (c) => {
    return c.json({
      extensions: EXTENSION_CATALOG.map((e) => ({
        name: e.name,
        sourceDir: e.sourceDir,
      })),
    });
  });

  app.post("/extensions/install", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      source?: string;
      catalogName?: string;
    };
    const source = typeof body.source === "string" ? body.source.trim() : "";
    const catalogName =
      typeof body.catalogName === "string" ? body.catalogName.trim() : "";

    if (catalogName) {
      const entry = getCatalogEntryByName(catalogName);
      if (!entry) {
        return c.json({ error: "Unknown catalog extension" }, 400);
      }
      const src = resolveExamplesExtensionDir(
        opts.packageRoot,
        entry.sourceDir,
      );
      if (!existsSync(src)) {
        return c.json(
          { error: "Bundled extension source not found on this install" },
          500,
        );
      }
      const result = await installExtensionFromDirectory({
        cwd: opts.projectRoot,
        sourceDir: src,
        destName: entry.name,
      });
      if (!result.ok) {
        return c.json({ error: result.error }, 500);
      }
      return c.json({ ok: true, name: entry.name });
    }

    if (source) {
      const r = spawnSync("mercury", ["add", source], {
        cwd: opts.projectRoot,
        encoding: "utf8",
        env: process.env,
      });
      if (r.status !== 0) {
        return c.json(
          {
            error: (r.stderr || r.stdout || "mercury add failed").trim(),
          },
          500,
        );
      }
      return c.json({ ok: true, log: (r.stdout || "").trim() });
    }

    return c.json(
      { error: "Provide JSON body { catalogName } or { source }" },
      400,
    );
  });

  app.delete("/extensions/:name", (c) => {
    const name = c.req.param("name");
    const result = removeInstalledExtension({ cwd: opts.projectRoot, name });
    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }
    return c.json({ ok: true });
  });

  return app;
}
