import { providerEnvVar } from "@/lib/providers";

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
  resolvedKeys: ResolvedProviderKey[];
  modelChain: ModelChainLeg[];
  apiSecret: string;
  agentImage: string;
  optionalEnv?: Record<string, string>;
  agentId?: string;
};

export function renderMercuryEnvRecord(input: AgentEnvInput): Record<string, string> {
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
