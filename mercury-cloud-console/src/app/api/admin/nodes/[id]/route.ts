import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { assertAdminOrThrow } from "@/lib/admin-guard";
import { getDb, computeNodes } from "@/lib/db";
import { NodeClient } from "@/lib/node-client";

const PatchNodeSchema = z.object({
  status: z.enum(["active", "draining", "offline"]).optional(),
  maxAgents: z.number().int().min(1).max(500).optional(),
  label: z.string().min(1).max(80).optional(),
});

/** GET /api/admin/nodes/[id]/health — live health from a specific node. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const { id } = await params;
  const db = getDb();
  const node = db
    .select()
    .from(computeNodes)
    .where(eq(computeNodes.id, id))
    .get();

  if (!node) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  try {
    const client = new NodeClient(node.apiUrl, node.apiToken);
    const [health, containers] = await Promise.all([
      client.getHealth(),
      client.listContainers(),
    ]);
    return NextResponse.json({ health, containers });
  } catch (err) {
    return NextResponse.json(
      { error: `Node unreachable: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}

/** PATCH /api/admin/nodes/[id] — update node status or settings. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const { id } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = PatchNodeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join("; ") },
      { status: 400 },
    );
  }

  const db = getDb();
  const node = db
    .update(computeNodes)
    .set(parsed.data)
    .where(eq(computeNodes.id, id))
    .returning()
    .get();

  if (!node) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  return NextResponse.json({ node: { ...node, apiToken: "***" } });
}

/** DELETE /api/admin/nodes/[id] — remove a node (only if no active agents). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const { id } = await params;
  const db = getDb();

  // Check for active agents on this node before deleting
  const activeCount = db.get<{ count: number }>(
    sql`SELECT COUNT(*) as count FROM agents WHERE node_id = ${id} AND deprovisioned_at IS NULL`,
  );

  if (activeCount && activeCount.count > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete node with ${activeCount.count} active agent(s). Drain or deprovision agents first, or set status to "draining".`,
      },
      { status: 409 },
    );
  }

  db.delete(computeNodes).where(eq(computeNodes.id, id)).run();
  return NextResponse.json({ deleted: true });
}
