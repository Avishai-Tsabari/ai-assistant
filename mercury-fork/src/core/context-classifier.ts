import { existsSync } from "node:fs";
import { complete, getModel } from "@mariozechner/pi-ai";
import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";

const CLASSIFY_SYSTEM = `You classify whether a user message needs prior conversation history to answer correctly.
Reply with exactly one word: YES or NO.
- YES = minimal context is enough: treat the message as self-contained (default). New tasks, factual questions, general requests. Prefer YES when unsure.
- NO = the answer truly requires prior chat: explicit callbacks ("as I said", "the bug we fixed"), summarize/recap/today's chat, "continue", or clear dependence on unstated earlier messages`;

/** Env keys pi-ai expects (without MERCURY_ prefix) per provider */
const PROVIDER_API_KEYS: Record<string, string> = {
  groq: "GROQ_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

export interface ClassifierTokenUsage {
  input?: number;
  output?: number;
}

export interface ContextClassificationResult {
  /** true when the container may use minimal session (no full history) */
  useMinimal: boolean;
  classifier: {
    mode: "heuristic" | "llm" | "off";
    input?: number;
    output?: number;
  };
  /**
   * When using LLM classifier, true if no model leg produced a decision and
   * Mercury fell back to full session.
   */
  classifierUnavailable?: boolean;
}

/** Normalize usage objects from pi-ai `complete` (shape varies by provider). */
function usageFromCompleteResult(result: unknown): ClassifierTokenUsage {
  if (!result || typeof result !== "object") return {};
  const u = (result as { usage?: Record<string, unknown> }).usage;
  if (!u || typeof u !== "object") return {};
  const input = Number(
    u.input ?? u.input_tokens ?? u.promptTokens ?? u.prompt_tokens,
  );
  const output = Number(
    u.output ?? u.output_tokens ?? u.completionTokens ?? u.completion_tokens,
  );
  const out: ClassifierTokenUsage = {};
  if (Number.isFinite(input) && input > 0) out.input = input;
  if (Number.isFinite(output) && output > 0) out.output = output;
  return out;
}

type TryLegResult =
  | { ok: true; useMinimal: boolean; usage: ClassifierTokenUsage }
  | {
      ok: false;
      reason: "no_key" | "no_model" | "api_error";
      envHint?: string;
      message?: string;
    };

async function tryLeg(
  prompt: string,
  provider: string,
  modelId: string,
  dedicatedKey: string | undefined,
): Promise<TryLegResult> {
  const apiKeyEnv = PROVIDER_API_KEYS[provider];
  if (!apiKeyEnv) {
    return {
      ok: false,
      reason: "no_key",
      envHint: "MERCURY_CONTEXT_CLASSIFIER_API_KEY",
    };
  }

  const apiKey =
    dedicatedKey?.trim() ||
    (process.env[`MERCURY_${apiKeyEnv}`] ?? process.env[apiKeyEnv])?.trim() ||
    undefined;

  if (!apiKey) {
    return {
      ok: false,
      reason: "no_key",
      envHint: `MERCURY_CONTEXT_CLASSIFIER_API_KEY, MERCURY_${apiKeyEnv}, or ${apiKeyEnv}`,
    };
  }

  // biome-ignore lint/suspicious/noExplicitAny: pi-ai model registry keys are dynamic
  const model = getModel(provider as any, modelId as any);
  if (!model) {
    return { ok: false, reason: "no_model" };
  }

  const orig = process.env[apiKeyEnv];
  process.env[apiKeyEnv] = apiKey;
  try {
    const normalizedPrompt = prompt.replace(/<[^>]+>/g, "").trim();
    const msg =
      normalizedPrompt.length > 500
        ? `${normalizedPrompt.slice(0, 500)}...`
        : normalizedPrompt;

    const result = await complete(
      model,
      {
        systemPrompt: CLASSIFY_SYSTEM,
        messages: [{ role: "user", content: msg, timestamp: Date.now() }],
      },
      { maxTokens: 10 },
    );

    const text = (result.content ?? [])
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim()
      .toUpperCase();

    const useMinimal = /^YES\b/.test(text) || text === "YES";
    return { ok: true, useMinimal, usage: usageFromCompleteResult(result) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "api_error", message: msg };
  } finally {
    if (orig !== undefined) process.env[apiKeyEnv] = orig;
    else delete process.env[apiKeyEnv];
  }
}

/** Patterns that suggest the prompt needs conversation history to answer. */
const NEEDS_HISTORY_PATTERNS = [
  /\b(as i said|as i mentioned|as we discussed|as discussed)\b/i,
  /\b(previous|earlier|before that|prior)\b/i,
  /\bsummarize\b/i,
  /\brecap\b/i,
  /\bwrap[\s-]?up\b/i,
  /\bcontinue\b/i,
  /\bwhat we discussed\b/i,
  /\bthe file i mentioned\b/i,
  /\bfrom before\b/i,
  /\blike i told you\b/i,
  /\bwho has permissions to do that\b/i,
  /\bremind me\b/i,
  /\brecall\b/i,
  /\bcontext from\b/i,
  /\bwhat\s+(?:we|everyone|they)\s+(?:said|discussed|talked about)\b/i,
  /\b(?:today'?s?|the)\s+(?:chat|conversation|messages|discussion)\b/i,
  // Hebrew: summarize (imperative), summarize for me, summarize (future)
  // No \b for Hebrew - word boundaries can be unreliable with RTL scripts
  /סכם/,
  /תסכם/,
  /מה\s+ש(?:אמרנו|דיברנו)/,
  /סיכום\s+(?:של\s+)?(?:השיחה|מה\s+שנאמר)/,
  /(?:נאמר|נדבר)\s+היום/,
];

/**
 * Classify whether a prompt needs conversation history.
 * Returns useMinimal true when minimal context can be used (standalone prompt).
 */
export async function classifyContextNeeded(
  prompt: string,
  sessionFile: string,
  config: AppConfig,
): Promise<ContextClassificationResult> {
  if (!config.conditionalContextEnabled) {
    logger.debug("Context classifier: disabled, using full session");
    return {
      useMinimal: false,
      classifier: { mode: "off" },
    };
  }

  try {
    if (config.contextClassifier === "llm") {
      const llm = await classifyWithLlm(prompt, config);
      return {
        useMinimal: llm.useMinimal,
        classifier: {
          mode: "llm",
          ...llm.usage,
        },
        classifierUnavailable: llm.classifierUnavailable,
      };
    }

    const useMinimal = classifyWithHeuristic(prompt, sessionFile);
    logger.debug("Context classifier decision", {
      useMinimalContext: useMinimal,
      mode: "heuristic",
    });
    return {
      useMinimal,
      classifier: { mode: "heuristic" },
    };
  } catch (err) {
    logger.warn("Context classifier failed, using full session", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      useMinimal: false,
      classifier: {
        mode: config.contextClassifier === "llm" ? "llm" : "heuristic",
      },
      classifierUnavailable: true,
    };
  }
}

function classifyWithHeuristic(prompt: string, sessionFile: string): boolean {
  // No session file yet: one full-context run helps pi initialize session state;
  // after that, merged history exists and standalone prompts can go minimal.
  if (!existsSync(sessionFile)) {
    return false;
  }

  // Check for history-indicating patterns
  const normalizedPrompt = prompt.replace(/<[^>]+>/g, "").trim(); // Strip XML tags like <caller>
  for (const pattern of NEEDS_HISTORY_PATTERNS) {
    if (pattern.test(normalizedPrompt)) {
      return false; // Needs history
    }
  }

  return true; // Standalone, can use minimal
}

function logExplicitClassifierFailure(
  config: AppConfig,
  provider: string,
  modelId: string,
  result: Extract<TryLegResult, { ok: false }>,
): void {
  if (result.reason === "no_key") {
    logger.warn(
      "LLM context classifier: no API key for provider, using full session",
      {
        provider,
        envVar: result.envHint ?? "MERCURY_CONTEXT_CLASSIFIER_API_KEY",
      },
    );
    return;
  }
  if (result.reason === "no_model") {
    const fromMain =
      !config.contextClassifierProvider && !config.contextClassifierModel;
    logger.warn("LLM context classifier: model not found, using full session", {
      provider,
      modelId,
      hint: fromMain
        ? "Check MERCURY_MODEL_PROVIDER and MERCURY_MODEL match a pi-ai supported model"
        : "Check MERCURY_CONTEXT_CLASSIFIER_PROVIDER and MERCURY_CONTEXT_CLASSIFIER_MODEL match a pi-ai supported model",
    });
    return;
  }
  const msg = result.message ?? "unknown error";
  const isQuota =
    /429|quota|rate.?limit|billing|api.?key|invalid|unauthorized/i.test(msg);
  logger.warn("LLM context classifier failed, using full session", {
    provider,
    modelId,
    error: msg,
    hint: isQuota
      ? "Check API key and quota for the classifier model"
      : undefined,
  });
}

async function classifyWithLlm(
  prompt: string,
  config: AppConfig,
): Promise<{
  useMinimal: boolean;
  usage: ClassifierTokenUsage;
  classifierUnavailable: boolean;
}> {
  const dedicatedKey = process.env.MERCURY_CONTEXT_CLASSIFIER_API_KEY?.trim();

  const explicitOverride =
    config.contextClassifierProvider !== undefined ||
    config.contextClassifierModel !== undefined;

  if (explicitOverride) {
    const provider = config.contextClassifierProvider ?? config.modelProvider;
    const modelId = config.contextClassifierModel ?? config.model;
    const result = await tryLeg(prompt, provider, modelId, dedicatedKey);
    if (result.ok) {
      logger.debug("Context classifier decision", {
        useMinimalContext: result.useMinimal,
        mode: "llm",
      });
      return {
        useMinimal: result.useMinimal,
        usage: result.usage,
        classifierUnavailable: false,
      };
    }
    logExplicitClassifierFailure(config, provider, modelId, result);
    return {
      useMinimal: false,
      usage: {},
      classifierUnavailable: true,
    };
  }

  const chain = config.resolvedModelChain;
  for (let i = 0; i < chain.length; i++) {
    const leg = chain[i];
    if (!leg) break;
    const { provider, model } = leg;
    const result = await tryLeg(prompt, provider, model, dedicatedKey);
    if (result.ok) {
      logger.debug("Context classifier decision", {
        useMinimalContext: result.useMinimal,
        mode: "llm",
      });
      return {
        useMinimal: result.useMinimal,
        usage: result.usage,
        classifierUnavailable: false,
      };
    }

    logger.debug("LLM context classifier: skipping chain leg", {
      legIndex: i,
      provider,
      model,
      reason: result.reason,
      detail: result.reason === "api_error" ? result.message : undefined,
    });
  }

  logger.warn(
    "LLM context classifier: no leg in model chain could run the classifier, using full session",
  );
  return {
    useMinimal: false,
    usage: {},
    classifierUnavailable: true,
  };
}
