/**
 * Host-side TradeStation OAuth token refresh (Tagula AuthManager–style).
 * Persists tokens in Mercury extension_state; never exposes client_secret to containers.
 */

export const TRADESTATION_EXT = "tradestation";

/** Minimal store surface (implemented by Db in production). */
export interface TradeStationTokenStore {
  getExtState(extension: string, key: string): string | null;
  setExtState(extension: string, key: string, value: string): void;
  deleteExtState(extension: string, key: string): boolean;
}

export interface TradeStationRefreshLog {
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, err?: Error): void;
}

const BUFFER_MS = 5 * 60 * 1000;

function tokenUrl(): string {
  return (
    process.env.MERCURY_TS_TOKEN_URL?.trim() ||
    "https://signin.tradestation.com/oauth/token"
  );
}

/** Prefer Mercury-prefixed vars; fall back to Tagula-style `TS_*` so one .env can match both apps. */
function clientId(): string | undefined {
  const v =
    process.env.MERCURY_TS_CLIENT_ID?.trim() ||
    process.env.TS_CLIENT_ID?.trim();
  return v || undefined;
}

function clientSecret(): string | undefined {
  const v =
    process.env.MERCURY_TS_CLIENT_SECRET?.trim() ||
    process.env.TS_CLIENT_SECRET?.trim();
  return v || undefined;
}

function bootstrapRefreshTokenFromEnv(): string | undefined {
  const v =
    process.env.MERCURY_TRADESTATION_REFRESH_TOKEN?.trim() ||
    process.env.TS_REFRESH_TOKEN?.trim();
  return v || undefined;
}

function bootstrapAccessTokenFromEnv(): string | undefined {
  const v =
    process.env.MERCURY_TRADESTATION_ACCESS_TOKEN?.trim() ||
    process.env.TS_ACCESS_TOKEN?.trim();
  return v || undefined;
}

/**
 * Refresh access token when near expiry; seed refresh/access from host env when store is empty.
 */
export async function runTradeStationTokenRefresh(
  store: TradeStationTokenStore,
  log: TradeStationRefreshLog,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const ext = TRADESTATION_EXT;

  // One-time bootstrap: refresh token from env (MERCURY_* or Tagula TS_REFRESH_TOKEN)
  let refreshToken = store.getExtState(ext, "refresh_token");
  const envRefresh = bootstrapRefreshTokenFromEnv();
  if (!refreshToken && envRefresh) {
    store.setExtState(ext, "refresh_token", envRefresh);
    refreshToken = envRefresh;
    log.info(
      "Seeded TradeStation refresh_token from host env (MERCURY_TRADESTATION_REFRESH_TOKEN or TS_REFRESH_TOKEN)",
    );
  }

  // Optional bootstrap: static access token (until first refresh)
  const envAccess = bootstrapAccessTokenFromEnv();
  if (envAccess && !store.getExtState(ext, "access_token")) {
    store.setExtState(ext, "access_token", envAccess);
    const fallbackExpiry = Date.now() + 3600 * 1000;
    store.setExtState(ext, "token_expiry_ms", String(fallbackExpiry));
    log.info(
      "Seeded TradeStation access_token from host env (MERCURY_TRADESTATION_ACCESS_TOKEN or TS_ACCESS_TOKEN)",
    );
  }

  const accessToken = store.getExtState(ext, "access_token");
  const expiryRaw = store.getExtState(ext, "token_expiry_ms");
  const expiryMs = expiryRaw ? Number.parseInt(expiryRaw, 10) : 0;

  const id = clientId();
  const secret = clientSecret();

  if (accessToken && expiryMs > 0 && Date.now() < expiryMs - BUFFER_MS) {
    store.deleteExtState(ext, "auth_error");
    return;
  }

  if (!refreshToken) {
    store.setExtState(ext, "auth_error", "no_refresh_token");
    log.warn(
      "TradeStation: no refresh token in store or env (MERCURY_TRADESTATION_REFRESH_TOKEN / TS_REFRESH_TOKEN)",
    );
    return;
  }

  if (!id || !secret) {
    store.setExtState(ext, "auth_error", "missing_client_credentials");
    log.warn(
      "TradeStation: client id/secret not set (MERCURY_TS_* or TS_CLIENT_ID / TS_CLIENT_SECRET); cannot refresh",
    );
    return;
  }

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: id,
      client_secret: secret,
      refresh_token: refreshToken,
    });

    const res = await fetchImpl(tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      const msg = String(
        data.error_description || data.error || `HTTP ${res.status}`,
      );
      throw new Error(msg);
    }

    const newAccess = data.access_token;
    if (typeof newAccess !== "string" || !newAccess) {
      throw new Error("Token response missing access_token");
    }

    const newRefresh =
      typeof data.refresh_token === "string" && data.refresh_token
        ? data.refresh_token
        : refreshToken;

    const expiresIn =
      typeof data.expires_in === "number"
        ? data.expires_in
        : Number(data.expires_in) || 1200;
    const tokenExpiryMs = Date.now() + expiresIn * 1000 - 60_000;

    store.setExtState(ext, "access_token", newAccess);
    store.setExtState(ext, "refresh_token", newRefresh);
    store.setExtState(ext, "token_expiry_ms", String(tokenExpiryMs));
    store.deleteExtState(ext, "auth_error");

    log.info("TradeStation access token refreshed", {
      expiresInSec: expiresIn,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    store.setExtState(ext, "auth_error", `refresh_failed:${err.message}`);
    log.error("TradeStation token refresh failed", err);
  }
}
