"use client";

import Link from "next/link";
import { useWizard } from "../WizardClient";

export default function Success() {
  const { state, dispatch } = useWizard();

  // Result data was stored in optionalEnv with __done_ prefix during provisioning
  const agentId = state.optionalEnv.__done_agentId ?? "";
  const ipv4 = state.optionalEnv.__done_ipv4 ?? "";
  const dashboardUrl = state.optionalEnv.__done_dashboardUrl ?? "";
  const status = state.optionalEnv.__done_status ?? "";

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Your agent is ready!</h2>

      {status === "provisioning_in_progress" && (
        <div
          style={{
            background: "color-mix(in srgb, var(--warning, #f59e0b) 10%, transparent)",
            border: "1px solid var(--warning, #f59e0b)",
            borderRadius: "6px",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            fontSize: "0.9rem",
          }}
        >
          The server is still starting up. Your agent will be ready in a few
          minutes. Check the dashboard URL below once it's up.
        </div>
      )}

      {status === "healthy" && (
        <div
          style={{
            background: "color-mix(in srgb, var(--success, #3fb950) 10%, transparent)",
            border: "1px solid var(--success, #3fb950)",
            borderRadius: "6px",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            fontSize: "0.9rem",
          }}
        >
          Agent is live and healthy!
        </div>
      )}

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "6px",
          overflow: "hidden",
          marginBottom: "1.5rem",
        }}
      >
        <div style={rowStyle}>
          <span className="muted">Agent ID</span>
          <code style={{ fontSize: "0.85rem" }}>{agentId}</code>
        </div>
        {ipv4 && (
          <div style={rowStyle}>
            <span className="muted">IP Address</span>
            <code style={{ fontSize: "0.85rem" }}>{ipv4}</code>
          </div>
        )}
        <div style={rowStyle}>
          <span className="muted">Dashboard URL</span>
          {dashboardUrl ? (
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent, #0070f3)", wordBreak: "break-all" }}
            >
              {dashboardUrl}
            </a>
          ) : (
            <span className="muted">—</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link href="/dashboard">
          <button type="button" style={{ fontSize: "1rem", padding: "0.6rem 1.25rem" }}>
            Go to Dashboard
          </button>
        </Link>
        <button
          type="button"
          onClick={() => dispatch({ type: "RESET" })}
          style={{ fontSize: "1rem", padding: "0.6rem 1.25rem" }}
        >
          Provision Another Agent
        </button>
      </div>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0.65rem 1rem",
  borderBottom: "1px solid var(--border)",
  gap: "1rem",
};
