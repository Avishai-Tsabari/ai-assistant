"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatUptime, isHealthy } from "@/lib/format";

type Agent = {
  id: string;
  hostname: string;
  userEmail: string;
  userId: string;
  ipv4: string | null;
  serverId: number | null;
  dashboardUrl: string | null;
  healthUrl: string | null;
  createdAt: string;
  deprovisionedAt: string | null;
};

type HealthData = {
  status: string;
  uptime?: number;
  adapters?: Record<string, boolean>;
} | null;

type AdapterState = {
  enabled: boolean;
  credentials: Record<string, boolean>;
};

/** Credential fields each adapter needs (labels shown in UI). */
const ADAPTER_FIELDS: Record<string, { key: string; label: string }[]> = {
  whatsapp: [],
  telegram: [{ key: "MERCURY_TELEGRAM_BOT_TOKEN", label: "Bot Token" }],
  discord: [{ key: "MERCURY_DISCORD_BOT_TOKEN", label: "Bot Token" }],
  slack: [
    { key: "MERCURY_SLACK_BOT_TOKEN", label: "Bot Token" },
    { key: "MERCURY_SLACK_SIGNING_SECRET", label: "Signing Secret" },
  ],
  teams: [
    { key: "MERCURY_TEAMS_APP_ID", label: "App ID" },
    { key: "MERCURY_TEAMS_APP_PASSWORD", label: "App Password" },
  ],
};

const ADAPTER_NAMES: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  discord: "Discord",
  slack: "Slack",
  teams: "Teams",
};

export function AgentDetailClient({ agent }: { agent: Agent }) {
  const [health, setHealth] = useState<HealthData | undefined>(undefined);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [deprovisionedAt, setDeprovisionedAt] = useState(agent.deprovisionedAt);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isDeprovisioned = !!deprovisionedAt;

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch(`/api/admin/agents/${agent.id}/health`);
      const data = await res.json();
      setHealth(data.health ?? null);
      setHealthError(data.error ?? null);
    } catch {
      setHealthError("Failed to fetch");
    } finally {
      setHealthLoading(false);
    }
  }, [agent.id]);

  useEffect(() => {
    if (!isDeprovisioned) fetchHealth();
    else setHealthLoading(false);
  }, [fetchHealth, isDeprovisioned]);

  const handleDeprovision = async () => {
    const res = await fetch(`/api/admin/agents/${agent.id}/deprovision`, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      setDeprovisionedAt(data.deprovisionedAt);
      setConfirming(false);
    }
  };

  const copyIp = () => {
    if (agent.ipv4) {
      navigator.clipboard.writeText(agent.ipv4);
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <Link href="/admin/agents" style={{ fontSize: "0.85rem" }}>&larr; Back to agents</Link>
      </div>

      <h2 style={{ marginTop: 0 }}>
        {agent.hostname}
        {isDeprovisioned && (
          <span style={{ color: "#f85149", fontSize: "0.8rem", marginLeft: "0.75rem", fontWeight: 400 }}>
            DEPROVISIONED
          </span>
        )}
      </h2>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <tbody>
            <InfoRow label="Owner" value={agent.userEmail} />
            <InfoRow label="IP" value={agent.ipv4 ?? "\u2014"} />
            <InfoRow label="Server ID" value={agent.serverId?.toString() ?? "\u2014"} />
            <InfoRow label="Dashboard URL" value={agent.dashboardUrl ?? "\u2014"} />
            <InfoRow label="Health URL" value={agent.healthUrl ?? "\u2014"} />
            <InfoRow label="Created" value={agent.createdAt?.slice(0, 10) ?? "\u2014"} />
            {isDeprovisioned && (
              <InfoRow label="Deprovisioned" value={deprovisionedAt!.slice(0, 10)} />
            )}
          </tbody>
        </table>
      </div>

      {/* Health */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Health</h3>
        {healthLoading ? (
          <p className="muted">Checking...</p>
        ) : isDeprovisioned ? (
          <p className="muted">Agent is deprovisioned — health check disabled.</p>
        ) : healthError ? (
          <p style={{ color: "#f85149" }}>
            <span style={{ marginRight: "0.35rem" }}>●</span>
            {healthError}
          </p>
        ) : health ? (
          <div>
            <p>
              <span style={{ color: isHealthy(health.status) ? "#3fb950" : "#f85149", marginRight: "0.35rem" }}>●</span>
              {health.status}
              {health.uptime != null && <span className="muted"> — uptime: {formatUptime(health.uptime)}</span>}
            </p>
            {health.adapters && (
              <div style={{ marginTop: "0.5rem" }}>
                <strong style={{ fontSize: "0.85rem" }}>Active adapters:</strong>
                <ul style={{ paddingLeft: "1.25rem", margin: "0.25rem 0" }}>
                  {Object.entries(health.adapters).map(([name, ok]) => (
                    <li key={name} style={{ fontSize: "0.85rem" }}>
                      <span style={{ color: ok ? "#3fb950" : "#f85149", marginRight: "0.35rem" }}>●</span>
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="muted">No health data.</p>
        )}
        {!isDeprovisioned && (
          <button onClick={fetchHealth} disabled={healthLoading} style={{ marginTop: "0.5rem" }}>
            Refresh Health
          </button>
        )}
      </div>

      {/* Adapters */}
      {!isDeprovisioned && (
        <AdaptersCard agentId={agent.id} dashboardUrl={agent.dashboardUrl} onSaved={fetchHealth} />
      )}

      {/* Actions */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Actions</h3>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {agent.dashboardUrl && (
            <a
              href={agent.dashboardUrl}
              target="_blank"
              rel="noopener"
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                background: "var(--accent)",
                color: "#0d1117",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "0.9rem",
                opacity: isDeprovisioned ? 0.4 : 1,
                pointerEvents: isDeprovisioned ? "none" : "auto",
              }}
            >
              Open Dashboard
            </a>
          )}

          {agent.ipv4 && (
            <button
              onClick={copyIp}
              disabled={isDeprovisioned}
              style={{ opacity: isDeprovisioned ? 0.4 : 1 }}
            >
              {copied ? "Copied!" : "Copy IP"}
            </button>
          )}

          {!isDeprovisioned && !confirming && (
            <button
              onClick={() => setConfirming(true)}
              style={{ background: "#f85149", color: "#fff" }}
            >
              Deprovision
            </button>
          )}

          {confirming && (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span style={{ color: "#f85149", fontSize: "0.85rem" }}>
                Are you sure? This marks the agent as deprovisioned.
              </span>
              <button
                onClick={handleDeprovision}
                style={{ background: "#f85149", color: "#fff", fontSize: "0.85rem" }}
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirming(false)}
                style={{ background: "var(--border)", color: "var(--text)", fontSize: "0.85rem" }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Adapters Card ──────────────────────────────────────────── */

function AdaptersCard({
  agentId,
  dashboardUrl,
  onSaved,
}: {
  agentId: string;
  dashboardUrl: string | null;
  onSaved: () => void;
}) {
  const [remoteState, setRemoteState] = useState<Record<string, AdapterState> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Local toggle state: which adapters are enabled in the form
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  // Local credential input values (empty = keep existing)
  const [credInputs, setCredInputs] = useState<Record<string, string>>({});

  const fetchAdapters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/agents/${agentId}/adapters`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      setRemoteState(data.adapters);
      // Initialize toggles from remote state
      const t: Record<string, boolean> = {};
      for (const [name, state] of Object.entries(data.adapters as Record<string, AdapterState>)) {
        t[name] = state.enabled;
      }
      setToggles(t);
      setCredInputs({});
    } catch {
      setError("Failed to fetch adapter state");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchAdapters();
  }, [fetchAdapters]);

  const handleToggle = (name: string) => {
    setToggles((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleCredChange = (envKey: string, value: string) => {
    setCredInputs((prev) => ({ ...prev, [envKey]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    // Build payload: only include adapters whose state changed or have new credentials
    const payload: Record<string, { enabled: boolean; env?: Record<string, string> }> = {};
    for (const name of Object.keys(ADAPTER_FIELDS)) {
      const enabled = toggles[name] ?? false;
      const env: Record<string, string> = {};
      for (const field of ADAPTER_FIELDS[name]) {
        const val = credInputs[field.key]?.trim();
        if (val) env[field.key] = val;
      }
      payload[name] = { enabled, ...(Object.keys(env).length > 0 ? { env } : {}) };
    }

    try {
      const res = await fetch(`/api/admin/agents/${agentId}/adapters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adapters: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error ?? `HTTP ${res.status}`);
        setSaving(false);
        return;
      }
      setSaving(false);
      setRestarting(true);
      // Wait for agent to restart, then refresh
      setTimeout(() => {
        setRestarting(false);
        fetchAdapters();
        onSaved();
      }, 15_000);
    } catch {
      setSaveError("Failed to save");
      setSaving(false);
    }
  };

  const adapterOrder = ["whatsapp", "telegram", "discord", "slack", "teams"];

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ marginTop: 0 }}>Adapters</h3>
        {!loading && !error && (
          <button
            onClick={handleSave}
            disabled={saving || restarting}
            style={{
              background: "var(--accent)",
              color: "#0d1117",
              fontWeight: 600,
              fontSize: "0.85rem",
              padding: "0.4rem 1rem",
              borderRadius: "6px",
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>

      {restarting && (
        <p style={{ color: "#d29922", fontSize: "0.85rem", margin: "0.5rem 0" }}>
          Agent is restarting with new adapter configuration... (auto-refreshing in 15s)
        </p>
      )}

      {saveError && (
        <p style={{ color: "#f85149", fontSize: "0.85rem", margin: "0.5rem 0" }}>
          {saveError}
        </p>
      )}

      {loading ? (
        <p className="muted">Loading adapter state...</p>
      ) : error ? (
        <div>
          <p style={{ color: "#f85149", fontSize: "0.85rem" }}>{error}</p>
          <button onClick={fetchAdapters} style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
            Retry
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
          {adapterOrder.map((name) => {
            const remote = remoteState?.[name];
            const enabled = toggles[name] ?? false;
            const fields = ADAPTER_FIELDS[name];
            const isWhatsApp = name === "whatsapp";

            return (
              <div
                key={name}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "0.75rem",
                  opacity: restarting ? 0.5 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <button
                    onClick={() => handleToggle(name)}
                    disabled={restarting}
                    style={{
                      width: "40px",
                      height: "22px",
                      borderRadius: "11px",
                      border: "none",
                      cursor: restarting ? "default" : "pointer",
                      background: enabled ? "#3fb950" : "var(--border)",
                      position: "relative",
                      transition: "background 0.2s",
                      padding: 0,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        width: "16px",
                        height: "16px",
                        borderRadius: "50%",
                        background: "#fff",
                        position: "absolute",
                        top: "3px",
                        left: enabled ? "21px" : "3px",
                        transition: "left 0.2s",
                      }}
                    />
                  </button>
                  <strong style={{ fontSize: "0.9rem" }}>{ADAPTER_NAMES[name]}</strong>
                </div>

                {enabled && isWhatsApp && dashboardUrl && (
                  <div style={{ marginTop: "0.5rem", marginLeft: "0.25rem" }}>
                    <a
                      href={`${dashboardUrl.replace(/\/$/, "")}/auth/whatsapp`}
                      target="_blank"
                      rel="noopener"
                      style={{ fontSize: "0.85rem" }}
                    >
                      Pair via QR code &rarr;
                    </a>
                  </div>
                )}

                {enabled && fields.length > 0 && (
                  <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {fields.map((field) => {
                      const hasExisting = remote?.credentials[field.key] ?? false;
                      return (
                        <div key={field.key} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <label
                            style={{
                              fontSize: "0.8rem",
                              width: "120px",
                              flexShrink: 0,
                              textAlign: "right",
                            }}
                            className="muted"
                          >
                            {field.label}:
                          </label>
                          <input
                            type="password"
                            placeholder={hasExisting ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (saved)" : "Enter value"}
                            value={credInputs[field.key] ?? ""}
                            onChange={(e) => handleCredChange(field.key, e.target.value)}
                            disabled={restarting}
                            style={{
                              flex: 1,
                              padding: "0.35rem 0.5rem",
                              fontSize: "0.85rem",
                              borderRadius: "4px",
                              border: "1px solid var(--border)",
                              background: "var(--bg)",
                              color: "var(--text)",
                              fontFamily: "monospace",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────── */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td style={{ padding: "0.4rem 0.75rem", fontWeight: 600, whiteSpace: "nowrap", width: "140px" }}>
        {label}
      </td>
      <td style={{ padding: "0.4rem 0.75rem" }} className="muted">
        {value}
      </td>
    </tr>
  );
}
