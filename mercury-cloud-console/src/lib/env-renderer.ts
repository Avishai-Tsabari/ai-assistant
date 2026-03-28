import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { providerEnvVar } from "@/lib/providers";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type ResolvedProviderKey = {
  provider: string;
  apiKey: string;
  /** If set, use this env var name instead of providerEnvVar(provider) */
  envVarOverride?: string;
};

export type ModelChainLeg = {
  provider: string;
  model: string;
};

export type AgentEnvInput = {
  /** Resolved (plaintext) provider API keys to inject */
  resolvedKeys: ResolvedProviderKey[];
  /** Ordered model chain for MERCURY_MODEL_CHAIN */
  modelChain: ModelChainLeg[];
  apiSecret: string;
  agentImage: string;
  /** KEY=value lines for optional extension env */
  optionalLines?: string[];
};

export function loadEnvTemplate(): string {
  const p = join(__dirname, "../../infra/mercury.env.tmpl");
  return readFileSync(p, "utf8");
}

export function renderMercuryEnv(input: AgentEnvInput): string {
  const providerKeyLines = input.resolvedKeys
    .map(({ provider, apiKey, envVarOverride }) => `${envVarOverride ?? providerEnvVar(provider)}=${apiKey}`)
    .join("\n");

  const modelChainJson = JSON.stringify(
    input.modelChain.map(({ provider, model }) => ({ provider, model })),
  );

  const optional =
    input.optionalLines?.filter(Boolean).join("\n") ?? "# (none)";

  return loadEnvTemplate()
    .replace("{{PROVIDER_KEY_LINES}}", providerKeyLines || "# (no provider keys configured)")
    .replace("{{MERCURY_MODEL_CHAIN}}", modelChainJson)
    .replace("{{MERCURY_API_SECRET}}", input.apiSecret)
    .replace("{{MERCURY_AGENT_IMAGE}}", input.agentImage)
    .replace("{{OPTIONAL_ENV_LINES}}", optional);
}

/**
 * Render agent environment as a Record<string, string> for container mode.
 * Same data as renderMercuryEnv but returns a key-value map instead of a
 * template-substituted file string — suitable for passing as Docker env vars.
 */
export function renderMercuryEnvRecord(
  input: Omit<AgentEnvInput, "optionalLines"> & {
    optionalEnv?: Record<string, string>;
    /** Unique agent ID injected as MERCURY_AGENT_ID for inner-container namespacing */
    agentId?: string;
  },
): Record<string, string> {
  const env: Record<string, string> = {};

  // Provider API keys
  for (const { provider, apiKey, envVarOverride } of input.resolvedKeys) {
    const key = envVarOverride ?? providerEnvVar(provider);
    env[key] = apiKey;
  }

  // Model chain
  env.MERCURY_MODEL_CHAIN = JSON.stringify(
    input.modelChain.map(({ provider, model }) => ({ provider, model })),
  );

  // API secret
  env.MERCURY_API_SECRET = input.apiSecret;

  // Agent image (used by container-runner for inner containers)
  env.MERCURY_AGENT_IMAGE = input.agentImage;

  // Agent ID for inner container namespacing
  if (input.agentId) {
    env.MERCURY_AGENT_ID = input.agentId;
  }

  // Optional extension env
  if (input.optionalEnv) {
    for (const [k, v] of Object.entries(input.optionalEnv)) {
      env[k] = v;
    }
  }

  return env;
}
