import { existsSync } from "node:fs";
import {
  createAgentSession,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { AppConfig, ModelLeg } from "../config.js";
import { logger } from "../logger.js";

/**
 * Number of entries in a pi session file (session line + messages, etc.).
 * Returns 0 if the file is missing or unreadable.
 */
export function countSessionEntries(sessionFile: string): number {
  if (!existsSync(sessionFile)) return 0;
  try {
    const sessionManager = SessionManager.open(sessionFile);
    return sessionManager.getEntries().length;
  } catch {
    return 0;
  }
}

export interface CompactResult {
  compacted: boolean;
  /** Pi reported nothing to do — session was already compacted. */
  noop?: boolean;
  tokensBefore?: number;
  summary?: string;
  error?: string;
}

function isAlreadyCompactedError(message: string): boolean {
  return /already compacted/i.test(message.trim());
}

/** Env keys pi expects (without MERCURY_ prefix) per provider */
const PROVIDER_API_KEYS: Record<string, string> = {
  groq: "GROQ_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

/**
 * Set the env vars pi expects for a given model leg and return a cleanup function.
 * Pi reads MODEL_PROVIDER, MODEL, and the provider's API key from process.env.
 */
function setEnvForLeg(leg: ModelLeg): () => void {
  const toSet: Array<[string, string]> = [
    ["MODEL_PROVIDER", leg.provider],
    ["MODEL", leg.model],
  ];
  const apiKeyEnv = PROVIDER_API_KEYS[leg.provider];
  if (apiKeyEnv) {
    const val = process.env[`MERCURY_${apiKeyEnv}`] ?? process.env[apiKeyEnv];
    if (val) toSet.push([apiKeyEnv, val]);
  }

  const orig: Record<string, string | undefined> = {};
  for (const [k] of toSet) orig[k] = process.env[k];
  for (const [k, v] of toSet) process.env[k] = v;

  return () => {
    for (const [k] of toSet) {
      if (orig[k] !== undefined) process.env[k] = orig[k];
      else delete process.env[k];
    }
  };
}

/**
 * Compact a pi session file using pi's SDK compaction.
 * Walks the resolved model chain — tries each leg in order,
 * falling through on failure so compaction mirrors chat-turn resilience.
 */
export async function compactSession(
  sessionFile: string,
  config: AppConfig,
): Promise<CompactResult> {
  if (!existsSync(sessionFile)) {
    return { compacted: false, error: "No session file found" };
  }

  const sessionManager = SessionManager.open(sessionFile);
  const entries = sessionManager.getEntries();

  if (entries.length === 0) {
    return { compacted: false, error: "Session is empty" };
  }

  logger.info("Compacting pi session", {
    sessionFile,
    entryCount: entries.length,
    keepRecentTokens: config.compactKeepRecentTokens ?? "default(20k)",
  });

  const settingsManager = config.compactKeepRecentTokens
    ? SettingsManager.inMemory({
        compaction: {
          enabled: true,
          keepRecentTokens: config.compactKeepRecentTokens,
          reserveTokens: 2048,
        },
      })
    : undefined;

  const chain = config.resolvedModelChain;
  let lastError: string | undefined;

  for (let i = 0; i < chain.length; i++) {
    const leg = chain[i];
    const restore = setEnvForLeg(leg);
    try {
      const { session } = await createAgentSession({
        sessionManager,
        cwd: sessionManager.getCwd(),
        ...(settingsManager && { settingsManager }),
      });

      const result = await session.compact();

      logger.info("Pi session compacted", {
        sessionFile,
        provider: leg.provider,
        model: leg.model,
        tokensBefore: result.tokensBefore,
        summaryLength: result.summary.length,
      });

      return {
        compacted: true,
        tokensBefore: result.tokensBefore,
        summary: result.summary,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (isAlreadyCompactedError(lastError)) {
        logger.info("Pi session already compacted (no-op)", {
          sessionFile,
          provider: leg.provider,
          model: leg.model,
        });
        return { compacted: true, noop: true };
      }
      const isLastLeg = i === chain.length - 1;
      logger.warn("Compaction failed on model leg", {
        sessionFile,
        provider: leg.provider,
        model: leg.model,
        error: lastError,
        ...(isLastLeg
          ? {}
          : { nextLeg: `${chain[i + 1].provider}/${chain[i + 1].model}` }),
      });
    } finally {
      restore();
    }
  }

  logger.error("Failed to compact pi session (all model legs exhausted)", {
    sessionFile,
    error: lastError,
  });
  return { compacted: false, error: lastError };
}
