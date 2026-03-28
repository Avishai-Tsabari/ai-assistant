import { NextResponse } from "next/server";
import { eq, and, lt } from "drizzle-orm";
import { auth } from "@/auth";
import { assertUserOrThrow } from "@/lib/admin-guard";
import { getDb, oauthSessions } from "@/lib/db";
import { KNOWN_PROVIDERS } from "@/lib/providers";
import {
  generatePkceVerifier,
  buildAnthropicAuthUrl,
  startGithubDeviceFlow,
} from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_PROVIDERS = new Set(
  Object.entries(KNOWN_PROVIDERS)
    .filter(([, meta]) => meta.oauthSupported)
    .map(([id]) => id),
);

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;

  const { provider } = await params;

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return NextResponse.json(
      { error: `OAuth not supported for provider: ${provider}` },
      { status: 400 },
    );
  }

  const db = getDb();

  // Purge expired sessions for this user (housekeeping)
  await db.delete(oauthSessions)
    .where(
      and(
        eq(oauthSessions.userId, userId),
        lt(oauthSessions.expiresAt, new Date().toISOString()),
      ),
    );

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const createdAt = new Date().toISOString();

  const meta = KNOWN_PROVIDERS[provider];

  if (meta.oauthType === "pkce") {
    // Anthropic PKCE flow
    const verifier = generatePkceVerifier();
    const authUrl = await buildAnthropicAuthUrl(verifier);

    await db.insert(oauthSessions)
      .values({
        id: sessionId,
        userId,
        provider,
        pkceVerifier: verifier,
        expiresAt,
        createdAt,
      });

    return NextResponse.json({ sessionId, authUrl });
  }

  // GitHub Copilot device code flow
  const flow = await startGithubDeviceFlow();

  await db.insert(oauthSessions)
    .values({
      id: sessionId,
      userId,
      provider,
      deviceCode: flow.deviceCode,
      deviceInterval: flow.interval,
      expiresAt,
      createdAt,
    });

  return NextResponse.json({
    sessionId,
    userCode: flow.userCode,
    verificationUri: flow.verificationUri,
    interval: flow.interval,
  });
}
