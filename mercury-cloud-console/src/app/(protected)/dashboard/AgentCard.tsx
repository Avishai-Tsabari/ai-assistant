"use client";

import { useState } from "react";
import Link from "next/link";

type ContainerStatus = "running" | "stopped" | "restarting" | "failed" | null;

interface Agent {
  id: string;
  hostname: string | null;
  ipv4: string | null;
  dashboardUrl: string | null;
  nodeId: string | null;
  containerStatus: ContainerStatus;
  deprovisionedAt: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  running: "#3fb950",
  stopped: "#8b949e",
  restarting: "#d29922",
  failed: "#f85149",
};

function StatusBadge({ status }: { status: ContainerStatus }) {
  if (!status) return null;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 8px",
        borderRadius: "12px",
        fontSize: "0.75rem",
        fontWeight: 600,
        color: STATUS_COLOR[status] ?? "#8b949e",
        border: `1px solid ${STATUS_COLOR[status] ?? "#8b949e"}`,
        marginLeft: "0.5rem",
        verticalAlign: "middle",
      }}
    >
      {status}
    </span>
  );
}

export default function AgentCard({ agent }: { agent: Agent }) {
  const [status, setStatus] = useState<ContainerStatus>(agent.containerStatus);
  const [loading, setLoading] = useState<"stop" | "restart" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isContainer = Boolean(agent.nodeId);

  async function handleAction(action: "stop" | "restart") {
    setLoading(action);
    setError(null);
    try {
      const res = await fetch(`/api/user/agents/${agent.id}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `${action} failed`);
      }
      setStatus(action === "stop" ? "stopped" : "restarting");
      // After a restart, poll once after 4s to get updated status
      if (action === "restart") {
        setTimeout(async () => {
          try {
            const s = await fetch(`/api/user/agents/${agent.id}/status`).then(
              (r) => r.json() as Promise<{ status?: string }>,
            );
            setStatus((s.status ?? "running") as ContainerStatus);
          } catch {
            setStatus("running");
          }
        }, 4000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <li
      style={{
        marginBottom: "1rem",
        padding: "0.875rem 1rem",
        border: "1px solid var(--border, #30363d)",
        borderRadius: "6px",
        listStyle: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <strong>{agent.hostname ?? agent.id.slice(0, 12)}</strong>
          {isContainer && <StatusBadge status={status} />}
          {agent.ipv4 && !isContainer && (
            <span className="muted" style={{ fontSize: "0.875rem", marginLeft: "0.5rem" }}>
              {agent.ipv4}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {agent.dashboardUrl && (
            <Link href={agent.dashboardUrl} target="_blank">
              <button type="button" style={{ fontSize: "0.8rem", padding: "3px 10px" }}>
                Open
              </button>
            </Link>
          )}

          {isContainer && status !== "stopped" && (
            <button
              type="button"
              disabled={loading !== null}
              onClick={() => handleAction("stop")}
              style={{
                fontSize: "0.8rem",
                padding: "3px 10px",
                background: "transparent",
                border: "1px solid var(--border, #30363d)",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading === "stop" ? "Stopping…" : "Stop"}
            </button>
          )}

          {isContainer && (
            <button
              type="button"
              disabled={loading !== null}
              onClick={() => handleAction("restart")}
              style={{
                fontSize: "0.8rem",
                padding: "3px 10px",
                background: "transparent",
                border: "1px solid var(--border, #30363d)",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading === "restart" ? "Restarting…" : "Restart"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p style={{ color: "var(--error, #f85149)", fontSize: "0.8rem", margin: "0.4rem 0 0" }}>
          {error}
        </p>
      )}
    </li>
  );
}
