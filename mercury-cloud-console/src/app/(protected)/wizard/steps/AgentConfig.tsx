"use client";

import { useState } from "react";
import { useWizard } from "../WizardClient";

const HOSTNAME_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$|^[a-z0-9]{3}$/;

function isValidHostname(h: string): boolean {
  return h.length >= 3 && h.length <= 30 && HOSTNAME_RE.test(h);
}

type EnvPair = { key: string; value: string };

export default function AgentConfig() {
  const { state, dispatch } = useWizard();
  const [hostname, setHostname] = useState(state.hostname);
  const [showEnv, setShowEnv] = useState(
    Object.keys(state.optionalEnv).length > 0,
  );
  const [envPairs, setEnvPairs] = useState<EnvPair[]>(() => {
    const entries = Object.entries(state.optionalEnv);
    return entries.length > 0
      ? entries.map(([key, value]) => ({ key, value }))
      : [{ key: "", value: "" }];
  });

  const hostnameValid = isValidHostname(hostname);
  const hostnameError =
    hostname.length > 0 && !hostnameValid
      ? "Hostname must be 3-30 characters: lowercase letters, numbers, and hyphens only. Cannot start or end with a hyphen."
      : null;

  function updateEnvPair(index: number, field: "key" | "value", val: string) {
    setEnvPairs((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: val } : p)),
    );
  }

  function addEnvPair() {
    setEnvPairs((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeEnvPair(index: number) {
    setEnvPairs((prev) => prev.filter((_, i) => i !== index));
  }

  function handleNext() {
    dispatch({ type: "SET_HOSTNAME", hostname });
    const optionalEnv: Record<string, string> = {};
    for (const pair of envPairs) {
      if (pair.key.trim() && pair.value.trim()) {
        optionalEnv[pair.key.trim()] = pair.value.trim();
      }
    }
    dispatch({ type: "SET_OPTIONAL_ENV", optionalEnv });
    dispatch({ type: "NEXT_STEP" });
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Agent Configuration</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Choose a hostname for your agent server. This will be used as the server
        name in Hetzner and optionally as a DNS record.
      </p>

      <label style={{ display: "block", marginBottom: "0.25rem" }}>
        <div className="muted">Hostname</div>
        <input
          type="text"
          value={hostname}
          onChange={(e) => setHostname(e.target.value.toLowerCase())}
          placeholder="my-agent"
          style={{
            width: "100%",
            borderColor: hostnameError ? "var(--error, red)" : undefined,
          }}
          maxLength={30}
        />
      </label>
      {hostnameError && (
        <p style={{ color: "var(--error, red)", fontSize: "0.85rem", margin: "0.25rem 0 0.75rem" }}>
          {hostnameError}
        </p>
      )}
      {hostnameValid && (
        <p
          style={{
            color: "var(--success, #3fb950)",
            fontSize: "0.85rem",
            margin: "0.25rem 0 0.75rem",
          }}
        >
          ✓ Valid hostname
        </p>
      )}
      {!hostname && (
        <p style={{ margin: "0.25rem 0 0.75rem" }} />
      )}

      <div style={{ marginTop: "1.25rem" }}>
        <button
          type="button"
          onClick={() => setShowEnv((v) => !v)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            color: "var(--accent, #0070f3)",
            textDecoration: "underline",
            fontSize: "0.9rem",
          }}
        >
          {showEnv ? "▼" : "▶"} Environment Variables (optional)
        </button>

        {showEnv && (
          <div style={{ marginTop: "0.75rem" }}>
            <p className="muted" style={{ fontSize: "0.875rem", marginTop: 0 }}>
              Add extra environment variables to pass into your agent. For
              provider API keys, use the model chain step instead.
            </p>
            {envPairs.map((pair, i) => (
              <div
                key={i}
                style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}
              >
                <input
                  type="text"
                  value={pair.key}
                  onChange={(e) => updateEnvPair(i, "key", e.target.value)}
                  placeholder="KEY"
                  style={{ flex: 1, fontFamily: "monospace" }}
                />
                <span style={{ lineHeight: "2.2rem" }}>=</span>
                <input
                  type="text"
                  value={pair.value}
                  onChange={(e) => updateEnvPair(i, "value", e.target.value)}
                  placeholder="value"
                  style={{ flex: 2, fontFamily: "monospace" }}
                />
                <button
                  type="button"
                  onClick={() => removeEnvPair(i)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--error, red)",
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" onClick={addEnvPair} style={{ fontSize: "0.875rem" }}>
              + Add Variable
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "space-between" }}>
        <button type="button" onClick={() => dispatch({ type: "PREV_STEP" })}>
          ← Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!hostnameValid}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
