import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MercuryCoreRuntime } from "../src/core/runtime.js";

describe("Runtime compact command (user-facing reply)", () => {
  let tempDir: string;
  let runtime: MercuryCoreRuntime;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-compact-test-"));

    runtime = new MercuryCoreRuntime({
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
      admins: "",
      dbPath: path.join(tempDir, "state.db"),
      globalDir: path.join(tempDir, "global"),
      spacesDir: path.join(tempDir, "spaces"),
      whatsappAuthDir: path.join(tempDir, "whatsapp-auth"),
    });

    runtime.containerRunner.reply = mock(async () => ({
      reply: "mocked reply",
      files: [],
    }));

    runtime.db.ensureSpace("test-group");
    runtime.db.setRole("test-group", "admin1", "admin", "test");
  });

  afterEach(() => {
    runtime.rateLimiter.stopCleanup();
    runtime.db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("returns generic message when compaction fails (no session file)", async () => {
    const compactMessage = {
      platform: "test",
      spaceId: "test-group",
      text: "@Pi compact",
      callerId: "admin1",
      isDM: false,
      isReplyToBot: false,
      attachments: [],
    };

    const result = await runtime.handleRawInput(compactMessage, "chat-sdk");
    expect(result.type).toBe("command");
    expect(result.result?.reply).toBe(
      "Compaction failed. Check server logs for details.",
    );
    expect(result.result?.reply).not.toContain("No session file found");
  });
});
