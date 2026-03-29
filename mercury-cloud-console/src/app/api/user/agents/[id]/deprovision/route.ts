import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { assertUserOrThrow } from "@/lib/admin-guard";
import { getDb, containerEvents } from "@/lib/db";
import { resolveAgentContainerAdmin } from "@/lib/agent-container";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const db = getDb();

  const agent = await db.get<{ id: string; userId: string; nodeId: string | null; deprovisionedAt: string | null }>(
    sql`SELECT id, user_id AS userId, node_id AS nodeId, deprovisioned_at AS deprovisionedAt FROM agents WHERE id = ${id}`,
  );
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  if (agent.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (agent.deprovisionedAt) return NextResponse.json({ error: "Already deprovisioned" }, { status: 409 });

  if (agent.nodeId) {
    const resolved = await resolveAgentContainerAdmin(id);
    if (resolved.ok) {
      try {
        await resolved.ctx.nodeClient.removeContainer(id);
        await db.insert(containerEvents).values({
          agentId: id,
          event: "stopped",
          details: JSON.stringify({ reason: "deprovisioned" }),
        });
      } catch {
        // Ignore — node may be unreachable
      }
    }
  }

  const deprovisionedAt = new Date().toISOString();
  await db.run(sql`UPDATE agents SET deprovisioned_at = ${deprovisionedAt}, container_status = 'stopped' WHERE id = ${id}`);

  return NextResponse.json({ ok: true, deprovisionedAt });
}
