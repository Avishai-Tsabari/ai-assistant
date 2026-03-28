import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { assertAdminOrThrow } from "@/lib/admin-guard";
import { getDb } from "@/lib/db";
import { pollAllAgentHealth } from "@/lib/health-poller";

export async function GET(request: NextRequest) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const includeHealth = request.nextUrl.searchParams.get("includeHealth") === "true";
  const includeDeprovisioned = request.nextUrl.searchParams.get("includeDeprovisioned") === "true";

  if (includeHealth) {
    const results = await pollAllAgentHealth({ includeDeprovisioned });
    return NextResponse.json({ agents: results });
  }

  const db = getDb();
  const deprovFilter = includeDeprovisioned ? sql`` : sql`WHERE a.deprovisioned_at IS NULL`;
  const rows = await db.all(sql`
    SELECT
      a.id,
      a.hostname,
      a.user_id AS userId,
      u.email AS userEmail,
      a.ipv4,
      a.server_id AS serverId,
      a.dashboard_url AS dashboardUrl,
      a.health_url AS healthUrl,
      a.deprovisioned_at AS deprovisionedAt
    FROM agents a
    JOIN users u ON u.id = a.user_id
    ${deprovFilter}
  `);

  return NextResponse.json({ agents: rows });
}
