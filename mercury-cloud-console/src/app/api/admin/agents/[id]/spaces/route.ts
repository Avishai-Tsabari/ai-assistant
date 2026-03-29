import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { assertAdminOrThrow } from "@/lib/admin-guard";
import { getDb } from "@/lib/db";
import { decryptSecret, getMasterKey } from "@/lib/encryption";
import { fetchAgentSpaces, fetchSpaceConfig, setSpaceConfig } from "@/lib/agent-client";

type AgentRow = {
  id: string;
  healthUrl: string | null;
  apiSecretCipher: string | null;
  deprovisionedAt: string | null;
};

async function lookupAgent(id: string): Promise<AgentRow | undefined> {
  const db = getDb();
  return db.get<AgentRow>(sql`
    SELECT
      id,
      health_url AS healthUrl,
      api_secret_cipher AS apiSecretCipher,
      deprovisioned_at AS deprovisionedAt
    FROM agents
    WHERE id = ${id}
  `);
}

function agentBaseUrl(healthUrl: string): string {
  return healthUrl.replace(/\/+$/, "");
}

function resolveAgent(agent: AgentRow | undefined) {
  if (!agent) {
    return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) };
  }
  if (agent.deprovisionedAt) {
    return { error: NextResponse.json({ error: "Agent is deprovisioned" }, { status: 410 }) };
  }
  if (!agent.healthUrl || !agent.apiSecretCipher) {
    return { error: NextResponse.json({ error: "Agent missing healthUrl or apiSecret" }, { status: 422 }) };
  }
  const masterKey = getMasterKey();
  if (!masterKey) {
    return { error: NextResponse.json({ error: "Server encryption key not configured" }, { status: 500 }) };
  }
  const apiSecret = decryptSecret(agent.apiSecretCipher, masterKey);
  return { baseUrl: agentBaseUrl(agent.healthUrl), apiSecret };
}

/** GET /api/admin/agents/[id]/spaces — list spaces + their config from agent */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const { id } = await params;
  const agent = await lookupAgent(id);
  const resolved = resolveAgent(agent);
  if ("error" in resolved) return resolved.error;

  try {
    const { spaces } = await fetchAgentSpaces({
      agentBaseUrl: resolved.baseUrl,
      apiSecret: resolved.apiSecret,
      signal: AbortSignal.timeout(8_000),
    });

    // Fetch config for each space in parallel
    const spacesWithConfig = await Promise.all(
      spaces.map(async (space) => {
        try {
          const { config } = await fetchSpaceConfig({
            agentBaseUrl: resolved.baseUrl,
            apiSecret: resolved.apiSecret,
            spaceId: space.id,
            signal: AbortSignal.timeout(8_000),
          });
          return { ...space, config };
        } catch {
          return { ...space, config: {} };
        }
      }),
    );

    return NextResponse.json({ spaces: spacesWithConfig });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to reach agent: ${msg}` },
      { status: 502 },
    );
  }
}

/** PUT /api/admin/agents/[id]/spaces — set a space config key */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const { id } = await params;
  const agent = await lookupAgent(id);
  const resolved = resolveAgent(agent);
  if ("error" in resolved) return resolved.error;

  const body = (await request.json().catch(() => null)) as {
    spaceId?: string;
    key?: string;
    value?: string;
  } | null;

  if (!body?.spaceId || !body?.key || typeof body.value !== "string") {
    return NextResponse.json(
      { error: "Body must include { spaceId, key, value }" },
      { status: 400 },
    );
  }

  try {
    const result = await setSpaceConfig({
      agentBaseUrl: resolved.baseUrl,
      apiSecret: resolved.apiSecret,
      spaceId: body.spaceId,
      key: body.key,
      value: body.value,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Config update failed" },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to reach agent: ${msg}` },
      { status: 502 },
    );
  }
}
