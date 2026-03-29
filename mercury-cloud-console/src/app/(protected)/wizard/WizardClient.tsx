"use client";

import { createContext, useContext, useReducer, type Dispatch } from "react";
import type { WizardState, ModelChainLeg } from "@/lib/wizard-types";
import type { AgentTier } from "@/lib/tiers";
import Welcome from "./steps/Welcome";
import AddKeys from "./steps/AddKeys";
import ModelChain from "./steps/ModelChain";
import Extensions from "./steps/Extensions";
import PlanTier from "./steps/PlanTier";
import Provision from "./steps/Provision";
import Success from "./steps/Success";

const TOTAL_STEPS = 7;

export type WizardAction =
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "SET_STEP"; step: number }
  | { type: "SET_KEYS"; keys: WizardState["providerKeys"] }
  | { type: "SET_MODEL_CHAIN"; modelChain: ModelChainLeg[] }
  | { type: "SET_EXTENSION_IDS"; extensionIds: string[] }
  | { type: "SET_TIER"; tier: AgentTier }
  | { type: "SET_OPTIONAL_ENV"; optionalEnv: Record<string, string> }
  | { type: "RESET" };

const initialState: WizardState = {
  step: 0,
  providerKeys: [],
  modelChain: [],
  extensionIds: [],
  tier: "standard",
  optionalEnv: {},
};

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "NEXT_STEP":
      return { ...state, step: Math.min(state.step + 1, TOTAL_STEPS - 1) };
    case "PREV_STEP":
      return { ...state, step: Math.max(state.step - 1, 0) };
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_KEYS":
      return { ...state, providerKeys: action.keys };
    case "SET_MODEL_CHAIN":
      return { ...state, modelChain: action.modelChain };
    case "SET_EXTENSION_IDS":
      return { ...state, extensionIds: action.extensionIds };
    case "SET_TIER":
      return { ...state, tier: action.tier };
    case "SET_OPTIONAL_ENV":
      return { ...state, optionalEnv: action.optionalEnv };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

type WizardContextValue = {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
};

export const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used inside WizardClient");
  return ctx;
}

const STEP_LABELS = [
  "Welcome",
  "Add Keys",
  "Model Chain",
  "Extensions",
  "Plan",
  "Provision",
  "Done",
];

export default function WizardClient() {
  const [state, dispatch] = useReducer(wizardReducer, initialState);

  const stepComponents = [
    <Welcome key="welcome" />,
    <AddKeys key="addkeys" />,
    <ModelChain key="modelchain" />,
    <Extensions key="extensions" />,
    <PlanTier key="plantier" />,
    <Provision key="provision" />,
    <Success key="success" />,
  ];

  return (
    <WizardContext.Provider value={{ state, dispatch }}>
      <main style={{ maxWidth: "640px", margin: "0 auto", padding: "2rem 1rem" }}>
        <h1 style={{ marginTop: 0, marginBottom: "1.5rem" }}>Setup Wizard</h1>

        {/* Progress indicator */}
        <div style={{ marginBottom: "2rem" }}>
          <div
            style={{
              display: "flex",
              gap: "0.25rem",
              marginBottom: "0.5rem",
            }}
          >
            {STEP_LABELS.map((label, i) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  height: "4px",
                  borderRadius: "2px",
                  background:
                    i < state.step
                      ? "var(--accent, #0070f3)"
                      : i === state.step
                        ? "var(--accent, #0070f3)"
                        : "var(--border, #e5e7eb)",
                  opacity: i === state.step ? 1 : i < state.step ? 0.7 : 0.3,
                }}
              />
            ))}
          </div>
          <p
            className="muted"
            style={{ margin: 0, fontSize: "0.85rem" }}
          >
            Step {state.step + 1} of {TOTAL_STEPS}: {STEP_LABELS[state.step]}
          </p>
        </div>

        <div className="card">{stepComponents[state.step]}</div>
      </main>
    </WizardContext.Provider>
  );
}
