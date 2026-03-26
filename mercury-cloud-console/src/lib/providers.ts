/** Known LLM providers: display metadata + MERCURY_* env var name */
export type ProviderMeta = {
  label: string;
  /** Full MERCURY_* env var name injected into the agent .env */
  envVar: string;
  /** Placeholder for API key input */
  placeholder: string;
  /** Default model name suggestion */
  defaultModel: string;
};

export const KNOWN_PROVIDERS: Record<string, ProviderMeta> = {
  anthropic: {
    label: "Anthropic",
    envVar: "MERCURY_ANTHROPIC_API_KEY",
    placeholder: "sk-ant-...",
    defaultModel: "claude-sonnet-4-6",
  },
  openai: {
    label: "OpenAI",
    envVar: "MERCURY_OPENAI_API_KEY",
    placeholder: "sk-...",
    defaultModel: "gpt-4o",
  },
  google: {
    label: "Google Gemini",
    envVar: "MERCURY_GEMINI_API_KEY",
    placeholder: "AIza...",
    defaultModel: "gemini-2.5-flash",
  },
  groq: {
    label: "Groq",
    envVar: "MERCURY_GROQ_API_KEY",
    placeholder: "gsk_...",
    defaultModel: "llama-3.3-70b-versatile",
  },
  mistral: {
    label: "Mistral",
    envVar: "MERCURY_MISTRAL_API_KEY",
    placeholder: "...",
    defaultModel: "mistral-large-latest",
  },
  openrouter: {
    label: "OpenRouter",
    envVar: "MERCURY_OPENROUTER_API_KEY",
    placeholder: "sk-or-...",
    defaultModel: "meta-llama/llama-3.3-70b-instruct",
  },
};

/** Returns the MERCURY_* env var for any provider (known or custom). */
export function providerEnvVar(provider: string): string {
  return KNOWN_PROVIDERS[provider]?.envVar ?? `MERCURY_${provider.toUpperCase()}_API_KEY`;
}

/** Returns a masked display string for an API key, e.g. "sk-***abc1". */
export function maskKey(key: string): string {
  if (key.length <= 8) return "***";
  const last4 = key.slice(-4);
  const prefix = key.slice(0, Math.min(6, key.indexOf("-", 2) + 1) || 3);
  return `${prefix}***${last4}`;
}
