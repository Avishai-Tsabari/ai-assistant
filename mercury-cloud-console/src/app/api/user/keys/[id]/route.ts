import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { assertUserOrThrow } from "@/lib/admin-guard";
import { getDb, providerKeys } from "@/lib/db";
import { encryptSecret, getMasterKey } from "@/lib/encryption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT /api/user/keys/[id] — update label and/or rotate key value */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;
  const { id } = await params;

  const db = getDb();
  const existing = await db
    .select()
    .from(providerKeys)
    .where(and(eq(providerKeys.id, id), eq(providerKeys.userId, userId)))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { label, apiKey } = body;

  const updates: Partial<typeof existing> = {};

  if (typeof label === "string") {
    updates.label = label.trim() || null;
  }

  if (typeof apiKey === "string" && apiKey.trim()) {
    const masterKey = getMasterKey();
    if (!masterKey) {
      return NextResponse.json({ error: "Server encryption key not configured" }, { status: 500 });
    }
    updates.encryptedKey = encryptSecret(apiKey.trim(), masterKey);
  }

  if (Object.keys(updates).length > 0) {
    await db.update(providerKeys)
      .set(updates)
      .where(and(eq(providerKeys.id, id), eq(providerKeys.userId, userId)));
  }

  return NextResponse.json({ ok: true });
}

/** DELETE /api/user/keys/[id] — remove a provider key */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;
  const { id } = await params;

  const db = getDb();
  const deleted = await db
    .delete(providerKeys)
    .where(and(eq(providerKeys.id, id), eq(providerKeys.userId, userId)))
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
