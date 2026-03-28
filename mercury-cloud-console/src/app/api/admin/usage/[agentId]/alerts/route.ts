import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { assertAdminOrThrow } from "@/lib/admin-guard";
import { getDb } from "@/lib/db";
import { usageAlerts } from "@/lib/db/schema";

/** GET /api/admin/usage/[agentId]/alerts — list alerts for agent */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const { agentId } = await params;
  const db = getDb();

  const alerts = await db
    .select()
    .from(usageAlerts)
    .where(eq(usageAlerts.agentId, agentId));

  return NextResponse.json({ alerts });
}

/** DELETE /api/admin/usage/[agentId]/alerts?id=xxx — delete alert by id */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const { agentId } = await params;
  const alertId = request.nextUrl.searchParams.get("id");
  if (!alertId) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  const db = getDb();
  const deleted = await db
    .delete(usageAlerts)
    .where(and(eq(usageAlerts.id, alertId), eq(usageAlerts.agentId, agentId)))
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
