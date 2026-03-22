import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type AgentEnvInput = {
  anthropicApiKey: string;
  apiSecret: string;
  /** KEY=value lines for optional extension env */
  optionalLines?: string[];
};

export function loadEnvTemplate(): string {
  const p = join(__dirname, "../../infra/mercury.env.tmpl");
  return readFileSync(p, "utf8");
}

export function renderMercuryEnv(input: AgentEnvInput): string {
  const optional =
    input.optionalLines?.filter(Boolean).join("\n") ?? "# (none)";
  return loadEnvTemplate()
    .replace("{{MERCURY_ANTHROPIC_API_KEY}}", input.anthropicApiKey)
    .replace("{{MERCURY_API_SECRET}}", input.apiSecret)
    .replace("{{OPTIONAL_ENV_LINES}}", optional);
}
