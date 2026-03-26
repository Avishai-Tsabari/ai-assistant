import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { assertUserOrThrow } from "@/lib/admin-guard";
import { getDb, oauthSessions, providerKeys } from "@/lib/db";
import { encryptSecret, getMasterKey } from "@/lib/encryption";
import { parseAnthropicPaste, exchangeAnthropicCode } from "@/lib/oauth";
import { KNOWN_PROVIDERS } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  sessionId: z.string().min(1),
  pastedValue: z.string().min(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;

  const { provider } = await params;

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join("; ") },
      { status: 400 },
    );
  }

  const { sessionId, pastedValue } = parsed.data;

  const masterKey = getMasterKey();
  if (!masterKey) {
    return NextResponse.json({ error: "Server encryption key not configured" }, { status: 500 });
  }

  const db = getDb();

  // Look up the session (must belong to this user and not be expired)
  const oauthSession = db
    .select()
    .from(oauthSessions)
    .where(and(eq(oauthSessions.id, sessionId), eq(oauthSessions.userId, userId)))
    .get();

  if (!oauthSession) {
    return NextResponse.json({ error: "OAuth session not found" }, { status: 400 });
  }

  if (new Date(oauthSession.expiresAt) < new Date()) {
    db.delete(oauthSessions).where(eq(oauthSessions.id, sessionId)).run();
    return NextResponse.json({ error: "OAuth session expired — please start again" }, { status: 400 });
  }

  if (provider !== oauthSession.provider) {
    return NextResponse.json({ error: "Provider mismatch" }, { status: 400 });
  }

  // Only PKCE providers (Anthropic) are supported by this route
  if (KNOWN_PROVIDERS[provider]?.oauthType !== "pkce") {
    return NextResponse.json(
      { error: `Provider ${provider} does not use the complete flow` },
      { status: 400 },
    );
  }

  // Parse the pasted code + state
  const parsed2 = parseAnthropicPaste(pastedValue);
  if (!parsed2) {
    return NextResponse.json(
      {
        error:
          "Could not parse the pasted value. Please paste the full redirect URL or the code#state string shown on Anthropic's page.",
      },
      { status: 400 },
    );
  }

  // Exchange the code for tokens
  let credentials;
  try {
    credentials = await exchangeAnthropicCode(parsed2.code, oauthSession.pkceVerifier!);
  } catch (e) {
    return NextResponse.json(
      { error: `Token exchange failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  // Encrypt and store as a provider key
  const keyId = crypto.randomUUID();
  const encryptedKey = encryptSecret(JSON.stringify(credentials), masterKey);

  db.insert(providerKeys)
    .values({
      id: keyId,
      userId,
      provider,
      keyType: "oauth",
      label: "Connected via OAuth",
      encryptedKey,
      createdAt: new Date().toISOString(),
    })
    .run();

  // Clean up the session
  db.delete(oauthSessions).where(eq(oauthSessions.id, sessionId)).run();

  return NextResponse.json({ ok: true, keyId });
}
