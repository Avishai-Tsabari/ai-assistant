import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { providerEnvVar } from "@/lib/providers";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type ResolvedProviderKey = {
  provider: string;
  apiKey: string;
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
    .map(({ provider, apiKey }) => `${providerEnvVar(provider)}=${apiKey}`)
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
