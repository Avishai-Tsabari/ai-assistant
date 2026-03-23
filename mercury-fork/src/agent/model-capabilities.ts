/**
 * Model capability flags — used to adapt prompts, pi tool flags, and skill installation.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { ModelLeg } from "../config.js";
import {
  DEFAULT_CAPABILITIES,
  type ModelCapabilities,
  type ModelCapabilityKey,
} from "./model-capabilities-core.js";

export type {
  ModelCapabilities,
  ModelCapabilityKey,
} from "./model-capabilities-core.js";
export { DEFAULT_CAPABILITIES } from "./model-capabilities-core.js";

export type CapabilityResolveSource = "env" | "yaml" | "builtin" | "default";

export type ResolvedModelCapabilities = {
  capabilities: ModelCapabilities;
  source: CapabilityResolveSource;
};

function mergePartialCapabilities(
  partial: Partial<Record<ModelCapabilityKey, unknown>>,
): ModelCapabilities {
  const out = { ...DEFAULT_CAPABILITIES };
  for (const k of Object.keys(partial) as ModelCapabilityKey[]) {
    const v = partial[k];
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

const partialCapsSchema = z.object({
  tools: z.boolean().optional(),
  vision: z.boolean().optional(),
  audio_input: z.boolean().optional(),
  audio_output: z.boolean().optional(),
  extended_thinking: z.boolean().optional(),
});

const yamlFileSchema = z.object({
  models: z.record(z.string(), partialCapsSchema),
});

export type UserModelCapabilitiesMap = Map<string, ModelCapabilities>;

/** Path to optional user overrides: `<dataDir>/model-capabilities.yaml` */
export function modelCapabilitiesYamlPath(dataDirAbsolute: string): string {
  return path.join(dataDirAbsolute, "model-capabilities.yaml");
}

/**
 * Load `.mercury/model-capabilities.yaml` (under resolved data dir).
 * Returns null if missing or invalid (callers may log).
 */
export function loadUserModelCapabilitiesMap(
  dataDirAbsolute: string,
): UserModelCapabilitiesMap | null {
  const yamlPath = modelCapabilitiesYamlPath(dataDirAbsolute);
  if (!existsSync(yamlPath)) return null;
  try {
    const raw = readFileSync(yamlPath, "utf8");
    const doc = parseYaml(raw) as unknown;
    const parsed = yamlFileSchema.safeParse(doc);
    if (!parsed.success) return null;
    const map = new Map<string, ModelCapabilities>();
    for (const [modelId, partial] of Object.entries(parsed.data.models)) {
      map.set(modelId.trim(), mergePartialCapabilities(partial));
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * Prefix-matched builtin capabilities (longer prefixes first — see BUILTIN_CAPABILITIES_SORTED).
 */
const BUILTIN_CAPABILITIES: Array<{ prefix: string; caps: ModelCapabilities }> =
  [
    {
      prefix: "deepseek-reasoner",
      caps: {
        tools: false,
        vision: false,
        audio_input: false,
        audio_output: false,
        extended_thinking: true,
      },
    },
    {
      prefix: "deepseek-chat",
      caps: {
        tools: true,
        vision: false,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "gpt-4o-mini",
      caps: {
        tools: true,
        vision: true,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "gpt-4o",
      caps: {
        tools: true,
        vision: true,
        audio_input: true,
        audio_output: true,
        extended_thinking: false,
      },
    },
    {
      prefix: "gpt-4-turbo",
      caps: {
        tools: true,
        vision: true,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "gpt-5",
      caps: {
        tools: true,
        vision: true,
        audio_input: true,
        audio_output: true,
        extended_thinking: false,
      },
    },
    {
      prefix: "o3",
      caps: {
        tools: true,
        vision: true,
        audio_input: false,
        audio_output: false,
        extended_thinking: true,
      },
    },
    {
      prefix: "o1",
      caps: {
        tools: true,
        vision: true,
        audio_input: false,
        audio_output: false,
        extended_thinking: true,
      },
    },
    {
      prefix: "gemini-2",
      caps: {
        tools: true,
        vision: true,
        audio_input: true,
        audio_output: false,
        extended_thinking: true,
      },
    },
    {
      prefix: "gemini-1.5",
      caps: {
        tools: true,
        vision: true,
        audio_input: true,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "gemini-",
      caps: {
        tools: true,
        vision: true,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "composer",
      caps: {
        tools: true,
        vision: true,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "claude-opus",
      caps: {
        tools: true,
        vision: true,
        audio_input: false,
        audio_output: false,
        extended_thinking: true,
      },
    },
    {
      prefix: "claude-sonnet",
      caps: {
        tools: true,
        vision: true,
        audio_input: false,
        audio_output: false,
        extended_thinking: true,
      },
    },
    {
      prefix: "claude-haiku",
      caps: {
        tools: true,
        vision: true,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "claude-",
      caps: {
        tools: true,
        vision: true,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "llama-3.3",
      caps: {
        tools: true,
        vision: false,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "llama-3.1-70b",
      caps: {
        tools: true,
        vision: false,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "llama-3.1-8b",
      caps: {
        tools: false,
        vision: false,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "llama-3.2",
      caps: {
        tools: true,
        vision: false,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "mistral-large",
      caps: {
        tools: true,
        vision: false,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "mistral-small",
      caps: {
        tools: true,
        vision: false,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "mixtral",
      caps: {
        tools: true,
        vision: false,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "qwen-2.5",
      caps: {
        tools: true,
        vision: true,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
    {
      prefix: "qwen2.5",
      caps: {
        tools: true,
        vision: true,
        audio_input: false,
        audio_output: false,
        extended_thinking: false,
      },
    },
  ];

const BUILTIN_SORTED = [...BUILTIN_CAPABILITIES].sort(
  (a, b) => b.prefix.length - a.prefix.length,
);

function matchBuiltinCapabilities(modelId: string): ModelCapabilities | null {
  const lower = modelId.toLowerCase();
  for (const { prefix, caps } of BUILTIN_SORTED) {
    if (lower.startsWith(prefix.toLowerCase())) return caps;
  }
  return null;
}

/** Parse MERCURY_MODEL_CAPABILITIES JSON; returns null if unset or invalid. */
export function parseModelCapabilitiesEnv(
  raw: string | undefined,
): ModelCapabilities | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const json = JSON.parse(trimmed) as unknown;
    const r = partialCapsSchema.safeParse(json);
    if (!r.success) return null;
    return mergePartialCapabilities(r.data);
  } catch {
    return null;
  }
}

/**
 * Resolve capabilities for one model id (single leg).
 * Priority: env global override → YAML exact model key → builtin prefix → default.
 */
export function resolveModelCapabilitiesWithSource(
  modelId: string,
  userMap: UserModelCapabilitiesMap | null,
  envCaps: ModelCapabilities | null,
): ResolvedModelCapabilities {
  if (envCaps) {
    return { capabilities: envCaps, source: "env" };
  }

  const exact = userMap?.get(modelId.trim());
  if (exact) {
    return { capabilities: exact, source: "yaml" };
  }

  const builtin = matchBuiltinCapabilities(modelId);
  if (builtin) {
    return { capabilities: builtin, source: "builtin" };
  }

  return { capabilities: { ...DEFAULT_CAPABILITIES }, source: "default" };
}

export function resolveModelCapabilities(
  modelId: string,
  userMap: UserModelCapabilitiesMap | null,
  envCaps: ModelCapabilities | null,
): ModelCapabilities {
  return resolveModelCapabilitiesWithSource(modelId, userMap, envCaps)
    .capabilities;
}

/** Capabilities for each leg in the model chain (same length as `chain`). */
export function resolveModelChainCapabilities(
  chain: ModelLeg[],
  dataDirAbsolute: string,
  envCaps: ModelCapabilities | null,
): {
  chainCaps: ModelCapabilities[];
  userMap: UserModelCapabilitiesMap | null;
} {
  const userMap = loadUserModelCapabilitiesMap(dataDirAbsolute);
  const chainCaps = chain.map((leg) =>
    resolveModelCapabilities(leg.model, userMap, envCaps),
  );
  return { chainCaps, userMap };
}

export function chainSupportsRequirements(
  requires: ModelCapabilityKey[],
  chainCaps: ModelCapabilities[],
): boolean {
  if (requires.length === 0) return true;
  return chainCaps.some((caps) => requires.every((key) => caps[key] === true));
}

/** Log warnings for models that fell back to defaults (once per distinct model id). */
export function logUnknownModelCapabilityWarnings(
  chain: ModelLeg[],
  dataDirAbsolute: string,
  envCaps: ModelCapabilities | null,
  log: { warn: (msg: string, obj?: Record<string, unknown>) => void },
): void {
  if (envCaps) return;
  const userMap = loadUserModelCapabilitiesMap(dataDirAbsolute);
  const seen = new Set<string>();

  for (const leg of chain) {
    const id = leg.model.trim();
    if (seen.has(id)) continue;
    seen.add(id);

    const { source } = resolveModelCapabilitiesWithSource(id, userMap, null);
    if (source === "default") {
      log.warn(
        `Model "${id}" not in built-in capability map and not in model-capabilities.yaml; assuming default capabilities (tools=true, vision=false). Set MERCURY_MODEL_CAPABILITIES or add .mercury/model-capabilities.yaml to override.`,
        { model: id },
      );
    }
  }
}

export function logExtensionCapabilityMismatches(
  extensions: Array<{ name: string; requires?: ModelCapabilityKey[] }>,
  chainCaps: ModelCapabilities[],
  log: { warn: (msg: string, obj?: Record<string, unknown>) => void },
): void {
  for (const ext of extensions) {
    const req = ext.requires;
    if (!req?.length) continue;
    if (!chainSupportsRequirements(req, chainCaps)) {
      log.warn(
        `Extension "${ext.name}" requires ${req.join(", ")} but no model leg in MERCURY_MODEL_CHAIN supports it; extension skills will not be installed.`,
        { extension: ext.name, requires: req },
      );
    }
  }
}
