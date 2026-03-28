export type ModelChainLeg = { keyId: string; model: string; provider: string };

export type WizardState = {
  step: number;
  providerKeys: Array<{ id: string; provider: string; label: string }>;
  modelChain: ModelChainLeg[];
  extensionIds: string[];
  optionalEnv: Record<string, string>;
};
