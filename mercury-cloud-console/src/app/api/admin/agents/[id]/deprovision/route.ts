import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { assertAdminOrThrow } from "@/lib/admin-guard";
import { getDb } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const { id } = await params;
  const db = getDb();

  const agent = db.get<{ id: string }>(sql`SELECT id FROM agents WHERE id = ${id}`);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const deprovisionedAt = new Date().toISOString();
  db.run(sql`UPDATE agents SET deprovisioned_at = ${deprovisionedAt} WHERE id = ${id}`);

  return NextResponse.json({ ok: true, deprovisionedAt });
}
