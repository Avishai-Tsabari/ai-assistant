import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { assertAdminOrThrow } from "@/lib/admin-guard";
import { getDb, users } from "@/lib/db";
import { provisionAgentContainer } from "@/lib/container-provisioner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const { userId, hostname, modelChain, extensionIds, extensionsRepo, optionalEnv } =
    (body ?? {}) as Record<string, unknown>;

  if (!userId || !hostname) {
    return NextResponse.json(
      { error: "userId and hostname are required" },
      { status: 400 },
    );
  }

  if (
    !Array.isArray(modelChain) ||
    modelChain.length === 0 ||
    !(modelChain as unknown[]).every(
      (leg) =>
        typeof leg === "object" &&
        leg !== null &&
        typeof (leg as Record<string, unknown>).provider === "string" &&
        typeof (leg as Record<string, unknown>).apiKey === "string" &&
        typeof (leg as Record<string, unknown>).model === "string",
    )
  ) {
    return NextResponse.json(
      {
        error:
          "modelChain must be a non-empty array of { provider, apiKey, model }",
      },
      { status: 400 },
    );
  }

  // Verify user exists before starting long-running operation
  const db = getDb();
  const user = await db.select().from(users).where(eq(users.id, userId as string)).get();
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
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
        const gen = provisionAgentContainer({
          userId: userId as string,
          hostname: hostname as string,
          modelChain: modelChain as { provider: string; apiKey: string; model: string }[],
          extensionIds: Array.isArray(extensionIds) ? (extensionIds as string[]) : [],
          extensionsRepo: extensionsRepo as string | undefined,
          optionalEnv: optionalEnv as Record<string, string> | undefined,
        });

        for await (const ev of gen) {
          if (ev.type === "progress") {
            send("progress", ev);
          } else {
            // "done" or "error" — send and close
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
