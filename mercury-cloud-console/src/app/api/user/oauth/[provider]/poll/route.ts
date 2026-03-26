import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { assertUserOrThrow } from "@/lib/admin-guard";
import { getDb, oauthSessions, providerKeys } from "@/lib/db";
import { encryptSecret, getMasterKey } from "@/lib/encryption";
import { pollGithubDeviceFlow } from "@/lib/oauth";
import { KNOWN_PROVIDERS } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;

  const { provider } = await params;

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId query param required" }, { status: 400 });
  }

  const masterKey = getMasterKey();
  if (!masterKey) {
    return NextResponse.json({ error: "Server encryption key not configured" }, { status: 500 });
  }

  const db = getDb();

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

  if (KNOWN_PROVIDERS[provider]?.oauthType !== "device") {
    return NextResponse.json(
      { error: `Provider ${provider} does not use the poll flow` },
      { status: 400 },
    );
  }

  let pollResult;
  try {
    pollResult = await pollGithubDeviceFlow(oauthSession.deviceCode!);
  } catch (e) {
    return NextResponse.json(
      { error: `Device flow poll failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  if (pollResult.status === "pending") {
    return NextResponse.json({ status: "pending" });
  }

  if (pollResult.status === "slow_down") {
    return NextResponse.json({ status: "slow_down", interval: pollResult.interval });
  }

  // Complete — store credentials
  const keyId = crypto.randomUUID();
  const encryptedKey = encryptSecret(JSON.stringify(pollResult.credentials), masterKey);

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

  db.delete(oauthSessions).where(eq(oauthSessions.id, sessionId)).run();

  return NextResponse.json({ status: "complete", keyId });
}
