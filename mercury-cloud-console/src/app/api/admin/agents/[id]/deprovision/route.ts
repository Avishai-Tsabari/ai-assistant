import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { assertAdminOrThrow } from "@/lib/admin-guard";
import { getDb, containerEvents } from "@/lib/db";
import { resolveAgentContainerAdmin } from "@/lib/agent-container";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const { id } = await params;
  const db = getDb();

  const agent = db.get<{ id: string; nodeId: string | null }>(
    sql`SELECT id, node_id AS nodeId FROM agents WHERE id = ${id}`,
  );
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // If container-mode agent, remove the container from the compute node
  if (agent.nodeId) {
    const resolved = await resolveAgentContainerAdmin(id);
    if (resolved.ok) {
      try {
        await resolved.ctx.nodeClient.removeContainer(id);
        db.insert(containerEvents)
          .values({ agentId: id, event: "stopped", details: JSON.stringify({ reason: "deprovisioned" }) })
          .run();
      } catch {
        // Log but don't block deprovisioning if container removal fails
        // (node may be unreachable, container already removed, etc.)
      }
    }
  }

  const deprovisionedAt = new Date().toISOString();
  db.run(sql`UPDATE agents SET deprovisioned_at = ${deprovisionedAt}, container_status = 'stopped' WHERE id = ${id}`);

  return NextResponse.json({ ok: true, deprovisionedAt });
}
