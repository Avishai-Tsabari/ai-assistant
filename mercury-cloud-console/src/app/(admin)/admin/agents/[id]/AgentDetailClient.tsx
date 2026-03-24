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
            <InfoRow label="IP" value={agent.ipv4 ?? "—"} />
            <InfoRow label="Server ID" value={agent.serverId?.toString() ?? "—"} />
            <InfoRow label="Dashboard URL" value={agent.dashboardUrl ?? "—"} />
            <InfoRow label="Health URL" value={agent.healthUrl ?? "—"} />
            <InfoRow label="Created" value={agent.createdAt?.slice(0, 10) ?? "—"} />
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
                <strong style={{ fontSize: "0.85rem" }}>Adapters:</strong>
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

