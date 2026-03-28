"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ComputeNode = {
  id: string;
  label: string;
  host: string;
  apiUrl: string;
  maxAgents: number;
  status: "active" | "draining" | "offline";
  createdAt: string;
};

type NodeHealth = {
  status: "ok";
  hostname: string;
  cpuPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  diskUsedPercent: number;
  containerCount: number;
};

type NodeWithHealth = ComputeNode & {
  health: NodeHealth | null;
  healthError?: string;
};

type EnvDefaults = {
  hetznerApiToken: string;
  hetznerDnsToken: string;
  baseDomain: string;
  acmeEmail: string;
  serverType: string;
  location: string;
};

const STATUS_COLOR: Record<string, string> = {
  active: "#3fb950",
  draining: "#e3b341",
  offline: "#6e7681",
};

const SERVER_TYPES = ["cx23", "cx33", "cx43", "cx53","cpx22", "cpx32", "cpx42", "cpx52", "cpx62", "ccx13", "ccx23", "ccx33"];
const LOCATIONS = ["nbg1", "fsn1", "hel1", "ash", "hil", "sin"];

export function NodesClient({
  initialNodes,
  envDefaults,
}: {
  initialNodes: ComputeNode[];
  envDefaults: EnvDefaults;
}) {
  const [nodes, setNodes] = useState<NodeWithHealth[]>(
    initialNodes.map((n) => ({ ...n, health: null })),
  );
  const [loading, setLoading] = useState(false);
  // "register" | "provision" | null
  const [panel, setPanel] = useState<"register" | "provision" | null>(null);

  // Manual registration state
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Hetzner provisioning state
  const [provisionLogs, setProvisionLogs] = useState<string[]>([]);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionDone, setProvisionDone] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/nodes?includeHealth=true");
      const data = await res.json();
      setNodes(data.nodes);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [provisionLogs]);

  const togglePanel = (next: "register" | "provision") => {
    setPanel((cur) => (cur === next ? null : next));
    setAddError(null);
    setProvisionError(null);
    setProvisionLogs([]);
    setProvisionDone(false);
  };

  const setStatus = async (nodeId: string, status: "active" | "draining" | "offline") => {
    await fetch(`/api/admin/nodes/${nodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchHealth();
  };

  const deleteNode = async (nodeId: string, label: string) => {
    if (!confirm(`Remove node "${label}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/nodes/${nodeId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Failed to delete node");
      return;
    }
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
  };

  // ── Manual registration ────────────────────────────────────────────────

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: fd.get("label"),
          host: fd.get("host"),
          apiUrl: fd.get("apiUrl"),
          apiToken: fd.get("apiToken"),
          maxAgents: Number(fd.get("maxAgents") || 100),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "Failed to add node");
        return;
      }
      setPanel(null);
      (e.target as HTMLFormElement).reset();
      await fetchHealth();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAdding(false);
    }
  };

  // ── Hetzner provisioning ───────────────────────────────────────────────

  const handleProvision = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProvisioning(true);
    setProvisionError(null);
    setProvisionLogs([]);
    setProvisionDone(false);

    const fd = new FormData(e.currentTarget);
    const body = {
      label: fd.get("label") as string,
      serverType: fd.get("serverType") as string,
      location: fd.get("location") as string,
      maxAgents: Number(fd.get("maxAgents") || 50),
      hetznerApiToken: fd.get("hetznerApiToken") as string,
      hetznerDnsToken: fd.get("hetznerDnsToken") as string,
      baseDomain: fd.get("baseDomain") as string,
      acmeEmail: fd.get("acmeEmail") as string,
    };

    try {
      const res = await fetch("/api/admin/nodes/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop()!;

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              log?: string;
              error?: string;
              done?: boolean;
            };
            if (event.log) setProvisionLogs((p) => [...p, event.log!]);
            if (event.error) setProvisionError(event.error);
            if (event.done) {
              setProvisionDone(true);
              await fetchHealth();
            }
          } catch {
            // malformed event
          }
        }
      }
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : String(err));
    } finally {
      setProvisioning(false);
    }
  };

  return (
    <>
      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center" }}>
        <button onClick={fetchHealth} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh Health"}
        </button>
        <button onClick={() => togglePanel("register")}>
          {panel === "register" ? "Cancel" : "+ Register Existing"}
        </button>
        <button
          onClick={() => togglePanel("provision")}
          style={{ background: panel === "provision" ? "var(--muted)" : undefined }}
        >
          {panel === "provision" ? "Cancel" : "⚡ Provision on Hetzner"}
        </button>
      </div>

      {/* ── Manual registration form ──────────────────────────────────── */}
      {panel === "register" && (
        <form onSubmit={handleAdd} className="card" style={{ marginBottom: "1.5rem", maxWidth: 520 }}>
          <h3 style={{ marginTop: 0 }}>Register Existing Node</h3>
          {addError && (
            <div style={{ color: "#f85149", marginBottom: "0.75rem", fontSize: "0.9rem" }}>
              {addError}
            </div>
          )}
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <label style={labelStyle}>
              Label
              <input name="label" placeholder="hetzner-fra-1" required style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Host IP / Hostname
              <input name="host" placeholder="10.0.0.1" required style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Node Agent URL
              <input name="apiUrl" type="url" placeholder="http://10.0.0.1:9090" required style={inputStyle} />
            </label>
            <label style={labelStyle}>
              API Token
              <input name="apiToken" type="password" placeholder="your-secure-token" required style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Max Agents
              <input name="maxAgents" type="number" defaultValue={100} min={1} max={500} style={inputStyle} />
            </label>
            <button type="submit" disabled={adding}>
              {adding ? "Verifying & Registering…" : "Register Node"}
            </button>
          </div>
        </form>
      )}

      {/* ── Hetzner provisioning form ─────────────────────────────────── */}
      {panel === "provision" && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 560 }}>
          <h3 style={{ marginTop: 0 }}>Provision New Node on Hetzner</h3>
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
            Creates a server, installs Docker, starts the node agent, and registers it here.
            Takes ~5–8 minutes.
          </p>

          {!provisioning && !provisionDone && (
            <form onSubmit={handleProvision}>
              {provisionError && (
                <div style={{ color: "#f85149", marginBottom: "0.75rem", fontSize: "0.9rem" }}>
                  {provisionError}
                </div>
              )}
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <label style={labelStyle}>
                    Label
                    <input name="label" placeholder="hetzner-nbg-1" required style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    Max Agents
                    <input name="maxAgents" type="number" defaultValue={50} min={1} max={500} style={inputStyle} />
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <label style={labelStyle}>
                    Server Type
                    <select name="serverType" defaultValue={envDefaults.serverType} style={inputStyle}>
                      {SERVER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label style={labelStyle}>
                    Location
                    <select name="location" defaultValue={envDefaults.location} style={inputStyle}>
                      {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </label>
                </div>
                <label style={labelStyle}>
                  Hetzner Cloud API Token
                  <input
                    name="hetznerApiToken"
                    type="password"
                    defaultValue={envDefaults.hetznerApiToken}
                    placeholder="htz_..."
                    required
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Hetzner DNS API Token
                  <small className="muted" style={{ fontWeight: 400 }}> (for Traefik wildcard TLS)</small>
                  <input
                    name="hetznerDnsToken"
                    type="password"
                    defaultValue={envDefaults.hetznerDnsToken}
                    placeholder="htz_dns_..."
                    required
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Base Domain
                  <input
                    name="baseDomain"
                    defaultValue={envDefaults.baseDomain}
                    placeholder="agents.example.com"
                    required
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  ACME Email
                  <input
                    name="acmeEmail"
                    type="email"
                    defaultValue={envDefaults.acmeEmail}
                    placeholder="admin@example.com"
                    required
                    style={inputStyle}
                  />
                </label>
                <button type="submit">Start Provisioning</button>
              </div>
            </form>
          )}

          {/* Live log output */}
          {(provisioning || provisionLogs.length > 0) && (
            <div style={{
              marginTop: "1rem",
              background: "#0d1117",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "0.75rem",
              fontFamily: "monospace",
              fontSize: "0.8rem",
              maxHeight: "280px",
              overflowY: "auto",
              color: "#e6edf3",
            }}>
              {provisionLogs.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              {provisioning && (
                <div style={{ color: "#3fb950" }}>█</div>
              )}
              {provisionError && (
                <div style={{ color: "#f85149", marginTop: "0.5rem" }}>
                  Error: {provisionError}
                </div>
              )}
              {provisionDone && (
                <div style={{ color: "#3fb950", marginTop: "0.5rem" }}>
                  Done! Node is now active.
                </div>
              )}
              <div ref={logsEndRef} />
            </div>
          )}

          {provisionDone && (
            <button
              onClick={() => { setPanel(null); setProvisionLogs([]); setProvisionDone(false); }}
              style={{ marginTop: "0.75rem" }}
            >
              Close
            </button>
          )}
        </div>
      )}

      {/* ── Node table ────────────────────────────────────────────────── */}
      {nodes.length === 0 ? (
        <div className="card" style={{ color: "var(--muted)", textAlign: "center", padding: "2rem" }}>
          No compute nodes registered yet.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
              <th style={th}>Label</th>
              <th style={th}>Host</th>
              <th style={th}>Status</th>
              <th style={th}>Agents</th>
              <th style={th}>CPU</th>
              <th style={th}>Memory</th>
              <th style={th}>Disk</th>
              <th style={th}>Max</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => (
              <tr key={node.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={td}><strong>{node.label}</strong></td>
                <td style={{ ...td, fontFamily: "monospace", fontSize: "0.85rem" }} className="muted">
                  {node.host}
                </td>
                <td style={td}>
                  <span style={{ color: STATUS_COLOR[node.status] ?? "var(--muted)" }}>
                    ● {node.status}
                  </span>
                </td>
                <td style={td}>
                  {node.health ? (
                    <span>
                      {node.health.containerCount}
                      <span className="muted"> / {node.maxAgents}</span>
                    </span>
                  ) : <span className="muted">—</span>}
                </td>
                <td style={td}>
                  {node.health ? (
                    <span style={{ color: node.health.cpuPercent > 80 ? "#f85149" : "inherit" }}>
                      {node.health.cpuPercent}%
                    </span>
                  ) : <span className="muted">—</span>}
                </td>
                <td style={td}>
                  {node.health ? (
                    <span style={{
                      color: node.health.memoryUsedMb / node.health.memoryTotalMb > 0.85 ? "#f85149" : "inherit",
                    }}>
                      {Math.round(node.health.memoryUsedMb / 1024)}
                      <span className="muted"> / {Math.round(node.health.memoryTotalMb / 1024)} GB</span>
                    </span>
                  ) : <span className="muted">—</span>}
                </td>
                <td style={td}>
                  {node.health ? (
                    <span style={{ color: node.health.diskUsedPercent > 85 ? "#f85149" : "inherit" }}>
                      {node.health.diskUsedPercent}%
                    </span>
                  ) : <span className="muted">—</span>}
                </td>
                <td style={td} className="muted">{node.maxAgents}</td>
                <td style={td}>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {node.status !== "active" && (
                      <button style={smallBtn} onClick={() => setStatus(node.id, "active")}>
                        Activate
                      </button>
                    )}
                    {node.status === "active" && (
                      <button
                        style={{ ...smallBtn, color: "#e3b341" }}
                        onClick={() => setStatus(node.id, "draining")}
                      >
                        Drain
                      </button>
                    )}
                    <button
                      style={{ ...smallBtn, color: "#f85149" }}
                      onClick={() => deleteNode(node.id, node.label)}
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

const th: React.CSSProperties = { padding: "0.5rem 0.75rem", fontWeight: 600, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "0.5rem 0.75rem", whiteSpace: "nowrap" };
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.9rem" };
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box" };
const smallBtn: React.CSSProperties = {
  padding: "0.2rem 0.6rem",
  fontSize: "0.8rem",
  background: "transparent",
  border: "1px solid var(--border)",
  cursor: "pointer",
  borderRadius: "4px",
};
