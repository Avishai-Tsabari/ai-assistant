import Link from "next/link";
import { auth } from "@/auth";
import { eq, count } from "drizzle-orm";
import { getDb, providerKeys } from "@/lib/db";

export default async function OnboardingPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const result = getDb()
    .select({ count: count() })
    .from(providerKeys)
    .where(eq(providerKeys.userId, userId))
    .get();
  const keyCount = result?.count ?? 0;

  return (
    <main>
      <h1>Agent onboarding</h1>
      <div className="card" style={{ marginBottom: "1.5rem", background: "color-mix(in srgb, var(--accent, #0070f3) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent, #0070f3) 30%, transparent)" }}>
        <p style={{ margin: 0, fontSize: "1rem" }}>
          <strong>New:</strong> Provision your agent in minutes using the guided setup wizard.
        </p>
        <p style={{ margin: "0.75rem 0 0" }}>
          <Link href="/wizard" style={{ fontSize: "1rem", fontWeight: 600 }}>
            Launch Setup Wizard →
          </Link>
        </p>
      </div>
      <div className="card">
        <ol style={{ paddingLeft: "1.25rem" }}>
          <li style={{ marginBottom: "0.75rem" }}>
            <strong>Add at least one model provider key.</strong>
            {" "}
            {keyCount > 0 ? (
              <span style={{ color: "var(--success, #3fb950)" }}>
                ✓ {keyCount} key{keyCount !== 1 ? "s" : ""} saved.
              </span>
            ) : (
              <>
                <span className="muted">No keys yet. </span>
                <Link href="/dashboard/keys">Add a key →</Link>
              </>
            )}
          </li>
          <li style={{ marginBottom: "0.75rem" }}>
            Create a Hetzner API token and SSH key.
          </li>
          <li style={{ marginBottom: "0.75rem" }}>
            Copy <code>infra/example-provision.request.json</code> and fill in
            the <code>modelChain</code> array (provider + model per leg).
          </li>
          <li style={{ marginBottom: "0.75rem" }}>
            Run <code>bun run provision -- ./your.request.json</code>
          </li>
          <li>
            Open the printed dashboard URL; use <code>MERCURY_API_SECRET</code> as Bearer / cookie.
          </li>
        </ol>
        <p className="muted" style={{ marginTop: "1rem" }}>
          Automated wizard + Stripe checkout will call the same provisioner from API routes (next
          iteration).
        </p>
      </div>
      <p style={{ marginTop: "1rem" }}>
        <Link href="/dashboard">← Dashboard</Link>
      </p>
    </main>
  );
}
