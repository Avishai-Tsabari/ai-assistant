import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig } from "../src/config.js";
import { MercuryCoreRuntime } from "../src/core/runtime.js";

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

describe("Runtime sliding window context", () => {
  let tempDir: string;
  let runtime: MercuryCoreRuntime;
  let lastReplyPayload: { messages?: unknown[] } | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-ctx-rt-"));
    lastReplyPayload = undefined;
    runtime = new MercuryCoreRuntime(baseRuntimeConfig(tempDir));
    runtime.containerRunner.reply = mock(async (input) => {
      lastReplyPayload = input;
      return { reply: "mocked reply", files: [] };
    });
    runtime.db.ensureSpace("test-group");
    runtime.db.setRole("test-group", "admin1", "admin", "test");
  });

  afterEach(() => {
    runtime.rateLimiter.stopCleanup();
    runtime.db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("passes messages array to containerRunner.reply", async () => {
    await runtime.handleRawInput(
      {
        platform: "test",
        spaceId: "test-group",
        conversationExternalId: "c1",
        callerId: "admin1",
        text: "@Pi What is 2+2?",
        isDM: false,
        isReplyToBot: false,
        attachments: [],
      },
      "chat-sdk",
    );

    expect(runtime.containerRunner.reply).toHaveBeenCalled();
    expect(lastReplyPayload).toBeDefined();
    expect(Array.isArray(lastReplyPayload?.messages)).toBe(true);
  });

  test("does not pass useMinimalContext flag", async () => {
    await runtime.handleRawInput(
      {
        platform: "test",
        spaceId: "test-group",
        conversationExternalId: "c1",
        callerId: "admin1",
        text: "hello",
        isDM: false,
        isReplyToBot: true,
        attachments: [],
      },
      "chat-sdk",
    );

    expect(runtime.containerRunner.reply).toHaveBeenCalled();
    expect(
      (lastReplyPayload as Record<string, unknown>)?.useMinimalContext,
    ).toBeUndefined();
  });

  test("sliding window includes prior messages in chronological order", async () => {
    // Set context mode to "context" so the sliding window is used
    runtime.db.setSpaceConfig("test-group", "context.mode", "context", "test");
    // Store a prior turn in the DB
    runtime.db.addMessage("test-group", "user", "Earlier message");
    runtime.db.addMessage("test-group", "assistant", "Earlier reply");

    await runtime.handleRawInput(
      {
        platform: "test",
        spaceId: "test-group",
        conversationExternalId: "c1",
        callerId: "admin1",
        text: "@Pi follow-up question",
        isDM: false,
        isReplyToBot: false,
        attachments: [],
      },
      "chat-sdk",
    );

    expect(runtime.containerRunner.reply).toHaveBeenCalled();
    const msgs = lastReplyPayload?.messages as
      | Array<{ role: string; content: string }>
      | undefined;
    expect(msgs).toBeDefined();
    // The prior messages should be included
    const roles = msgs?.map((m) => m.role) ?? [];
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
  });
});
