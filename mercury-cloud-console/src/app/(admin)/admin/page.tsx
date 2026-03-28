import { sql } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/lib/db";

export default async function AdminOverviewPage() {
  const db = getDb();

  const stats = await db.get<{
    userCount: number;
    agentCount: number;
    activeSubCount: number;
    nodeCount: number;
    containerAgentCount: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM users) AS userCount,
      (SELECT COUNT(*) FROM agents WHERE deprovisioned_at IS NULL) AS agentCount,
      (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') AS activeSubCount,
      (SELECT COUNT(*) FROM compute_nodes WHERE status = 'active') AS nodeCount,
      (SELECT COUNT(*) FROM agents WHERE node_id IS NOT NULL AND deprovisioned_at IS NULL) AS containerAgentCount
  `)!;

  const cards = [
    { label: "Total Users", value: stats.userCount, href: "/admin/users" },
    { label: "Active Agents", value: stats.agentCount, href: "/admin/agents" },
    { label: "Active Subscriptions", value: stats.activeSubCount },
    { label: "Compute Nodes", value: stats.nodeCount, href: "/admin/nodes" },
    { label: "Container Agents", value: stats.containerAgentCount, href: "/admin/nodes" },
  ];

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
        {cards.map((c) => (
          <div key={c.label} className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: "2rem", fontWeight: 700 }}>{c.value}</div>
            <div className="muted" style={{ marginTop: "0.25rem" }}>{c.label}</div>
            {c.href && (
              <Link href={c.href} style={{ fontSize: "0.85rem", marginTop: "0.5rem", display: "inline-block" }}>
                View &rarr;
              </Link>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
