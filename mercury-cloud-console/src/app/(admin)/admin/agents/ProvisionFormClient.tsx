"use client";

import { useEffect, useRef, useState } from "react";

type UserOption = { id: string; email: string };
type ExtOption = { id: string; display_name: string; description: string; monthly_price_usd: number };

export function ProvisionFormClient() {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [extensions, setExtensions] = useState<ExtOption[]>([]);

  // Form fields
  const [userId, setUserId] = useState("");
  const [hostname, setHostname] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [selectedExts, setSelectedExts] = useState<string[]>([]);

  // SSE state
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ agentId: string; ipv4: string; dashboardUrl: string; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!open || users.length > 0) return;
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/catalog").then((r) => r.json()),
    ]).then(([ud, cd]) => {
      setUsers((ud.users ?? []) as UserOption[]);
      setExtensions((cd.extensions ?? []) as ExtOption[]);
      if ((ud.users ?? []).length > 0) setUserId((ud.users as UserOption[])[0].id);
    }).catch(() => {/* silently ignore */});
  }, [open, users.length]);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  function toggleExt(id: string) {
    setSelectedExts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setLog([]);
    setResult(null);
    setError(null);

    let res: Response;
    try {
      res = await fetch("/api/admin/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          hostname: hostname.trim(),
          anthropicApiKey: apiKey.trim(),
          extensionIds: selectedExts,
        }),
      });
    } catch (err) {
      setError(String(err));
      setRunning(false);
      return;
    }

    if (!res.ok || !res.body) {
      const msg = await res.text().catch(() => `HTTP ${res.status}`);
      setError(msg);
      setRunning(false);
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });

      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";

      for (const part of parts) {
        const lines = part.split("\n");
        const eventLine = lines.find((l) => l.startsWith("event:"));
        const dataLine = lines.find((l) => l.startsWith("data:"));
        if (!eventLine || !dataLine) continue;

        const eventType = eventLine.slice("event:".length).trim();
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(dataLine.slice("data:".length).trim()) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (eventType === "progress") {
          setLog((prev) => [...prev, String(data.message ?? "")]);
        } else if (eventType === "done") {
          const status = String(data.status ?? "");
          setLog((prev) => [
            ...prev,
            status === "healthy"
              ? "Agent is healthy and ready."
              : "Provisioning in progress — agent will be ready in a few minutes.",
          ]);
          setResult({
            agentId: String(data.agentId),
            ipv4: String(data.ipv4),
            dashboardUrl: String(data.dashboardUrl),
            status,
          });
          setRunning(false);
        } else if (eventType === "error") {
          setError(String(data.message ?? "Unknown error"));
          setRunning(false);
        }
      }
    }
    if (running) setRunning(false);
  }

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ marginBottom: open ? "1rem" : 0 }}
      >
        {open ? "▲ Hide provision form" : "＋ Provision New Agent"}
      </button>

      {open && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Provision New Agent</h3>
          <form onSubmit={handleSubmit}>
            <label style={{ display: "block", marginBottom: "0.75rem" }}>
              <div className="muted">User</div>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
                style={{ width: "100%" }}
                disabled={running}
              >
                <option value="" disabled>Select a user…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.email}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "block", marginBottom: "0.75rem" }}>
              <div className="muted">Hostname (e.g. alice-agent)</div>
              <input
                type="text"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                required
                pattern="[a-z0-9-]+"
                title="Lowercase letters, numbers, and hyphens only"
                style={{ width: "100%" }}
                disabled={running}
              />
            </label>

            <label style={{ display: "block", marginBottom: "0.75rem" }}>
              <div className="muted">Anthropic API Key</div>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
                autoComplete="off"
                style={{ width: "100%" }}
                disabled={running}
              />
            </label>

            {extensions.length > 0 && (
              <div style={{ marginBottom: "0.75rem" }}>
                <div className="muted" style={{ marginBottom: "0.4rem" }}>Extensions</div>
                {extensions.map((ext) => (
                  <label key={ext.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                    <input
                      type="checkbox"
                      checked={selectedExts.includes(ext.id)}
                      onChange={() => toggleExt(ext.id)}
                      disabled={running}
                    />
                    <span>
                      {ext.display_name}
                      {ext.monthly_price_usd > 0 && (
                        <span className="muted"> (+${ext.monthly_price_usd}/mo)</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <button type="submit" disabled={running || !userId || !hostname || !apiKey}>
              {running ? "Provisioning…" : "Provision"}
            </button>
          </form>

          {(log.length > 0 || error) && (
            <div style={{ marginTop: "1rem" }}>
              <pre
                ref={logRef}
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  padding: "0.75rem",
                  maxHeight: "200px",
                  overflowY: "auto",
                  fontSize: "0.85rem",
                  margin: 0,
                }}
              >
                {log.map((line) => `${line}\n`).join("")}
                {error && <span style={{ color: "var(--error, red)" }}>Error: {error}</span>}
              </pre>

              {result && (
                <div style={{ marginTop: "0.75rem" }}>
                  <span style={{ color: result.status === "healthy" ? "green" : "orange" }}>
                    {result.status === "healthy" ? "✓ Healthy" : "⏳ Booting"}
                  </span>
                  {" — "}
                  <a href={result.dashboardUrl} target="_blank" rel="noreferrer">
                    Open dashboard ({result.ipv4})
                  </a>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--accent, #0070f3)", textDecoration: "underline" }}
                  >
                    Refresh agent list
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
