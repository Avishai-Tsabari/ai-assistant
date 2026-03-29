import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { assertAdminOrThrow } from "@/lib/admin-guard";
import { getDb, computeNodes } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/nodes/[id]/token — reveal the stored API token for a node (admin only). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const { id } = await params;
  const db = getDb();
  const node = await db
    .select()
    .from(computeNodes)
    .where(eq(computeNodes.id, id))
    .get();

  if (!node) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  return NextResponse.json({ apiToken: node.apiToken });
}
