import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { assertAdminOrThrow } from "@/lib/admin-guard";
import { getDb, computeNodes } from "@/lib/db";
import { NodeClient } from "@/lib/node-client";

const CreateNodeSchema = z.object({
  label: z.string().min(1).max(80),
  host: z.string().min(1),
  apiUrl: z.string().url(),
  apiToken: z.string().min(8),
  maxAgents: z.number().int().min(1).max(500).default(100),
});

/** GET /api/admin/nodes — list all compute nodes with live health. */
export async function GET(request: Request) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const includeHealth =
    new URL(request.url).searchParams.get("includeHealth") === "true";

  const db = getDb();
  const nodes = db.select().from(computeNodes).all();

  if (!includeHealth) {
    return NextResponse.json({ nodes });
  }

  // Fetch live health from each node in parallel
  const withHealth = await Promise.all(
    nodes.map(async (node) => {
      try {
        const client = new NodeClient(node.apiUrl, node.apiToken);
        const health = await client.getHealth();
        return { ...node, apiToken: "***", health };
      } catch {
        return {
          ...node,
          apiToken: "***",
          health: null,
          healthError: "unreachable",
        };
      }
    }),
  );

  return NextResponse.json({ nodes: withHealth });
}

/** POST /api/admin/nodes — register a new compute node. */
export async function POST(request: Request) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const raw = await request.json().catch(() => null);
  const parsed = CreateNodeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join("; ") },
      { status: 400 },
    );
  }

  const { label, host, apiUrl, apiToken, maxAgents } = parsed.data;

  // Verify the node is reachable before registering
  try {
    const client = new NodeClient(apiUrl, apiToken);
    await client.getHealth();
  } catch (err) {
    return NextResponse.json(
      {
        error: `Node is not reachable at ${apiUrl}: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 422 },
    );
  }

  const db = getDb();
  const node = db
    .insert(computeNodes)
    .values({
      label,
      host,
      apiUrl,
      apiToken,
      maxAgents,
      status: "active",
      createdAt: new Date().toISOString(),
    })
    .returning()
    .get();

  return NextResponse.json({ node: { ...node, apiToken: "***" } }, { status: 201 });
}
