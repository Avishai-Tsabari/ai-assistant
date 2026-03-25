"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatUptime, isHealthy } from "@/lib/format";

type Agent = {
  id: string;
  hostname: string;
  userEmail: string;
  ipv4: string | null;
  serverId: number | null;
  dashboardUrl: string | null;
};

type HealthData = {
  agentId: string;
  health: { status: string; uptime?: number } | null;
  error: string | null;
};

export function AgentsHealthClient({ agents }: { agents: Agent[] }) {
  const [healthMap, setHealthMap] = useState<Record<string, HealthData>>({});
  const [loading, setLoading] = useState(false);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/agents?includeHealth=true");
      const data = await res.json();
      const map: Record<string, HealthData> = {};
      for (const a of data.agents) {
        map[a.agentId] = { agentId: a.agentId, health: a.health, error: a.error };
      }
      setHealthMap(map);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const refreshOne = async (agentId: string) => {
    try {
      const res = await fetch(`/api/admin/agents/${agentId}/health`);
      const data = await res.json();
      setHealthMap((prev) => ({
        ...prev,
        [agentId]: { agentId, health: data.health, error: data.error },
      }));
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div style={{ marginBottom: "1rem" }}>
        <button onClick={fetchHealth} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh All"}
        </button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
              <th style={th}>Hostname</th>
              <th style={th}>Owner</th>
              <th style={th}>IP</th>
              <th style={th}>Server</th>
              <th style={th}>Health</th>
              <th style={th}>Uptime</th>
              <th style={th}>Dashboard</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const h = healthMap[a.id];
              return (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={td}><Link href={`/admin/agents/${a.id}`}><strong>{a.hostname}</strong></Link></td>
                  <td style={td} className="muted">{a.userEmail}</td>
                  <td style={td} className="muted">{a.ipv4 ?? "—"}</td>
                  <td style={td} className="muted">{a.serverId ?? "—"}</td>
                  <td style={td}>
                    <HealthDot data={h} onRefresh={() => refreshOne(a.id)} />
                  </td>
                  <td style={td} className="muted">
                    {h?.health?.uptime != null ? formatUptime(h.health.uptime) : "—"}
                  </td>
                  <td style={td}>
                    {a.dashboardUrl ? (
                      <Link href={a.dashboardUrl} target="_blank" rel="noopener">
                        Open
                      </Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
      </table>
    </>
  );
}

const th: React.CSSProperties = { padding: "0.5rem 0.75rem", fontWeight: 600, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "0.5rem 0.75rem", whiteSpace: "nowrap" };

function HealthDot({ data, onRefresh }: { data?: HealthData; onRefresh: () => void }) {
  if (!data) {
    return <span className="muted" style={{ fontSize: "0.85rem" }}>loading…</span>;
  }

  const ok = isHealthy(data.health?.status);
  const color = ok ? "#3fb950" : "#f85149";
  const label = data.error ? "unreachable" : (data.health?.status ?? "unknown");

  return (
    <span
      style={{ cursor: "pointer", fontSize: "0.85rem" }}
      title={data.error ?? "Click to refresh"}
      onClick={onRefresh}
    >
      <span style={{ color, marginRight: "0.35rem" }}>●</span>
      {label}
    </span>
  );
}

