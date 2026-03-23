import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";

/**
 * Merge a minimal-context run (user prompt + assistant reply) into the session file.
 * Called after pi runs with --no-session; appends both messages so history stays correct.
 * Session file must exist (classifier only uses minimal when session has enough history).
 */
export async function mergeMinimalRunIntoSession(
  sessionFile: string,
  prompt: string,
  reply: string,
  _config: AppConfig,
): Promise<void> {
  try {
    const dir = path.dirname(sessionFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (!existsSync(sessionFile)) {
      logger.warn("Session file missing during merge, skipping", {
        sessionFile,
      });
      return;
    }

    const sessionManager = SessionManager.open(sessionFile);

    const userMessage = {
      role: "user" as const,
      content: [{ type: "text" as const, text: prompt }],
      timestamp: Date.now(),
    };

    const assistantMessage = {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: reply }],
      api: "mercury-merge",
      provider: "mercury",
      model: "merge",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop" as const,
      timestamp: Date.now(),
    };

    sessionManager.appendMessage(userMessage);
    sessionManager.appendMessage(assistantMessage);

    logger.debug("Merged minimal run into session", { sessionFile });
  } catch (err) {
    logger.error("Failed to merge minimal run into session", {
      sessionFile,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
