import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig } from "../src/config.js";
import * as compact from "../src/core/compact.js";
import { MercuryCoreRuntime } from "../src/core/runtime.js";

function writePiSessionJsonl(filePath: string, messageCount: number) {
  const lines: string[] = [
    JSON.stringify({
      type: "session",
      version: 3,
      id: "test-id",
      timestamp: new Date().toISOString(),
      cwd: "/spaces/test-group",
    }),
  ];
  for (let i = 0; i < messageCount; i++) {
    lines.push(
      JSON.stringify({
        type: "message",
        id: `msg-${i}`,
        parentId: i === 0 ? null : `msg-${i - 1}`,
        timestamp: new Date().toISOString(),
        message: { role: "user", content: [{ type: "text", text: "hi" }] },
      }),
    );
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join("\n"));
}

function baseRuntimeConfig(tempDir: string): AppConfig {
  return {
    modelProvider: "anthropic",
    model: "claude-sonnet-4-20250514",
    triggerPatterns: "@Pi,Pi",
    triggerMatch: "mention",
    dataDir: tempDir,
    authPath: undefined,
    agentContainerImage: "test",
    containerTimeoutMs: 60000,
    maxConcurrency: 2,
    rateLimitPerUser: 0,
    rateLimitWindowMs: 60000,
    port: 8787,
    botUsername: "mercury",
    discordGatewayDurationMs: 600000,
    discordGatewaySecret: undefined,
    enableWhatsApp: false,
    enableSlack: false,
    enableDiscord: false,
    enableTeams: false,
    enableTelegram: false,
    admins: "admin1",
    dbPath: path.join(tempDir, "state.db"),
    globalDir: path.join(tempDir, "global"),
    spacesDir: path.join(tempDir, "spaces"),
    whatsappAuthDir: path.join(tempDir, "whatsapp-auth"),
    conditionalContextEnabled: true,
    contextClassifier: "heuristic",
    resolvedModelChain: [
      { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    ],
    resolvedModelChainCapabilities: [
      {
        tools: true,
        vision: false,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    ],
    parsedModelCapabilitiesEnv: null,
    effectiveModelChainBudgetMs: 120_000,
  } as AppConfig;
}

describe("Runtime conditional context (reply-to-bot)", () => {
  let tempDir: string;
  let runtime: MercuryCoreRuntime;
  let lastReplyPayload: { useMinimalContext?: boolean } | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-ctx-rt-"));
    lastReplyPayload = undefined;
    runtime = new MercuryCoreRuntime(baseRuntimeConfig(tempDir));
    runtime.containerRunner.reply = mock(async (input) => {
      lastReplyPayload = input;
      return {
        reply: "mocked reply",
        files: [],
      };
    });
    runtime.db.ensureSpace("test-group");
    runtime.db.setRole("test-group", "admin1", "admin", "test");
    const sessionPath = path.join(
      tempDir,
      "spaces",
      "test-group",
      ".mercury.session.jsonl",
    );
    writePiSessionJsonl(sessionPath, 2);
  });

  afterEach(() => {
    runtime.rateLimiter.stopCleanup();
    runtime.db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("reply-to-bot still allows minimal context for standalone prompts", async () => {
    const msg = {
      platform: "test",
      spaceId: "test-group",
      conversationExternalId: "c1",
      callerId: "admin1",
      text: "What is 2+2?",
      isDM: false,
      isReplyToBot: true,
      attachments: [],
    };

    await runtime.handleRawInput(msg, "chat-sdk");

    expect(runtime.containerRunner.reply).toHaveBeenCalled();
    expect(lastReplyPayload?.useMinimalContext).toBe(true);
  });
});

describe("Runtime auto-compact", () => {
  describe("when session exceeds threshold", () => {
    let tempDir: string;
    let runtime: MercuryCoreRuntime;
    let compactSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-autocpt-"));
      const cfg = {
        ...baseRuntimeConfig(tempDir),
        conditionalContextEnabled: false,
        autoCompactThreshold: 2,
      } as AppConfig;
      runtime = new MercuryCoreRuntime(cfg);
      runtime.containerRunner.reply = mock(async () => ({
        reply: "ok",
        files: [],
      }));
      runtime.db.ensureSpace("test-group");
      runtime.db.setRole("test-group", "admin1", "admin", "test");
      const sessionPath = path.join(
        tempDir,
        "spaces",
        "test-group",
        ".mercury.session.jsonl",
      );
      writePiSessionJsonl(sessionPath, 5);

      compactSpy = spyOn(compact, "compactSession").mockResolvedValue({
        compacted: true,
        summary: "s",
        tokensBefore: 100,
      });
    });

    afterEach(() => {
      compactSpy.mockRestore();
      runtime.rateLimiter.stopCleanup();
      runtime.db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test("triggers compactSession when session entries exceed threshold", async () => {
      await runtime.handleRawInput(
        {
          platform: "test",
          spaceId: "test-group",
          conversationExternalId: "c1",
          callerId: "admin1",
          text: "@Pi hello",
          isDM: false,
          isReplyToBot: false,
          attachments: [],
        },
        "chat-sdk",
      );

      await new Promise((r) => setTimeout(r, 50));
      expect(compactSpy).toHaveBeenCalled();
    });
  });

  describe("when session is below threshold", () => {
    let tempDir: string;
    let runtime: MercuryCoreRuntime;
    let compactSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-autocpt2-"));
      const cfg = {
        ...baseRuntimeConfig(tempDir),
        conditionalContextEnabled: false,
        autoCompactThreshold: 10_000,
      } as AppConfig;
      runtime = new MercuryCoreRuntime(cfg);
      runtime.containerRunner.reply = mock(async () => ({
        reply: "ok",
        files: [],
      }));
      runtime.db.ensureSpace("test-group");
      runtime.db.setRole("test-group", "admin1", "admin", "test");
      const sessionPath = path.join(
        tempDir,
        "spaces",
        "test-group",
        ".mercury.session.jsonl",
      );
      writePiSessionJsonl(sessionPath, 5);

      compactSpy = spyOn(compact, "compactSession").mockResolvedValue({
        compacted: true,
      });
    });

    afterEach(() => {
      compactSpy.mockRestore();
      runtime.rateLimiter.stopCleanup();
      runtime.db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test("does not call compactSession", async () => {
      await runtime.handleRawInput(
        {
          platform: "test",
          spaceId: "test-group",
          conversationExternalId: "c1",
          callerId: "admin1",
          text: "@Pi hello",
          isDM: false,
          isReplyToBot: false,
          attachments: [],
        },
        "chat-sdk",
      );

      await new Promise((r) => setTimeout(r, 50));
      expect(compactSpy).not.toHaveBeenCalled();
    });
  });
});

describe("countSessionEntries", () => {
  test("returns 0 for missing file", () => {
    expect(compact.countSessionEntries("/nonexistent/nope.jsonl")).toBe(0);
  });

  test("counts pi session entries", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-sess-ct-"));
    try {
      const p = path.join(dir, ".mercury.session.jsonl");
      writePiSessionJsonl(p, 3);
      expect(compact.countSessionEntries(p)).toBeGreaterThanOrEqual(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
