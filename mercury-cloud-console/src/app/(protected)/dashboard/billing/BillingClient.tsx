"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface BillingClientProps {
  status: string;
  priceId: string | null;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeConfigured: boolean;
  successParam: boolean;
}

export default function BillingClient({
  status,
  priceId,
  currentPeriodEnd,
  stripeCustomerId,
  stripeConfigured,
  successParam,
}: BillingClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);

  async function handleCheckout() {
    setLoading("checkout");
    try {
      const res = await fetch("/api/user/billing/checkout", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "Failed to start checkout");
      }
    } finally {
      setLoading(null);
    }
  }

  async function handlePortal() {
    setLoading("portal");
    try {
      const res = await fetch("/api/user/billing/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "Failed to open portal");
      }
    } finally {
      setLoading(null);
    }
  }

  const isActive = status === "active";

  return (
    <main>
      <h1>Billing</h1>

      {successParam && (
        <div className="card" style={{ borderColor: "green", marginBottom: "1rem" }}>
          <p style={{ margin: 0, color: "green" }}>
            Subscription activated successfully.
          </p>
        </div>
      )}

      {!stripeConfigured ? (
        <div className="card">
          <p className="muted">Billing is not enabled on this instance.</p>
        </div>
      ) : (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Subscription</h2>
          <p>
            <strong>Status:</strong>{" "}
            <span
              style={{
                color:
                  status === "active"
                    ? "green"
                    : status === "past_due"
                      ? "orange"
                      : status === "canceled"
                        ? "red"
                        : undefined,
              }}
            >
              {status}
            </span>
          </p>
          {isActive && priceId && (
            <p>
              <strong>Plan:</strong> {priceId}
            </p>
          )}
          {isActive && currentPeriodEnd && (
            <p>
              <strong>Renews:</strong>{" "}
              {new Date(currentPeriodEnd).toLocaleDateString()}
            </p>
          )}

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            {!isActive && (
              <button onClick={handleCheckout} disabled={loading !== null}>
                {loading === "checkout" ? "Redirecting…" : "Upgrade / Subscribe"}
              </button>
            )}
            {stripeCustomerId && (
              <button onClick={handlePortal} disabled={loading !== null}>
                {loading === "portal" ? "Redirecting…" : "Manage Subscription"}
              </button>
            )}
          </div>
        </div>
      )}

      <p style={{ marginTop: "1rem" }}>
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: "inherit",
            textDecoration: "underline",
          }}
        >
          Back to Dashboard
        </button>
      </p>
    </main>
  );
}
