"use client";

import type { AgentTier } from "@/lib/tiers";
import { TIER_LABELS, TIER_RESOURCES, TIER_VALUES } from "@/lib/tiers";
import { useWizard } from "../WizardClient";

type TierCardProps = {
  tier: AgentTier;
  tagline: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
};

function TierCard({ tier, tagline, description, selected, onSelect }: TierCardProps) {
  const label = TIER_LABELS[tier];
  const { memoryMb, cpus } = TIER_RESOURCES[tier];
  const ram = memoryMb >= 1024 ? `${memoryMb / 1024} GB` : `${memoryMb} MB`;
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "1rem 1.25rem",
        border: selected
          ? "2px solid var(--accent, #0070f3)"
          : "2px solid var(--border, #e5e7eb)",
        borderRadius: "8px",
        background: selected
          ? "color-mix(in srgb, var(--accent, #0070f3) 6%, transparent)"
          : "transparent",
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
        <span style={{ fontWeight: 600, fontSize: "1rem" }}>{label}</span>
        <span className="muted" style={{ fontSize: "0.8rem" }}>{tagline}</span>
      </div>
      <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "0.8rem", fontFamily: "monospace", color: "var(--accent, #0070f3)" }}>
          {ram} RAM
        </span>
        <span style={{ fontSize: "0.8rem", fontFamily: "monospace", color: "var(--accent, #0070f3)" }}>
          {cpus} CPU
        </span>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.5 }}>
        {description}
      </p>
    </button>
  );
}

const TIER_META: Record<AgentTier, { tagline: string; description: string }> = {
  starter: {
    tagline: "Try it out",
    description:
      "Explore Mercury's capabilities with light, single-user chat. Good for evaluation before committing to a plan.",
  },
  standard: {
    tagline: "Everyday use",
    description:
      "The right fit for daily personal use. Handles typical conversations and a couple of extensions comfortably.",
  },
  pro: {
    tagline: "Power users",
    description:
      "Built for developers, group chats, and heavy extension workflows. Runs code execution, web search, and knowledge tools simultaneously.",
  },
};

export default function PlanTier() {
  const { state, dispatch } = useWizard();

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Choose Your Plan</h2>
      <p className="muted" style={{ marginTop: 0, marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        Pick the compute tier that matches how you'll use Mercury. You can upgrade later.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {TIER_VALUES.map((tier) => (
          <TierCard
            key={tier}
            tier={tier}
            {...TIER_META[tier]}
            selected={state.tier === tier}
            onSelect={() => dispatch({ type: "SET_TIER", tier })}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button
          type="button"
          onClick={() => dispatch({ type: "PREV_STEP" })}
          style={{ fontSize: "1rem", padding: "0.6rem 1.25rem" }}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "NEXT_STEP" })}
          style={{ fontSize: "1rem", padding: "0.6rem 1.5rem" }}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
