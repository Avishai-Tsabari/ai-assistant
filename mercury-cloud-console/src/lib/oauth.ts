/**
 * OAuth utility functions for dashboard-side token exchange.
 * All constants are derived from the @mariozechner/pi-ai library source
 * (mercury-fork dependency). No pi-ai dependency is added here — we implement
 * the token exchange directly using fetch.
 */

// ─── Anthropic OAuth (PKCE, public client — no client secret) ───────────────

const ANTHROPIC_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const ANTHROPIC_AUTH_URL = "https://claude.ai/oauth/authorize";
const ANTHROPIC_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const ANTHROPIC_REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const ANTHROPIC_SCOPES = "org:create_api_key user:profile user:inference";

// ─── GitHub Copilot (device code flow) ──────────────────────────────────────

const GITHUB_CLIENT_ID = "Iv1.b507a08c87ecfe98";
const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token";
const GITHUB_SCOPES = "read:user";

// ─── Types ───────────────────────────────────────────────────────────────────

export type OAuthCredentials = {
  access: string;
  refresh: string;
  expires: number;
  [key: string]: unknown;
};

export type DeviceFlowStart = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
};

export type PollResult =
  | { status: "pending" }
  | { status: "slow_down"; interval: number }
  | { status: "complete"; credentials: OAuthCredentials };

// ─── PKCE helpers ────────────────────────────────────────────────────────────

/** Generates a cryptographically random PKCE verifier (43–128 chars, URL-safe). */
export function generatePkceVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/** Derives the PKCE code challenge (S256) from a verifier. */
export async function derivePkceChallenge(verifier: string): Promise<string> {
  const enc = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/** Builds the Anthropic authorization URL for a given PKCE verifier. */
export async function buildAnthropicAuthUrl(verifier: string): Promise<string> {
  const challenge = await derivePkceChallenge(verifier);
  const params = new URLSearchParams({
    code: "true",
    client_id: ANTHROPIC_CLIENT_ID,
    response_type: "code",
    redirect_uri: ANTHROPIC_REDIRECT_URI,
    scope: ANTHROPIC_SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: verifier,
  });
  return `${ANTHROPIC_AUTH_URL}?${params.toString()}`;
}

/**
 * Parses the code and state from the value pasted by the user after
 * completing Anthropic's OAuth flow. Accepts:
 *   - Full redirect URL: https://console.anthropic.com/oauth/code/callback?code=...#state
 *   - "code#state" string
 *   - bare code (when state is provided separately via session)
 */
export function parseAnthropicPaste(pasted: string): { code: string; state: string } | null {
  const trimmed = pasted.trim();

  // Full URL form
  if (trimmed.startsWith("http")) {
    try {
      const url = new URL(trimmed);
      const code = url.searchParams.get("code");
      const state = url.hash.replace("#", "") || url.searchParams.get("state");
      if (code && state) return { code, state };
    } catch {
      // Fall through
    }
  }

  // "code#state" form
  const hashIdx = trimmed.indexOf("#");
  if (hashIdx > 0) {
    const code = trimmed.slice(0, hashIdx).trim();
    const state = trimmed.slice(hashIdx + 1).trim();
    if (code && state) return { code, state };
  }

  return null;
}

/**
 * Exchanges an Anthropic authorization code + PKCE verifier for OAuth credentials.
 * The verifier is passed as the `state` parameter (Anthropic's convention).
 */
export async function exchangeAnthropicCode(
  code: string,
  verifier: string,
): Promise<OAuthCredentials> {
  const res = await fetch(ANTHROPIC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      state: verifier,
      code_verifier: verifier,
      client_id: ANTHROPIC_CLIENT_ID,
      redirect_uri: ANTHROPIC_REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic token exchange failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token || !data.refresh_token) {
    throw new Error("Anthropic token response missing access_token or refresh_token");
  }

  return {
    access: data.access_token,
    refresh: data.refresh_token,
    expires: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

/** Refreshes an Anthropic OAuth access token using the stored refresh token. */
export async function refreshAnthropicToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  const res = await fetch(ANTHROPIC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: credentials.refresh,
      client_id: ANTHROPIC_CLIENT_ID,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic token refresh failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error("Anthropic refresh response missing access_token");
  }

  return {
    access: data.access_token,
    refresh: data.refresh_token ?? credentials.refresh,
    expires: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

// ─── GitHub Copilot ──────────────────────────────────────────────────────────

/** Initiates a GitHub device code flow. Returns codes and polling parameters. */
export async function startGithubDeviceFlow(): Promise<DeviceFlowStart> {
  const res = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: GITHUB_SCOPES }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub device code request failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    interval?: number;
    expires_in?: number;
  };

  if (!data.device_code || !data.user_code || !data.verification_uri) {
    throw new Error("GitHub device flow response missing required fields");
  }

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    interval: data.interval ?? 5,
    expiresIn: data.expires_in ?? 900,
  };
}

/**
 * Polls GitHub for device flow completion.
 * Returns { status: "pending" } while waiting, or { status: "complete", credentials } on success.
 */
export async function pollGithubDeviceFlow(deviceCode: string): Promise<PollResult> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub token poll failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    interval?: number;
  };

  if (data.error === "authorization_pending") return { status: "pending" };
  if (data.error === "slow_down") return { status: "slow_down", interval: data.interval ?? 10 };
  if (data.error === "expired_token") throw new Error("GitHub device code expired");
  if (data.error) throw new Error(`GitHub device flow error: ${data.error}`);

  if (!data.access_token) {
    throw new Error("GitHub token poll response missing access_token");
  }

  const githubToken = data.access_token;

  // Exchange GitHub OAuth token for a Copilot internal token
  const copilotCreds = await fetchCopilotToken(githubToken);

  return { status: "complete", credentials: copilotCreds };
}

/**
 * Fetches a GitHub Copilot internal token using a GitHub OAuth access token.
 * The Copilot token is short-lived; the GitHub token (stored as `refresh`) is used to re-fetch it.
 */
export async function fetchCopilotToken(githubToken: string): Promise<OAuthCredentials> {
  const res = await fetch(GITHUB_COPILOT_TOKEN_URL, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Copilot token fetch failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    token?: string;
    expires_at?: number;
  };

  if (!data.token) {
    throw new Error("Copilot token response missing token field");
  }

  return {
    access: data.token,
    // Store the GitHub OAuth token as "refresh" so we can re-fetch the Copilot token when it expires
    refresh: githubToken,
    expires: data.expires_at ? data.expires_at * 1000 : Date.now() + 3600 * 1000,
  };
}

/** Refreshes a Copilot token by re-fetching from the Copilot endpoint using the stored GitHub token. */
export async function refreshCopilotToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  return fetchCopilotToken(credentials.refresh);
}

// ─── Generic refresh dispatcher ──────────────────────────────────────────────

/** Refreshes OAuth credentials for a given provider. */
export async function refreshOAuthCredentials(
  provider: string,
  credentials: OAuthCredentials,
): Promise<OAuthCredentials> {
  if (provider === "anthropic") return refreshAnthropicToken(credentials);
  if (provider === "github-copilot") return refreshCopilotToken(credentials);
  throw new Error(`OAuth refresh not supported for provider: ${provider}`);
}
