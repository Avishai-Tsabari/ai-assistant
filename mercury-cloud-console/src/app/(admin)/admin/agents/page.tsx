import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { AgentsHealthClient } from "./AgentsHealthClient";

type AgentRow = {
  id: string;
  hostname: string;
  userEmail: string;
  ipv4: string | null;
  serverId: number | null;
  dashboardUrl: string | null;
};

export default function AdminAgentsPage() {
  const db = getDb();
  const rows = db.all<AgentRow>(sql`
    SELECT
      a.id,
      a.hostname,
      u.email AS userEmail,
      a.ipv4,
      a.server_id AS serverId,
      a.dashboard_url AS dashboardUrl
    FROM agents a
    JOIN users u ON u.id = a.user_id
    WHERE a.deprovisioned_at IS NULL
    ORDER BY a.created_at DESC
  `);

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Agents ({rows.length})</h2>
      <AgentsHealthClient agents={rows} />
    </>
  );
}
