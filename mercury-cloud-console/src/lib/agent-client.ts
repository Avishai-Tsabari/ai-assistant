export type HealthResponse = {
  status: string;
  uptime?: number;
  adapters?: Record<string, boolean>;
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
