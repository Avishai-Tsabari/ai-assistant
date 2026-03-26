"use client";

import { useState } from "react";
import { KNOWN_PROVIDERS } from "@/lib/providers";
import { OAuthBanner } from "./OAuthBanner";
import { OAuthConnectModal } from "./OAuthConnectModal";

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

export function KeysClient({ initialKeys }: { initialKeys: KeyRow[] }) {
  const [keys, setKeys] = useState<KeyRow[]>(initialKeys);
  const [showAdd, setShowAdd] = useState(false);
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editKey, setEditKey] = useState("");
  const [oauthProvider, setOAuthProvider] = useState<string | null>(null);

  const providerOptions = Object.entries(KNOWN_PROVIDERS);
  const selectedMeta = KNOWN_PROVIDERS[provider];

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
      const data = await res.json() as PostKeyResponse;
      if (!res.ok) throw new Error(data.error ?? "Failed to save key");
      setKeys((prev) => [...prev, { ...data.key!, keyType: "api_key" }]);
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

  async function handleDelete(id: string) {
    if (!confirm("Delete this key? Agents using it will stop working until reconfigured.")) return;
    try {
      const res = await fetch(`/api/user/keys/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Delete failed");
      }
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleUpdate(id: string) {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string> = { label: editLabel };
      if (editKey.trim()) body.apiKey = editKey.trim();
      const res = await fetch(`/api/user/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Update failed");
      }
      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, label: editLabel || null } : k)),
      );
      setEditId(null);
      setEditKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleOAuthConnected(_keyId: string) {
    setOAuthProvider(null);
    try {
      const res = await fetch("/api/user/keys");
      const data = await res.json() as { keys?: KeyRow[] };
      if (res.ok && data.keys) setKeys(data.keys);
    } catch {
      // best-effort; key will appear on next page load
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ margin: 0 }}>Provider Keys</h2>
        <button type="button" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Cancel" : "+ Add Key"}
        </button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
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
                  <option key={id} value={id}>{meta.label}</option>
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
            {error && <p style={{ color: "var(--error, red)", margin: "0 0 0.75rem" }}>{error}</p>}
            <button type="submit" disabled={saving || !apiKey.trim()}>
              {saving ? "Saving…" : "Save Key"}
            </button>
          </form>
        </div>
      )}

      {keys.length === 0 ? (
        <p className="muted">No keys saved yet. Add one to start using a model provider.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
              <th style={th}>Provider</th>
              <th style={th}>Label / Status</th>
              <th style={th}>Added</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={td}>
                  <strong>{KNOWN_PROVIDERS[k.provider]?.label ?? k.provider}</strong>
                </td>
                <td style={td}>
                  {editId === k.id ? (
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      style={{ width: "100%" }}
                      disabled={saving}
                    />
                  ) : k.keyType === "oauth" ? (
                    <span style={{ color: "var(--success, green)", fontWeight: 500 }}>
                      ✓ Connected
                    </span>
                  ) : (
                    <span className="muted">{k.label ?? "—"}</span>
                  )}
                </td>
                <td style={td} className="muted">
                  {new Date(k.createdAt).toLocaleDateString()}
                </td>
                <td style={td}>
                  {editId === k.id ? (
                    <span style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {k.keyType !== "oauth" && (
                        <input
                          type="password"
                          value={editKey}
                          onChange={(e) => setEditKey(e.target.value)}
                          placeholder="New key (leave blank to keep current)"
                          autoComplete="off"
                          style={{ width: "100%" }}
                          disabled={saving}
                        />
                      )}
                      <span style={{ display: "flex", gap: "0.5rem" }}>
                        <button type="button" onClick={() => handleUpdate(k.id)} disabled={saving}>
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button type="button" onClick={() => { setEditId(null); setEditKey(""); setEditLabel(""); }}>
                          Cancel
                        </button>
                      </span>
                      {error && <span style={{ color: "var(--error, red)", fontSize: "0.85rem" }}>{error}</span>}
                    </span>
                  ) : (
                    <span style={{ display: "flex", gap: "0.75rem" }}>
                      {k.keyType !== "oauth" && (
                        <button
                          type="button"
                          onClick={() => { setEditId(k.id); setEditLabel(k.label ?? ""); setEditKey(""); setError(null); }}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--accent, #0070f3)", textDecoration: "underline" }}
                        >
                          Edit
                        </button>
                      )}
                      {k.keyType === "oauth" && KNOWN_PROVIDERS[k.provider]?.oauthSupported && (
                        <button
                          type="button"
                          onClick={() => setOAuthProvider(k.provider)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--accent, #0070f3)", textDecoration: "underline" }}
                        >
                          Reconnect
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(k.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--error, red)", textDecoration: "underline" }}
                      >
                        Disconnect
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

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

const th: React.CSSProperties = { padding: "0.5rem 0.75rem", fontWeight: 600, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "0.5rem 0.75rem" };
