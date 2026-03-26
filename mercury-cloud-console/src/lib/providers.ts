/** Known LLM providers: display metadata + MERCURY_* env var name */
export type ProviderMeta = {
  label: string;
  /** Full MERCURY_* env var name injected into the agent .env for API keys */
  envVar: string;
  /** Placeholder for API key input */
  placeholder: string;
  /** Default model name suggestion */
  defaultModel: string;
  /** Whether this provider supports OAuth connect from the dashboard */
  oauthSupported?: boolean;
  /** "pkce" = Anthropic-style PKCE + manual code paste; "device" = GitHub device code flow */
  oauthType?: "pkce" | "device";
  /** Human-readable label for the OAuth connect button */
  oauthLabel?: string;
  /** MERCURY_* env var name for OAuth tokens (distinct from the API key env var) */
  oauthTokenEnvVar?: string;
};

export const KNOWN_PROVIDERS: Record<string, ProviderMeta> = {
  anthropic: {
    label: "Anthropic",
    envVar: "MERCURY_ANTHROPIC_API_KEY",
    placeholder: "sk-ant-...",
    defaultModel: "claude-sonnet-4-6",
    oauthSupported: true,
    oauthType: "pkce",
    oauthLabel: "Connect with Claude",
    oauthTokenEnvVar: "MERCURY_ANTHROPIC_OAUTH_TOKEN",
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
  "github-copilot": {
    label: "GitHub Copilot",
    envVar: "MERCURY_GITHUB_COPILOT_OAUTH_TOKEN",
    placeholder: "",
    defaultModel: "claude-sonnet-4-6",
    oauthSupported: true,
    oauthType: "device",
    oauthLabel: "Connect with GitHub Copilot",
    oauthTokenEnvVar: "MERCURY_GITHUB_COPILOT_OAUTH_TOKEN",
  },
};

/** Returns the MERCURY_* env var for any provider (known or custom). */
export function providerEnvVar(provider: string): string {
  return KNOWN_PROVIDERS[provider]?.envVar ?? `MERCURY_${provider.toUpperCase()}_API_KEY`;
}

/**
 * Returns the MERCURY_* env var for OAuth tokens.
 * For providers without a dedicated OAuth token var, falls back to the API key var.
 */
export function oauthEnvVar(provider: string): string {
  return (
    KNOWN_PROVIDERS[provider]?.oauthTokenEnvVar ??
    `MERCURY_${provider.toUpperCase()}_OAUTH_TOKEN`
  );
}

/** Returns a masked display string for an API key, e.g. "sk-***abc1". */
export function maskKey(key: string): string {
  if (key.length <= 8) return "***";
  const last4 = key.slice(-4);
  const prefix = key.slice(0, Math.min(6, key.indexOf("-", 2) + 1) || 3);
  return `${prefix}***${last4}`;
}
