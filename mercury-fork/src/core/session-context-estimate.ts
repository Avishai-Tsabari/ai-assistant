import { existsSync } from "node:fs";
import path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import {
  buildSessionContext,
  DEFAULT_COMPACTION_SETTINGS,
  estimateTokens,
  SessionManager,
  shouldCompact,
} from "@mariozechner/pi-coding-agent";
import { type AppConfig, resolveProjectPath } from "../config.js";

export type SessionContextEstimate =
  | {
      ok: true;
      estimatedTokens: number;
      contextWindow: number | null;
      percentUsed: number | null;
      modelProvider: string | null;
      modelId: string | null;
      shouldCompact: boolean;
      messageCount: number;
    }
  | {
      ok: false;
      reason: "no_session_file" | "empty_session" | "read_error";
      detail?: string;
    };

function sessionFilePathForSpace(config: AppConfig, spaceId: string): string {
  const root = resolveProjectPath(config.spacesDir);
  return path.join(root, spaceId, ".mercury.session.jsonl");
}

function mergeCompactionSettings(config: AppConfig) {
  return {
    ...DEFAULT_COMPACTION_SETTINGS,
    ...(config.compactKeepRecentTokens != null
      ? { keepRecentTokens: config.compactKeepRecentTokens }
      : {}),
  };
}

/**
 * Approximate serialized LLM context size from the messages pi would send next.
 *
 * We sum pi's `estimateTokens` per message instead of using the last assistant's
 * API `usage` field: that usage is frozen at request time and stays large after
 * compaction even though `buildSessionContext` already reflects the compacted tail.
 */
function estimateContextTokensFromMessages(messages: AgentMessage[]): number {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m);
  }
  return total;
}

/**
 * Read-only estimate of tokens in the current pi session (for compaction decisions).
 * Does not call any LLM.
 */
export function getSessionContextEstimate(
  config: AppConfig,
  spaceId: string,
): SessionContextEstimate {
  const sessionFile = sessionFilePathForSpace(config, spaceId);

  if (!existsSync(sessionFile)) {
    return { ok: false, reason: "no_session_file" };
  }

  try {
    const sessionManager = SessionManager.open(sessionFile);
    const entries = sessionManager.getEntries();

    if (entries.length === 0) {
      return { ok: false, reason: "empty_session" };
    }

    const leafId = sessionManager.getLeafId();
    const ctx = buildSessionContext(entries, leafId);
    const messages = ctx.messages;
    const estimatedTokens = estimateContextTokensFromMessages(messages);

    let contextWindow: number | null = null;
    let modelProvider: string | null = null;
    let modelId: string | null = null;

    const model = ctx.model;
    if (model?.provider && model.modelId) {
      modelProvider = model.provider;
      modelId = model.modelId;
      try {
        const resolved = (
          getModel as (
            provider: string,
            modelId: string,
          ) => { contextWindow?: number }
        )(model.provider, model.modelId);
        contextWindow = resolved.contextWindow ?? null;
      } catch {
        contextWindow = null;
      }
    }

    const compactionSettings = mergeCompactionSettings(config);
    const shouldCompactHint =
      contextWindow != null && contextWindow > 0
        ? shouldCompact(estimatedTokens, contextWindow, compactionSettings)
        : false;

    const percentUsed =
      contextWindow != null && contextWindow > 0
        ? Math.min(100, (estimatedTokens / contextWindow) * 100)
        : null;

    return {
      ok: true,
      estimatedTokens,
      contextWindow,
      percentUsed,
      modelProvider,
      modelId,
      shouldCompact: shouldCompactHint,
      messageCount: messages.length,
    };
  } catch (err) {
    return {
      ok: false,
      reason: "read_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
