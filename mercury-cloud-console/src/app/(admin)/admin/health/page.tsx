"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { isHealthy } from "@/lib/format";

type AgentHealth = {
  agentId: string;
  hostname: string;
  userEmail: string;
  ipv4: string | null;
  dashboardUrl: string | null;
  health: { status: string; uptime?: number } | null;
  error: string | null;
};

export default function AdminHealthPage() {
  const [agents, setAgents] = useState<AgentHealth[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/agents?includeHealth=true");
      const data = await res.json();
      setAgents(data.agents);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const healthy = agents.filter((a) => isHealthy(a.health?.status));
  const unhealthy = agents.filter(
    (a) => a.health && !isHealthy(a.health.status),
  );
  const unreachable = agents.filter((a) => !a.health && a.error);
  const problematic = [...unhealthy, ...unreachable];

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Health Triage</h2>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <Pill color="#3fb950" label="Healthy" count={healthy.length} />
        <Pill color="#f85149" label="Unhealthy" count={unhealthy.length} />
        <Pill color="var(--muted)" label="Unreachable" count={unreachable.length} />
      </div>

      <div style={{ marginBottom: "1rem", display: "flex", gap: "1rem", alignItems: "center" }}>
        <button onClick={fetchAll} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh All"}
        </button>
        <Link href="/admin/agents" style={{ fontSize: "0.85rem" }}>
          View all agents &rarr;
        </Link>
      </div>

      {problematic.length === 0 && !loading ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>All agents are healthy.</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                <th style={th}>Status</th>
                <th style={th}>Hostname</th>
                <th style={th}>Owner</th>
                <th style={th}>IP</th>
                <th style={th}>Error</th>
                <th style={th}>Dashboard</th>
              </tr>
            </thead>
            <tbody>
              {problematic.map((a) => {
                const isUnreachable = !a.health;
                return (
                  <tr key={a.agentId} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={td}>
                      <span style={{ color: isUnreachable ? "var(--muted)" : "#f85149" }}>
                        ● {isUnreachable ? "unreachable" : a.health?.status}
                      </span>
                    </td>
                    <td style={td}><strong>{a.hostname}</strong></td>
                    <td style={td} className="muted">{a.userEmail}</td>
                    <td style={td} className="muted">{a.ipv4 ?? "—"}</td>
                    <td style={td} className="muted" title={a.error ?? undefined}>
                      {a.error ? truncate(a.error, 40) : "—"}
                    </td>
                    <td style={td}>
                      {a.dashboardUrl ? (
                        <Link href={a.dashboardUrl} target="_blank" rel="noopener">Open</Link>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const th: React.CSSProperties = { padding: "0.5rem 0.75rem", fontWeight: 600, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "0.5rem 0.75rem", whiteSpace: "nowrap" };

function Pill({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        padding: "0.25rem 0.75rem",
        borderRadius: "9999px",
        border: "1px solid var(--border)",
        fontSize: "0.85rem",
      }}
    >
      <span style={{ color }}>●</span>
      {label}: {count}
    </span>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
