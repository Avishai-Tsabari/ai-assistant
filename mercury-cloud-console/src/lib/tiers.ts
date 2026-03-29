export type AgentTier = "starter" | "standard" | "pro";
export const TIER_VALUES = ["starter", "standard", "pro"] as const satisfies AgentTier[];

export const TIER_RESOURCES: Record<AgentTier, { memoryMb: number; cpus: string }> = {
  starter:  { memoryMb: 256,  cpus: "0.25" },
  standard: { memoryMb: 512,  cpus: "0.5"  },
  pro:      { memoryMb: 1024, cpus: "1.0"  },
};

export const TIER_LABELS: Record<AgentTier, string> = {
  starter:  "Starter",
  standard: "Standard",
  pro:      "Pro",
};
