"use client";

import { useWizard } from "../WizardClient";

export default function Welcome() {
  const { dispatch } = useWizard();

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Provision Your Mercury Agent</h2>
      <p>
        Mercury is a managed AI agent platform. This wizard will guide you
        through provisioning your agent with your preferred AI model providers.
      </p>
      <p>In the next few steps you will:</p>
      <ol style={{ paddingLeft: "1.25rem", lineHeight: 1.8 }}>
        <li>Add your AI provider API keys (Anthropic, OpenAI, etc.)</li>
        <li>Configure a model chain with primary and fallback models</li>
        <li>Choose optional extensions to enhance your agent</li>
        <li>Launch the provisioning process</li>
      </ol>
      <p className="muted" style={{ fontSize: "0.9rem" }}>
        Provisioning typically takes under a minute. Your agent will run in a
        managed container and be accessible via a dashboard URL.
      </p>
      <div style={{ marginTop: "1.5rem" }}>
        <button
          type="button"
          onClick={() => dispatch({ type: "NEXT_STEP" })}
          style={{ fontSize: "1rem", padding: "0.6rem 1.5rem" }}
        >
          Get Started →
        </button>
      </div>
    </div>
  );
}
