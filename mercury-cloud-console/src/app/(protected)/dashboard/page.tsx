import { auth } from "@/auth";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import SignOutButton from "./SignOutButton";
import AgentCard from "./AgentCard";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id;
  const rows = getDb()
    .select()
    .from(agents)
    .where(eq(agents.userId, userId))
    .all();

  const activeAgents = rows.filter((a) => !a.deprovisionedAt);

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ margin: 0 }}>Console</h1>
        <SignOutButton />
      </div>
      <p className="muted" style={{ marginTop: "0.5rem" }}>Signed in as {session!.user!.email}</p>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0 }}>Agents</h2>
          <Link href="/wizard">
            <button type="button">+ Provision New Agent</button>
          </Link>
        </div>
        {activeAgents.length === 0 ? (
          <p className="muted">
            No agents linked yet.{" "}
            <Link href="/wizard">Launch the setup wizard</Link> to provision your first agent.
          </p>
        ) : (
          <ul style={{ padding: 0, margin: 0 }}>
            {activeAgents.map((a) => (
              <AgentCard
                key={a.id}
                agent={{
                  id: a.id,
                  hostname: a.hostname,
                  ipv4: a.ipv4 ?? null,
                  dashboardUrl: a.dashboardUrl ?? null,
                  nodeId: a.nodeId ?? null,
                  containerStatus: (a.containerStatus as "running" | "stopped" | "restarting" | "failed" | null) ?? null,
                  deprovisionedAt: a.deprovisionedAt ?? null,
                }}
              />
            ))}
          </ul>
        )}
      </div>
      <p style={{ marginTop: "1rem" }}>
        <Link href="/dashboard/keys">Manage API Keys</Link>
        {" · "}
        <Link href="/dashboard/billing">Billing</Link>
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
