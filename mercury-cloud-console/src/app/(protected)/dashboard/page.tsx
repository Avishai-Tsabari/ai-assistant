import { auth } from "@/auth";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import SignOutButton from "./SignOutButton";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id;
  const rows = getDb()
    .select()
    .from(agents)
    .where(eq(agents.userId, userId))
    .all();

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ margin: 0 }}>Console</h1>
        <SignOutButton />
      </div>
      <p className="muted" style={{ marginTop: "0.5rem" }}>Signed in as {session!.user!.email}</p>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Agents</h2>
        {rows.length === 0 ? (
          <p className="muted">
            No agents linked yet. Use the Phase 1 CLI (<code>bun run provision</code>) or add
            rows via the database. Future: wizard + Stripe here.
          </p>
        ) : (
          <ul style={{ paddingLeft: "1.25rem" }}>
            {rows.map((a) => (
              <li key={a.id} style={{ marginBottom: "0.75rem" }}>
                <strong>{a.hostname}</strong>
                {a.dashboardUrl ? (
                  <>
                    {" "}
                    — <Link href={a.dashboardUrl}>dashboard</Link>
                  </>
                ) : null}
                {a.ipv4 ? <span className="muted"> ({a.ipv4})</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p style={{ marginTop: "1rem" }}>
        <Link href="/dashboard/keys">Manage API Keys</Link>
        {" · "}
        <Link href="/onboarding">Onboarding checklist</Link>
      </p>
      {session!.user!.role === "admin" && (
        <p style={{ marginTop: "0.75rem" }}>
          <Link href="/admin">Admin Console</Link>
        </p>
      )}
    </main>
  );
}
