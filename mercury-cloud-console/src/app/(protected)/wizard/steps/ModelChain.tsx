"use client";

import { useState, useEffect } from "react";
import { KNOWN_PROVIDERS } from "@/lib/providers";
import type { ModelChainLeg } from "@/lib/wizard-types";
import { useWizard } from "../WizardClient";

const MAX_LEGS = 3;

export default function ModelChain() {
  const { state, dispatch } = useWizard();

  const [legs, setLegs] = useState<ModelChainLeg[]>(() => {
    if (state.modelChain.length > 0) return state.modelChain;
    // Initialize with first available key
    const firstKey = state.providerKeys[0];
    if (firstKey) {
      const defaultModel = KNOWN_PROVIDERS[firstKey.provider]?.defaultModel ?? "";
      return [{ keyId: firstKey.id, model: defaultModel, provider: firstKey.provider }];
    }
    return [{ keyId: "", model: "", provider: "" }];
  });

  // Sync to wizard state
  useEffect(() => {
    dispatch({ type: "SET_MODEL_CHAIN", modelChain: legs });
  }, [legs, dispatch]);

  function updateLeg(index: number, updates: Partial<ModelChainLeg>) {
    setLegs((prev) =>
      prev.map((leg, i) => {
        if (i !== index) return leg;
        const updated = { ...leg, ...updates };
        // If keyId changed, update provider and reset model to default
        if (updates.keyId !== undefined && updates.keyId !== leg.keyId) {
          const key = state.providerKeys.find((k) => k.id === updates.keyId);
          if (key) {
            updated.provider = key.provider;
            if (!updates.model) {
              updated.model = KNOWN_PROVIDERS[key.provider]?.defaultModel ?? "";
            }
          }
        }
        return updated;
      }),
    );
  }

  function addLeg() {
    const firstKey = state.providerKeys[0];
    const defaultModel = firstKey ? KNOWN_PROVIDERS[firstKey.provider]?.defaultModel ?? "" : "";
    setLegs((prev) => [
      ...prev,
      { keyId: firstKey?.id ?? "", model: defaultModel, provider: firstKey?.provider ?? "" },
    ]);
  }

  function removeLeg(index: number) {
    setLegs((prev) => prev.filter((_, i) => i !== index));
  }

  const isValid = legs.length > 0 && legs.every((l) => l.keyId && l.model.trim());

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Model Chain</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Configure your agent's model chain. The first model is the primary; additional
        entries act as fallbacks if the primary fails or is rate-limited.
      </p>

      {legs.map((leg, i) => (
        <div
          key={i}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
            }}
          >
            <strong>{i === 0 ? "Primary Model" : `Fallback ${i}`}</strong>
            {i > 0 && (
              <button
                type="button"
                onClick={() => removeLeg(i)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--error, red)",
                  padding: 0,
                }}
              >
                Remove
              </button>
            )}
          </div>

          <label style={{ display: "block", marginBottom: "0.75rem" }}>
            <div className="muted">Provider Key</div>
            <select
              value={leg.keyId}
              onChange={(e) => updateLeg(i, { keyId: e.target.value })}
              style={{ width: "100%" }}
            >
              <option value="">Select a key...</option>
              {state.providerKeys.map((k) => (
                <option key={k.id} value={k.id}>
                  {KNOWN_PROVIDERS[k.provider]?.label ?? k.provider}
                  {k.label ? ` — ${k.label}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "block" }}>
            <div className="muted">Model</div>
            <input
              type="text"
              value={leg.model}
              onChange={(e) => updateLeg(i, { model: e.target.value })}
              placeholder={
                leg.keyId
                  ? (KNOWN_PROVIDERS[
                      state.providerKeys.find((k) => k.id === leg.keyId)?.provider ?? ""
                    ]?.defaultModel ?? "model name")
                  : "model name"
              }
              style={{ width: "100%" }}
            />
          </label>
        </div>
      ))}

      {legs.length < MAX_LEGS && (
        <button
          type="button"
          onClick={addLeg}
          style={{ marginBottom: "1rem" }}
        >
          + Add Fallback
        </button>
      )}

      <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "space-between" }}>
        <button type="button" onClick={() => dispatch({ type: "PREV_STEP" })}>
          ← Back
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "NEXT_STEP" })}
          disabled={!isValid}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
