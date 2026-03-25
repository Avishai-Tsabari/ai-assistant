import path from "node:path";
import { z } from "zod";
import {
  type ModelCapabilities,
  parseModelCapabilitiesEnv,
  resolveModelChainCapabilities,
} from "./agent/model-capabilities.js";
import { mergeRawMercuryConfig } from "./config-file.js";
import { parseModelLegsArray } from "./config-model-chain.js";

/** One model leg in the ordered fallback chain (primary first). */
export type ModelLeg = { provider: string; model: string };

function parseModelChainJson(raw: string): ModelLeg[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("MERCURY_MODEL_CHAIN must be valid JSON array");
  }
  return parseModelLegsArray(parsed, "MERCURY_MODEL_CHAIN");
}

function resolveModelChain(base: {
  modelChain: string | undefined;
  modelProvider: string;
  model: string;
  modelFallbackProvider: string | undefined;
  modelFallback: string | undefined;
}): ModelLeg[] {
  const trimmed = base.modelChain?.trim();
  if (trimmed) {
    return parseModelChainJson(trimmed);
  }
  const legs: ModelLeg[] = [
    { provider: base.modelProvider, model: base.model },
  ];
  const fp = base.modelFallbackProvider?.trim();
  const fm = base.modelFallback?.trim();
  if (fp && fm) {
    legs.push({ provider: fp, model: fm });
  }
  return legs;
}

/** Parse boolean from env var strings — case-insensitive "true"/"1" → true, everything else → false */
const booleanFromEnv = z.union([z.boolean(), z.string()]).transform((val) => {
  if (typeof val === "boolean") return val;
  const lower = val.toLowerCase();
  return lower === "true" || lower === "1";
});

const schema = z.object({
  // ─── Logging ────────────────────────────────────────────────────────
  logLevel: z
    .enum(["debug", "info", "warn", "error", "silent"])
    .default("info"),
  logFormat: z.enum(["text", "json"]).default("text"),

  // ─── AI Model ───────────────────────────────────────────────────────
  modelProvider: z.string().default("anthropic"),
  model: z.string().default("claude-opus-4-6"),
  modelFallbackProvider: z.string().optional(),
  modelFallback: z.string().optional(),
  /** JSON array of `{ provider, model }`. When set, overrides legacy primary+fallback pair. */
  modelChain: z.string().optional(),
  /** Extra attempts after the first failure on the same leg (retryable errors only). Default 2 => 3 tries max per leg. */
  modelMaxRetriesPerLeg: z.coerce.number().int().min(0).max(5).default(2),
  /** Wall-clock budget for the whole chain (ms). Clamped below container timeout. Default 120s. */
  modelChainBudgetMs: z.coerce
    .number()
    .int()
    .min(5000)
    .max(55 * 60 * 1000)
    .default(120_000),
  /**
   * Optional JSON object overriding model capabilities for all chain legs, e.g.
   * `{"tools":false,"vision":true}`. Highest priority over YAML and built-in map.
   */
  modelCapabilitiesEnv: z.string().optional(),

  // ─── Trigger Behavior ───────────────────────────────────────────────
  triggerPatterns: z.string().default("@Pi,Pi"),
  triggerMatch: z.string().default("mention"),

  // ─── Storage ────────────────────────────────────────────────────────
  dataDir: z.string().default(".mercury"),
  authPath: z.string().optional(),
  /** WhatsApp Baileys auth directory; default `<dataDir>/whatsapp-auth`. */
  whatsappAuthDir: z.string().optional(),

  // ─── Container / Agent ──────────────────────────────────────────────
  agentContainerImage: z
    .string()
    .default("ghcr.io/michaelliv/mercury-agent:latest"),
  containerTimeoutMs: z.coerce
    .number()
    .int()
    .min(10_000)
    .max(60 * 60 * 1000)
    .default(5 * 60 * 1000), // 5 minutes
  /**
   * When true, `docker run` uses looser outer sandbox so bubblewrap can nest (e.g. Docker Desktop).
   * Does not disable bwrap — see docs/container-lifecycle.md.
   */
  containerBwrapDockerCompat: booleanFromEnv.default(false),
  maxConcurrency: z.coerce.number().int().min(1).max(32).default(2),

  // ─── Rate Limiting ──────────────────────────────────────────────────
  rateLimitPerUser: z.coerce.number().int().min(1).max(1000).default(10),
  rateLimitWindowMs: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60 * 60 * 1000)
    .default(60 * 1000), // 1 minute

  // ─── Server ─────────────────────────────────────────────────────────
  port: z.coerce.number().int().min(1).max(65535).default(8787),
  botUsername: z.string().default("mercury"),

  // ─── Discord ────────────────────────────────────────────────────────
  enableDiscord: booleanFromEnv.default(false),
  discordGatewayDurationMs: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(60 * 60 * 1000)
    .default(10 * 60 * 1000),
  discordGatewaySecret: z.string().optional(),

  // ─── Slack ──────────────────────────────────────────────────────────
  enableSlack: booleanFromEnv.default(false),

  // ─── Teams ───────────────────────────────────────────────────────────
  enableTeams: booleanFromEnv.default(false),

  // ─── WhatsApp ───────────────────────────────────────────────────────
  enableWhatsApp: booleanFromEnv.default(false),

  // ─── Telegram ───────────────────────────────────────────────────────
  enableTelegram: booleanFromEnv.default(false),
  /** When true, convert Markdown to Telegram HTML for formatted replies. */
  telegramFormatEnabled: booleanFromEnv.default(true),

  // ─── Media Handling ─────────────────────────────────────────────────
  mediaEnabled: booleanFromEnv.default(true),
  mediaMaxSizeMb: z.coerce.number().min(1).max(100).default(10),

  // ─── Permissions ────────────────────────────────────────────────────
  admins: z.string().default(""),

  // ─── Security ─────────────────────────────────────────────────────
  /** Shared secret for API authentication. Required for /api/* routes. */
  apiSecret: z.string().optional(),
  /** Optional API key for the /chat endpoint. When unset, /chat is open (for local use). */
  chatApiKey: z.string().optional(),

  // ─── TradeStation (host order API) ────────────────────────────────
  /**
   * When false (default), POST /api/tradestation/orders rejects non-SIM accounts.
   * Set true only when you intentionally allow live brokerage orders from the assistant flow.
   */
  tsAllowLiveOrders: booleanFromEnv.default(false),

  // ─── Cloud TTS (host-only; /api/tts, optional voice-synth extension) ───
  /** `google` | `azure` | `auto` — auto picks Google if credentials file set, else Azure if key+region set. */
  ttsProvider: z.enum(["google", "azure", "auto"]).default("auto"),
  /** Azure Speech resource key (secret; env-only). */
  azureSpeechKey: z.string().optional(),
  /** Azure region, e.g. `eastus`. */
  azureSpeechRegion: z.string().optional(),
  /**
   * Path to GCP service account JSON for Text-to-Speech.
   * Also accepts standard `GOOGLE_APPLICATION_CREDENTIALS` via mergeRawMercuryConfig.
   */
  googleApplicationCredentials: z.string().optional(),
  /** Max input characters per /api/tts request (clamped 500–10000). */
  ttsMaxChars: z.coerce.number().int().min(500).max(10_000).default(5000),
});

export type AppConfig = z.infer<typeof schema> & {
  /** Derived paths from dataDir */
  dbPath: string;
  globalDir: string;
  spacesDir: string;
  whatsappAuthDir: string;
  /** Ordered model legs (primary first), max 4. */
  resolvedModelChain: ModelLeg[];
  /** Parsed MERCURY_MODEL_CAPABILITIES override, if valid. */
  parsedModelCapabilitiesEnv: ModelCapabilities | null;
  /** Capabilities per chain leg (same order as resolvedModelChain). */
  resolvedModelChainCapabilities: ModelCapabilities[];
  /** Effective budget after clamping to container timeout. */
  effectiveModelChainBudgetMs: number;
};

export function loadConfig(): AppConfig {
  const raw = mergeRawMercuryConfig(process.env);
  const base = schema.parse(raw);

  const dataDir = base.dataDir;

  const resolvedModelChain = resolveModelChain({
    modelChain: base.modelChain,
    modelProvider: base.modelProvider,
    model: base.model,
    modelFallbackProvider: base.modelFallbackProvider,
    modelFallback: base.modelFallback,
  });

  const dataDirAbsolute = resolveProjectPath(base.dataDir);
  const parsedModelCapabilitiesEnv = parseModelCapabilitiesEnv(
    base.modelCapabilitiesEnv,
  );
  const { chainCaps: resolvedModelChainCapabilities } =
    resolveModelChainCapabilities(
      resolvedModelChain,
      dataDirAbsolute,
      parsedModelCapabilitiesEnv,
    );

  const slackMs = 10_000;
  const effectiveModelChainBudgetMs = Math.min(
    base.modelChainBudgetMs,
    Math.max(5000, base.containerTimeoutMs - slackMs),
  );

  return {
    ...base,
    dbPath: path.join(dataDir, "state.db"),
    globalDir: path.join(dataDir, "global"),
    spacesDir: path.join(dataDir, "spaces"),
    whatsappAuthDir:
      base.whatsappAuthDir ?? path.join(dataDir, "whatsapp-auth"),
    resolvedModelChain,
    parsedModelCapabilitiesEnv,
    resolvedModelChainCapabilities,
    effectiveModelChainBudgetMs,
  };
}

export function resolveProjectPath(p: string): string {
  if (path.isAbsolute(p)) return p;
  return path.join(process.cwd(), p);
}
