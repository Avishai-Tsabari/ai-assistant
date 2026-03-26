"use client";

import { useState, useEffect } from "react";
import { useWizard } from "../WizardClient";

type ExtensionRow = {
  id: string;
  display_name: string;
  description: string;
  monthly_price_usd: number;
};

type CatalogResponse = {
  extensions?: ExtensionRow[];
  error?: string;
};

export default function Extensions() {
  const { state, dispatch } = useWizard();
  const [extensions, setExtensions] = useState<ExtensionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(state.extensionIds),
  );

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/user/catalog");
        const data = (await res.json()) as CatalogResponse;
        if (!res.ok) throw new Error(data.error ?? "Failed to load catalog");
        setExtensions(data.extensions ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function toggleExtension(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const monthlyTotal = extensions
    .filter((e) => selected.has(e.id))
    .reduce((sum, e) => sum + e.monthly_price_usd, 0);

  function handleNext() {
    dispatch({ type: "SET_EXTENSION_IDS", extensionIds: Array.from(selected) });
    dispatch({ type: "NEXT_STEP" });
  }

  if (loading) {
    return <p className="muted">Loading extensions catalog...</p>;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Extensions (Optional)</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Enhance your agent with optional extensions. You can skip this step and
        add extensions later.
      </p>

      {error && (
        <p style={{ color: "var(--error, red)" }}>{error}</p>
      )}

      {extensions.length === 0 && !error && (
        <p className="muted">No extensions available in the catalog.</p>
      )}

      {extensions.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          {extensions.map((ext) => (
            <label
              key={ext.id}
              style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "flex-start",
                padding: "0.75rem",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                marginBottom: "0.5rem",
                cursor: "pointer",
                background: selected.has(ext.id)
                  ? "color-mix(in srgb, var(--accent, #0070f3) 5%, transparent)"
                  : undefined,
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(ext.id)}
                onChange={() => toggleExtension(ext.id)}
                style={{ marginTop: "2px", flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{ext.display_name}</div>
                <div className="muted" style={{ fontSize: "0.875rem", marginTop: "0.2rem" }}>
                  {ext.description}
                </div>
              </div>
              <div
                style={{
                  flexShrink: 0,
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  color: ext.monthly_price_usd === 0 ? "var(--success, #3fb950)" : undefined,
                }}
              >
                {ext.monthly_price_usd === 0
                  ? "Free"
                  : `$${ext.monthly_price_usd.toFixed(2)}/mo`}
              </div>
            </label>
          ))}

          {selected.size > 0 && (
            <div
              style={{
                padding: "0.75rem",
                borderRadius: "6px",
                background: "var(--card-bg, #f9fafb)",
                border: "1px solid var(--border)",
                marginTop: "1rem",
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 600,
              }}
            >
              <span>
                {selected.size} extension{selected.size !== 1 ? "s" : ""} selected
              </span>
              <span>
                {monthlyTotal === 0
                  ? "Free"
                  : `$${monthlyTotal.toFixed(2)}/mo total`}
              </span>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "space-between" }}>
        <button type="button" onClick={() => dispatch({ type: "PREV_STEP" })}>
          ← Back
        </button>
        <button type="button" onClick={handleNext}>
          Next →
        </button>
      </div>
    </div>
  );
}
