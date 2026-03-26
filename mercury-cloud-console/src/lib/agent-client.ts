import { decryptSecret, getMasterKey } from "@/lib/encryption";

export type HealthResponse = {
  status: string;
  uptime?: number;
  adapters?: Record<string, boolean>;
};

export type UsageSpaceRow = {
  spaceId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  runCount: number;
  lastUsedAt: number | null;
};

export type UsageResponse = {
  totals: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCost: number;
    runCount: number;
  };
  perSpace: UsageSpaceRow[];
};

export async function fetchAgentHealth(
  healthBaseUrl: string,
  opts?: { signal?: AbortSignal },
): Promise<HealthResponse> {
  const url = `${healthBaseUrl.replace(/\/$/, "")}/health`;
  const res = await fetch(url, { signal: opts?.signal });
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}

/* ── Adapter management ──────────────────────────────────────── */

export type AdapterState = {
  enabled: boolean;
  credentials: Record<string, boolean>;
};

export type AdapterStateResponse = {
  adapters: Record<string, AdapterState>;
};

export async function fetchAgentAdapters(opts: {
  agentBaseUrl: string;
  apiSecret: string;
  signal?: AbortSignal;
}): Promise<AdapterStateResponse> {
  const url = `${opts.agentBaseUrl.replace(/\/$/, "")}/api/console/adapters`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${opts.apiSecret}` },
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error(`Adapter fetch failed: ${res.status}`);
  }
  return (await res.json()) as AdapterStateResponse;
}

export async function configureAgentAdapters(opts: {
  agentBaseUrl: string;
  apiSecret: string;
  adapters: Record<string, { enabled: boolean; env?: Record<string, string> }>;
}): Promise<{ ok: boolean; error?: string }> {
  const url = `${opts.agentBaseUrl.replace(/\/$/, "")}/api/console/adapters/configure`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiSecret}`,
    },
    body: JSON.stringify({ adapters: opts.adapters }),
  });
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, error: j.error ?? res.statusText };
  }
  return { ok: true };
}

/* ── Extensions ──────────────────────────────────────────────── */

export async function installExtensionOnAgent(opts: {
  agentBaseUrl: string;
  apiSecret: string;
  catalogName?: string;
  source?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const url = `${opts.agentBaseUrl.replace(/\/$/, "")}/api/console/extensions/install`;
  const body =
    opts.catalogName != null
      ? { catalogName: opts.catalogName }
      : { source: opts.source };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiSecret}`,
    },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, error: j.error ?? res.statusText };
  }
  return { ok: true };
}

/* ── Usage ───────────────────────────────────────────────────── */

const USAGE_TIMEOUT_MS = 8_000;

/**
 * Fetch usage data from a Mercury agent's /api/console/usage endpoint.
 * Returns null on any error (network, auth, timeout, parse failure).
 */
export async function fetchAgentUsage(agent: {
  healthUrl: string;
  apiSecretCipher: string;
}): Promise<UsageResponse | null> {
  const masterKey = getMasterKey();
  if (!masterKey) {
    console.warn("[agent-client] CONSOLE_ENCRYPTION_MASTER_KEY not set — cannot fetch usage");
    return null;
  }

  let apiSecret: string;
  try {
    apiSecret = decryptSecret(agent.apiSecretCipher, masterKey);
  } catch {
    console.warn("[agent-client] Failed to decrypt apiSecretCipher");
    return null;
  }

  const baseUrl = agent.healthUrl.replace(/\/health\/?$/, "").replace(/\/$/, "");
  const url = `${baseUrl}/api/console/usage`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), USAGE_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiSecret}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as UsageResponse;
  } catch {
    return null;
  }
}
