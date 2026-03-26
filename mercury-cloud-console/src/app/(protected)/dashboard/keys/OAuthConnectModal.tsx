"use client";

import { useState, useEffect, useRef } from "react";
import type { ProviderMeta } from "@/lib/providers";

type OAuthConnectModalProps = {
  provider: string;
  meta: ProviderMeta;
  onConnected: (keyId: string) => void;
  onClose: () => void;
};

type StartResponsePkce = { sessionId: string; authUrl: string };
type StartResponseDevice = {
  sessionId: string;
  userCode: string;
  verificationUri: string;
  interval: number;
};

export function OAuthConnectModal({ provider, meta, onConnected, onClose }: OAuthConnectModalProps) {
  const [step, setStep] = useState<"idle" | "started" | "pasting" | "polling" | "done" | "error">("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUri, setVerificationUri] = useState<string | null>(null);
  const [pastedValue, setPastedValue] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState(5);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear polling timer on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  async function handleStart() {
    setErrorMsg(null);
    setStep("started");
    try {
      const res = await fetch(`/api/user/oauth/${provider}/start`, { method: "POST" });
      const data = await res.json() as StartResponsePkce & StartResponseDevice & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to start OAuth");

      setSessionId(data.sessionId);

      if (meta.oauthType === "pkce") {
        setAuthUrl(data.authUrl);
        window.open(data.authUrl, "_blank", "noopener");
        setStep("pasting");
      } else {
        // device flow
        setUserCode(data.userCode);
        setVerificationUri(data.verificationUri);
        setPollInterval(data.interval ?? 5);
        setStep("polling");
        schedulePoll(data.sessionId, data.interval ?? 5);
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  }

  async function handleComplete() {
    if (!sessionId || !pastedValue.trim()) return;
    setErrorMsg(null);
    setStep("started");
    try {
      const res = await fetch(`/api/user/oauth/${provider}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, pastedValue: pastedValue.trim() }),
      });
      const data = await res.json() as { ok?: boolean; keyId?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Connection failed");
      setStep("done");
      onConnected(data.keyId!);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStep("pasting");
    }
  }

  function schedulePoll(sid: string, interval: number) {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/user/oauth/${provider}/poll?sessionId=${encodeURIComponent(sid)}`,
        );
        const data = await res.json() as {
          status: "pending" | "slow_down" | "complete";
          interval?: number;
          keyId?: string;
          error?: string;
        };

        if (!res.ok) throw new Error(data.error ?? "Poll failed");

        if (data.status === "complete") {
          setStep("done");
          onConnected(data.keyId!);
        } else if (data.status === "slow_down") {
          const newInterval = data.interval ?? interval * 2;
          setPollInterval(newInterval);
          schedulePoll(sid, newInterval);
        } else {
          schedulePoll(sid, interval);
        }
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setStep("error");
      }
    }, interval * 1000);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 480, padding: "2rem", position: "relative" }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            background: "none",
            border: "none",
            fontSize: "1.25rem",
            cursor: "pointer",
            color: "var(--muted)",
          }}
          aria-label="Close"
        >
          ×
        </button>

        <h2 style={{ marginTop: 0 }}>{meta.oauthLabel ?? `Connect ${meta.label}`}</h2>

        {step === "done" ? (
          <div>
            <p style={{ color: "var(--success, green)" }}>
              ✓ Connected successfully! Your {meta.label} account is now linked.
            </p>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        ) : meta.oauthType === "pkce" ? (
          <PkceFlow
            step={step}
            authUrl={authUrl}
            pastedValue={pastedValue}
            errorMsg={errorMsg}
            providerLabel={meta.label}
            onChange={setPastedValue}
            onStart={handleStart}
            onComplete={handleComplete}
          />
        ) : (
          <DeviceFlow
            step={step}
            userCode={userCode}
            verificationUri={verificationUri}
            errorMsg={errorMsg}
            pollInterval={pollInterval}
            providerLabel={meta.label}
            onStart={handleStart}
          />
        )}
      </div>
    </div>
  );
}

// ─── PKCE (Anthropic) sub-component ─────────────────────────────────────────

function PkceFlow({
  step,
  authUrl,
  pastedValue,
  errorMsg,
  providerLabel,
  onChange,
  onStart,
  onComplete,
}: {
  step: "idle" | "started" | "pasting" | "polling" | "done" | "error";
  authUrl: string | null;
  pastedValue: string;
  errorMsg: string | null;
  providerLabel: string;
  onChange: (v: string) => void;
  onStart: () => void;
  onComplete: () => void;
}) {
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Connect your {providerLabel} account. You need an active Claude Pro or Max subscription.
      </p>

      {step === "idle" && (
        <button type="button" onClick={onStart}>
          Open {providerLabel} Login →
        </button>
      )}

      {step === "started" && <p className="muted">Opening login page…</p>}

      {step === "pasting" && (
        <div>
          <p className="muted">
            After you approve in the new tab, {providerLabel} will show you a code. Copy and paste
            it below — the full URL or just the code are both fine.
          </p>
          {authUrl && (
            <p style={{ fontSize: "0.85rem" }}>
              <a href={authUrl} target="_blank" rel="noopener noreferrer">
                Re-open login page
              </a>
            </p>
          )}
          <label style={{ display: "block", marginBottom: "0.75rem" }}>
            <div className="muted" style={{ marginBottom: "0.25rem" }}>
              Paste code here
            </div>
            <textarea
              value={pastedValue}
              onChange={(e) => onChange(e.target.value)}
              rows={3}
              style={{ width: "100%", fontFamily: "monospace", fontSize: "0.85rem" }}
              placeholder="https://console.anthropic.com/oauth/code/callback?code=...#... or just code#state"
              autoFocus
            />
          </label>
          {errorMsg && (
            <p style={{ color: "var(--error, red)", fontSize: "0.85rem" }}>{errorMsg}</p>
          )}
          <button type="button" onClick={onComplete} disabled={!pastedValue.trim()}>
            Connect
          </button>
        </div>
      )}

      {step === "error" && (
        <div>
          <p style={{ color: "var(--error, red)" }}>{errorMsg}</p>
          <button type="button" onClick={onStart}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Device code (GitHub Copilot) sub-component ──────────────────────────────

function DeviceFlow({
  step,
  userCode,
  verificationUri,
  errorMsg,
  pollInterval,
  providerLabel,
  onStart,
}: {
  step: "idle" | "started" | "pasting" | "polling" | "done" | "error";
  userCode: string | null;
  verificationUri: string | null;
  errorMsg: string | null;
  pollInterval: number;
  providerLabel: string;
  onStart: () => void;
}) {
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Connect your {providerLabel} account. You need an active GitHub Copilot subscription.
      </p>

      {step === "idle" && (
        <button type="button" onClick={onStart}>
          Start →
        </button>
      )}

      {step === "started" && <p className="muted">Generating device code…</p>}

      {step === "polling" && userCode && (
        <div>
          <p className="muted">
            Visit the link below and enter this code to authorize:
          </p>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: "1.75rem",
              fontWeight: "bold",
              letterSpacing: "0.2em",
              textAlign: "center",
              padding: "1rem",
              background: "var(--surface-alt, #f4f4f4)",
              borderRadius: "0.5rem",
              marginBottom: "1rem",
            }}
          >
            {userCode}
          </div>
          {verificationUri && (
            <p style={{ textAlign: "center" }}>
              <a href={verificationUri} target="_blank" rel="noopener noreferrer">
                {verificationUri}
              </a>
            </p>
          )}
          <p className="muted" style={{ fontSize: "0.85rem", textAlign: "center" }}>
            Waiting for approval… (checking every {pollInterval}s)
          </p>
        </div>
      )}

      {step === "error" && (
        <div>
          <p style={{ color: "var(--error, red)" }}>{errorMsg}</p>
          <button type="button" onClick={onStart}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
