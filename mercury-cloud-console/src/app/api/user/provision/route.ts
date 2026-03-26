import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { assertUserOrThrow } from "@/lib/admin-guard";
import { getDb, providerKeys } from "@/lib/db";
import { decryptSecret, encryptSecret, getMasterKey } from "@/lib/encryption";
import { provisionAgent } from "@/lib/provisioner";
import { oauthEnvVar } from "@/lib/providers";
import { refreshOAuthCredentials, type OAuthCredentials } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ModelChainLegSchema = z.object({
  keyId: z.string().min(1),
  model: z.string().min(1),
});

const BodySchema = z.object({
  hostname: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/, "Hostname must be lowercase letters, numbers, and hyphens"),
  modelChain: z.array(ModelChainLegSchema).min(1),
  extensionIds: z.array(z.string()).optional().default([]),
  optionalEnv: z.record(z.string(), z.string()).optional().default({}),
});

export async function POST(request: Request) {
  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;

  const raw = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join("; ") },
      { status: 400 },
    );
  }

  const { hostname, modelChain, extensionIds, optionalEnv } = parsed.data;

  const masterKey = getMasterKey();
  if (!masterKey) {
    return NextResponse.json({ error: "Server encryption key not configured" }, { status: 500 });
  }

  // Resolve each keyId → { provider, apiKey, model }
  const db = getDb();
  const resolvedChain: { provider: string; apiKey: string; model: string; envVarOverride?: string }[] = [];

  for (const leg of modelChain) {
    const keyRow = db
      .select()
      .from(providerKeys)
      .where(and(eq(providerKeys.id, leg.keyId), eq(providerKeys.userId, userId)))
      .get();

    if (!keyRow) {
      return NextResponse.json(
        { error: `Provider key ${leg.keyId} not found or does not belong to you` },
        { status: 400 },
      );
    }

    let decryptedPayload: string;
    try {
      decryptedPayload = decryptSecret(keyRow.encryptedKey, masterKey);
    } catch {
      return NextResponse.json(
        { error: `Failed to decrypt key ${leg.keyId}` },
        { status: 500 },
      );
    }

    if (keyRow.keyType === "oauth") {
      // OAuth key: decrypt JSON credentials, refresh if expired, inject OAuth token env var
      let creds: OAuthCredentials;
      try {
        creds = JSON.parse(decryptedPayload) as OAuthCredentials;
      } catch {
        return NextResponse.json(
          { error: `Malformed OAuth credentials for key ${leg.keyId}` },
          { status: 500 },
        );
      }

      if (Date.now() > creds.expires) {
        try {
          creds = await refreshOAuthCredentials(keyRow.provider, creds);
          // Persist refreshed credentials back to DB
          const refreshedEncrypted = encryptSecret(JSON.stringify(creds), masterKey);
          db.update(providerKeys)
            .set({ encryptedKey: refreshedEncrypted })
            .where(eq(providerKeys.id, leg.keyId))
            .run();
        } catch (e) {
          return NextResponse.json(
            {
              error: `OAuth token for ${keyRow.provider} is expired and could not be refreshed. Please reconnect via the dashboard.`,
            },
            { status: 422 },
          );
        }
      }

      resolvedChain.push({
        provider: keyRow.provider,
        apiKey: creds.access,
        model: leg.model,
        envVarOverride: oauthEnvVar(keyRow.provider),
      });
    } else {
      resolvedChain.push({
        provider: keyRow.provider,
        apiKey: decryptedPayload,
        model: leg.model,
      });
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      }

      try {
        const gen = provisionAgent({
          userId,
          hostname,
          modelChain: resolvedChain,
          extensionIds,
          optionalEnv,
        });

        for await (const ev of gen) {
          if (ev.type === "progress") {
            send("progress", ev);
          } else {
            send(ev.type, ev);
            controller.close();
            return;
          }
        }
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : String(err) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
