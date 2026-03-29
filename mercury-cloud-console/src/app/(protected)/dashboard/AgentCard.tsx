"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtBytes } from "@/lib/format";

type ContainerStatus = "running" | "stopped" | "restarting" | "failed" | null;

interface Agent {
  id: string;
  hostname: string | null;
  ipv4: string | null;
  dashboardUrl: string | null;
  nodeId: string | null;
  containerStatus: ContainerStatus;
  deprovisionedAt: string | null;
  healthUrl: string | null;
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

function DiskBadge({ usedPercent, freeBytes }: { usedPercent: number; freeBytes: number }) {
  const color =
    usedPercent > 90 ? "#f85149" : usedPercent > 75 ? "#d29922" : "#8b949e";
  return (
    <span style={{ fontSize: "0.75rem", color, marginLeft: "0.5rem" }}>
      {usedPercent.toFixed(0)}% used · {fmtBytes(freeBytes)} free
    </span>
  );
}

export default function AgentCard({ agent }: { agent: Agent }) {
  const router = useRouter();
  const [status, setStatus] = useState<ContainerStatus>(agent.containerStatus);
  const [loading, setLoading] = useState<"stop" | "restart" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disk, setDisk] = useState<{ usedPercent: number; freeBytes: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const isContainer = Boolean(agent.nodeId);

  useEffect(() => {
    if (!agent.healthUrl) return;
    const ac = new AbortController();
    fetch(`/api/user/agents/${agent.id}/storage`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { disk?: { usedPercent: number; freeBytes: number } } | null) => {
        if (d?.disk) {
          setDisk({ usedPercent: d.disk.usedPercent, freeBytes: d.disk.freeBytes });
        }
      })
      .catch(() => null);
    return () => ac.abort();
  }, [agent.id, agent.healthUrl]);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/user/agents/${agent.id}/deprovision`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Delete failed");
      }
      setDeleted(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

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

  if (deleted) return null;

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
          {disk && <DiskBadge usedPercent={disk.usedPercent} freeBytes={disk.freeBytes} />}
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
              disabled={loading !== null || deleting}
              onClick={() => handleAction("stop")}
              style={{
                fontSize: "0.8rem",
                padding: "3px 10px",
                background: "transparent",
                color: "var(--text, #e6edf3)",
                border: "1px solid var(--border, #30363d)",
                cursor: (loading !== null || deleting) ? "not-allowed" : "pointer",
                opacity: (loading !== null || deleting) ? 0.6 : 1,
              }}
            >
              {loading === "stop" ? "Stopping…" : "Stop"}
            </button>
          )}

          {isContainer && (
            <button
              type="button"
              disabled={loading !== null || deleting}
              onClick={() => handleAction("restart")}
              style={{
                fontSize: "0.8rem",
                padding: "3px 10px",
                background: "transparent",
                color: "var(--text, #e6edf3)",
                border: "1px solid var(--border, #30363d)",
                cursor: (loading !== null || deleting) ? "not-allowed" : "pointer",
                opacity: (loading !== null || deleting) ? 0.6 : 1,
              }}
            >
              {loading === "restart" ? "Restarting…" : "Restart"}
            </button>
          )}

          {!confirmDelete ? (
            <button
              type="button"
              disabled={loading !== null || deleting}
              onClick={() => setConfirmDelete(true)}
              style={{
                fontSize: "0.8rem",
                padding: "3px 10px",
                background: "transparent",
                color: "#f85149",
                border: "1px solid #f85149",
                cursor: (loading !== null || deleting) ? "not-allowed" : "pointer",
                opacity: (loading !== null || deleting) ? 0.6 : 1,
              }}
            >
              Delete
            </button>
          ) : (
            <>
              <span style={{ fontSize: "0.8rem", color: "var(--text, #e6edf3)" }}>Delete this agent?</span>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                style={{
                  fontSize: "0.8rem",
                  padding: "3px 10px",
                  background: "transparent",
                  color: "#f85149",
                  border: "1px solid #f85149",
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? "Deleting…" : "Confirm"}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
                style={{
                  fontSize: "0.8rem",
                  padding: "3px 10px",
                  background: "transparent",
                  color: "var(--text, #e6edf3)",
                  border: "1px solid var(--border, #30363d)",
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
            </>
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
