import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { AgentDetailClient } from "./AgentDetailClient";

type AgentDetail = {
  id: string;
  hostname: string;
  userEmail: string;
  userId: string;
  ipv4: string | null;
  serverId: number | null;
  dashboardUrl: string | null;
  healthUrl: string | null;
  createdAt: string;
  deprovisionedAt: string | null;
};

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  const agent = await db.get<AgentDetail>(sql`
    SELECT
      a.id,
      a.hostname,
      u.email AS userEmail,
      a.user_id AS userId,
      a.ipv4,
      a.server_id AS serverId,
      a.dashboard_url AS dashboardUrl,
      a.health_url AS healthUrl,
      a.created_at AS createdAt,
      a.deprovisioned_at AS deprovisionedAt
    FROM agents a
    JOIN users u ON u.id = a.user_id
    WHERE a.id = ${id}
  `);

  if (!agent) notFound();

  return <AgentDetailClient agent={agent} />;
}
