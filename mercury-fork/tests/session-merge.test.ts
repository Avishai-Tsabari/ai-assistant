import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import type { AppConfig } from "../src/config.js";
import { mergeMinimalRunIntoSession } from "../src/core/session-merge.js";

let tmpDir: string;
let sessionFile: string;
const baseConfig = {} as AppConfig;

function createInitialSession() {
  const sessionDir = path.dirname(sessionFile);
  fs.mkdirSync(sessionDir, { recursive: true });
  const sm = SessionManager.create("/spaces/test", sessionDir);
  sm.setSessionFile(sessionFile);
  sm.appendMessage({
    role: "user",
    content: [{ type: "text", text: "hello" }],
    timestamp: Date.now(),
  });
  sm.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "Hi there!" }],
    timestamp: Date.now(),
  });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-merge-"));
  sessionFile = path.join(tmpDir, ".mercury.session.jsonl");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("mergeMinimalRunIntoSession", () => {
  test("appends user and assistant messages to existing session", async () => {
    createInitialSession();
    const prompt = "what is 2+2?";
    const reply = "2+2 equals 4.";

    await mergeMinimalRunIntoSession(sessionFile, prompt, reply, baseConfig);

    const content = fs.readFileSync(sessionFile, "utf8");
    const lines = content.trim().split(/\r?\n/).filter(Boolean);
    const entries = lines.map((line, i) => {
      try {
        return JSON.parse(line.trim());
      } catch (e) {
        throw new Error(
          `Parse error at line ${i + 1}: ${line.slice(0, 80)}...`,
        );
      }
    });

    expect(entries.length).toBe(5); // header + 2 original + 2 new
    const lastTwo = entries.slice(-2);
    expect(lastTwo[0].type).toBe("message");
    expect(lastTwo[0].message.role).toBe("user");
    expect(lastTwo[0].message.content[0].text).toBe(prompt);

    expect(lastTwo[1].type).toBe("message");
    expect(lastTwo[1].message.role).toBe("assistant");
    expect(lastTwo[1].message.content[0].text).toBe(reply);
  });

  test("skips merge when session file does not exist", async () => {
    await mergeMinimalRunIntoSession(sessionFile, "hello", "hi", baseConfig);
    expect(fs.existsSync(sessionFile)).toBe(false);
  });
});
