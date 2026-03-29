"use client";

import { useState, useEffect } from "react";
import { KNOWN_PROVIDERS } from "@/lib/providers";
import { useWizard } from "../WizardClient";
import { OAuthBanner } from "@/app/(protected)/dashboard/keys/OAuthBanner";
import { OAuthConnectModal } from "@/app/(protected)/dashboard/keys/OAuthConnectModal";

type KeyRow = {
  id: string;
  provider: string;
  label: string | null;
  keyType: string;
  createdAt: string;
};

type PostKeyResponse = {
  key?: KeyRow & { maskedKey: string };
  error?: string;
};

type GetKeysResponse = {
  keys?: KeyRow[];
  error?: string;
};

export default function AddKeys() {
  const { state, dispatch } = useWizard();
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthProvider, setOAuthProvider] = useState<string | null>(null);

  const providerOptions = Object.entries(KNOWN_PROVIDERS);
  const selectedMeta = KNOWN_PROVIDERS[provider];

  useEffect(() => {
    async function loadKeys() {
      try {
        const res = await fetch("/api/user/keys");
        const data = (await res.json()) as GetKeysResponse;
        if (res.ok && data.keys) {
          setKeys(data.keys);
          if (data.keys.length === 0) {
            setShowAdd(true);
          }
        }
      } catch {
        setError("Failed to load keys");
      } finally {
        setLoading(false);
      }
    }
    loadKeys();
  }, []);

  // Sync keys to wizard state whenever they change
  useEffect(() => {
    dispatch({
      type: "SET_KEYS",
      keys: keys.map((k) => ({
        id: k.id,
        provider: k.provider,
        label: k.label ?? k.provider,
      })),
    });
  }, [keys, dispatch]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/user/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: apiKey.trim(), label: label.trim() || undefined }),
      });
      const data = (await res.json()) as PostKeyResponse;
      if (!res.ok) throw new Error(data.error ?? "Failed to save key");
      if (data.key) {
        setKeys((prev) => [...prev, { ...data.key!, keyType: "api_key" }]);
      }
      setApiKey("");
      setLabel("");
      setProvider("anthropic");
      setShowAdd(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleOAuthConnected(_keyId: string) {
    setOAuthProvider(null);
    // Reload keys from server to pick up the new OAuth key
    try {
      const res = await fetch("/api/user/keys");
      const data = (await res.json()) as GetKeysResponse;
      if (res.ok && data.keys) setKeys(data.keys);
    } catch {
      // Best-effort; wizard will still advance
    }
  }

  if (loading) {
    return <p className="muted">Loading keys...</p>;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Add Provider Keys</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Add at least one AI provider key. These are stored encrypted and used
        to power your agent.
      </p>

      {keys.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
            Saved keys ({keys.length}):
          </p>
          <p className="muted" style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "0.85rem" }}>
            These keys are shared across all your agents — no need to add them again.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem" }}>
            {keys.map((k) => (
              <li
                key={k.id}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>
                  <strong>{KNOWN_PROVIDERS[k.provider]?.label ?? k.provider}</strong>
                  {k.keyType === "oauth" ? (
                    <span style={{ color: "var(--success, green)", marginLeft: "0.5rem", fontSize: "0.85rem" }}>
                      ✓ Connected
                    </span>
                  ) : k.label ? (
                    <span className="muted" style={{ marginLeft: "0.5rem" }}>
                      ({k.label})
                    </span>
                  ) : null}
                </span>
                <span className="muted" style={{ fontSize: "0.85rem" }}>
                  {new Date(k.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!showAdd && (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          style={{ marginBottom: "1rem" }}
        >
          + Add {keys.length > 0 ? "Another" : ""} Key
        </button>
      )}

      {showAdd && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ marginTop: 0 }}>Add Provider Key</h3>
          <form onSubmit={handleAdd}>
            <label style={{ display: "block", marginBottom: "0.75rem" }}>
              <div className="muted">Provider</div>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                style={{ width: "100%" }}
                disabled={saving}
              >
                {providerOptions.map(([id, meta]) => (
                  <option key={id} value={id}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </label>

            {selectedMeta?.oauthSupported && (
              <OAuthBanner
                meta={selectedMeta}
                onClick={() => { setShowAdd(false); setOAuthProvider(provider); }}
              />
            )}

            <label style={{ display: "block", marginBottom: "0.75rem" }}>
              <div className="muted">API Key</div>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={KNOWN_PROVIDERS[provider]?.placeholder ?? "..."}
                required
                autoComplete="off"
                style={{ width: "100%" }}
                disabled={saving}
              />
            </label>
            <label style={{ display: "block", marginBottom: "0.75rem" }}>
              <div className="muted">Label (optional)</div>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Work key"
                style={{ width: "100%" }}
                disabled={saving}
              />
            </label>
            {error && (
              <p style={{ color: "var(--error, red)", margin: "0 0 0.75rem" }}>{error}</p>
            )}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button type="submit" disabled={saving || !apiKey.trim()}>
                {saving ? "Saving..." : "Save Key"}
              </button>
              {keys.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAdd(false);
                    setError(null);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      <div
        style={{
          marginTop: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <button type="button" onClick={() => dispatch({ type: "PREV_STEP" })}>
          ← Back
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "NEXT_STEP" })}
          disabled={state.providerKeys.length === 0}
        >
          Next →
        </button>
      </div>

      {oauthProvider && KNOWN_PROVIDERS[oauthProvider] && (
        <OAuthConnectModal
          provider={oauthProvider}
          meta={KNOWN_PROVIDERS[oauthProvider]}
          onConnected={handleOAuthConnected}
          onClose={() => setOAuthProvider(null)}
        />
      )}
    </div>
  );
}
