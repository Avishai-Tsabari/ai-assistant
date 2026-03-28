"use client";

import { useEffect, useRef, useState } from "react";
import { useWizard } from "../WizardClient";

type DoneData = {
  agentId: string;
  ipv4: string;
  dashboardUrl: string;
  status: "healthy" | "provisioning_in_progress";
};

export default function Provision() {
  const { state, dispatch } = useWizard();
  const [logs, setLogs] = useState<string[]>(["Starting provisioning..."]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const startedRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function run() {
      try {
        const body = {
          modelChain: state.modelChain.map((leg) => ({
            keyId: leg.keyId,
            model: leg.model,
          })),
          extensionIds: state.extensionIds,
          optionalEnv: state.optionalEnv,
        };

        const res = await fetch("/api/user/provision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok || !res.body) {
          const text = await res.text();
          let msg = "Provision request failed";
          try {
            const j = JSON.parse(text) as { error?: string };
            if (j.error) msg = j.error;
          } catch {
            // ignore
          }
          setError(msg);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.trim()) continue;

            let eventType = "message";
            let dataLine = "";

            for (const line of part.split("\n")) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                dataLine = line.slice(6).trim();
              }
            }

            if (!dataLine) continue;

            try {
              const data = JSON.parse(dataLine) as Record<string, unknown>;

              if (eventType === "progress") {
                const message = (data.message as string) ?? dataLine;
                setLogs((prev) => [...prev, message]);
              } else if (eventType === "done") {
                const doneData = data as unknown as DoneData;
                setLogs((prev) => [
                  ...prev,
                  `Agent provisioned! ID: ${doneData.agentId}`,
                ]);
                setDone(true);
                // Store result in optional env as a transfer hack — use SET_STEP with data
                // Actually advance to success with result data via a custom approach
                dispatch({
                  type: "SET_OPTIONAL_ENV",
                  optionalEnv: {
                    ...state.optionalEnv,
                    __done_agentId: doneData.agentId,
                    __done_ipv4: doneData.ipv4,
                    __done_dashboardUrl: doneData.dashboardUrl,
                    __done_status: doneData.status,
                  },
                });
                setTimeout(() => {
                  dispatch({ type: "NEXT_STEP" });
                }, 1000);
              } else if (eventType === "error") {
                const msg = (data.message as string) ?? "Unknown error";
                setError(msg);
              }
            } catch {
              // non-JSON line, skip
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>
        {error ? "Provisioning Failed" : done ? "Provisioning Complete!" : "Provisioning Your Agent..."}
      </h2>

      {!error && !done && (
        <p className="muted" style={{ marginTop: 0 }}>
          Setting up your agent — this usually takes a few seconds.
        </p>
      )}

      <div
        style={{
          background: "var(--code-bg, #1a1a2e)",
          color: "var(--code-fg, #e2e8f0)",
          borderRadius: "6px",
          padding: "1rem",
          fontFamily: "monospace",
          fontSize: "0.85rem",
          maxHeight: "300px",
          overflowY: "auto",
          marginBottom: "1rem",
        }}
      >
        {logs.map((log, i) => (
          <div key={i} style={{ lineHeight: 1.6 }}>
            <span style={{ color: "var(--muted, #64748b)", marginRight: "0.5rem" }}>›</span>
            {log}
          </div>
        ))}
        {!error && !done && (
          <div style={{ color: "var(--accent, #0070f3)", marginTop: "0.5rem" }}>
            <span
              style={{
                display: "inline-block",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            >
              ●
            </span>{" "}
            Running...
          </div>
        )}
        <div ref={logEndRef} />
      </div>

      {error && (
        <div>
          <p style={{ color: "var(--error, red)", margin: "0 0 1rem" }}>
            Error: {error}
          </p>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "SET_STEP", step: 3 });
            }}
          >
            ← Try Again
          </button>
        </div>
      )}
    </div>
  );
}
