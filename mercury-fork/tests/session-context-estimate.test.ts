import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.js";
import { getSessionContextEstimate } from "../src/core/session-context-estimate.js";

describe("getSessionContextEstimate", () => {
  test("no session file", () => {
    process.env.MERCURY_CONFIG_FILE = "";
    const tmpRoot = path.join(tmpdir(), `mercury-sess-est-${Date.now()}`);
    mkdirSync(path.join(tmpRoot, "space-a"), { recursive: true });
    try {
      const config = { ...loadConfig(), spacesDir: tmpRoot };
      const r = getSessionContextEstimate(config, "space-a");
      expect(r).toEqual({ ok: false, reason: "no_session_file" });
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
