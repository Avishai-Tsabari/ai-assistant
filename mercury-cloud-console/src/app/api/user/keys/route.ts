import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { assertUserOrThrow } from "@/lib/admin-guard";
import { getDb, providerKeys } from "@/lib/db";
import { encryptSecret, getMasterKey } from "@/lib/encryption";
import { maskKey } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/user/keys — list caller's provider keys (masked, no encrypted value) */
export async function GET() {
  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;

  const rows = await getDb()
    .select({
      id: providerKeys.id,
      provider: providerKeys.provider,
      label: providerKeys.label,
      keyType: providerKeys.keyType,
      createdAt: providerKeys.createdAt,
    })
    .from(providerKeys)
    .where(eq(providerKeys.userId, userId));

  return NextResponse.json({ keys: rows });
}

/** POST /api/user/keys — save a new provider key */
export async function POST(request: Request) {
  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { provider, apiKey, label } = body;

  if (!provider || typeof provider !== "string" || !provider.trim()) {
    return NextResponse.json({ error: "provider is required" }, { status: 400 });
  }
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
  }

  // Check for existing key with the same provider
  const existing = await getDb()
    .select({ id: providerKeys.id })
    .from(providerKeys)
    .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, provider.trim())))
    .get();

  if (existing) {
    return NextResponse.json(
      { error: `You already have a key saved for this provider. Delete the existing one first if you want to replace it.` },
      { status: 409 },
    );
  }

  const masterKey = getMasterKey();
  if (!masterKey) {
    return NextResponse.json({ error: "Server encryption key not configured" }, { status: 500 });
  }

  const id = crypto.randomUUID();
  const trimmedKey = (apiKey as string).trim();
  const encryptedKey = encryptSecret(trimmedKey, masterKey);
  const trimmedLabel = typeof label === "string" && label.trim() ? label.trim() : null;

  await getDb()
    .insert(providerKeys)
    .values({
      id,
      userId,
      provider: provider.trim(),
      label: trimmedLabel,
      encryptedKey,
      createdAt: new Date().toISOString(),
    });

  return NextResponse.json({
    key: {
      id,
      provider: provider.trim(),
      label: trimmedLabel,
      maskedKey: maskKey(trimmedKey),
      createdAt: new Date().toISOString(),
    },
  }, { status: 201 });
}
