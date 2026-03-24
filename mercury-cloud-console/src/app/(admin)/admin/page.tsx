import { sql } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/lib/db";

export default function AdminOverviewPage() {
  const db = getDb();

  const stats = db.get<{ userCount: number; agentCount: number; activeSubCount: number }>(sql`
    SELECT
      (SELECT COUNT(*) FROM users) AS userCount,
      (SELECT COUNT(*) FROM agents) AS agentCount,
      (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') AS activeSubCount
  `)!;

  const cards = [
    { label: "Total Users", value: stats.userCount, href: "/admin/users" },
    { label: "Total Agents", value: stats.agentCount, href: "/admin/agents" },
    { label: "Active Subscriptions", value: stats.activeSubCount },
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
