import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { assertAdminOrThrow } from "@/lib/admin-guard";
import { getDb } from "@/lib/db";
import { decryptSecret } from "@/lib/encryption";
import {
  fetchAgentAdapters,
  configureAgentAdapters,
} from "@/lib/agent-client";

type AgentRow = {
  id: string;
  healthUrl: string | null;
  apiSecretCipher: string | null;
  deprovisionedAt: string | null;
};

function lookupAgent(id: string): AgentRow | undefined {
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
  // healthUrl is like "http://1.2.3.4:8787" — same base for /api/console/*
  return healthUrl.replace(/\/+$/, "");
}

function getMasterKey(): string | null {
  return process.env.CONSOLE_ENCRYPTION_MASTER_KEY ?? null;
}

/** GET /api/admin/agents/[id]/adapters — fetch current adapter state from agent */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const { id } = await params;
  const agent = lookupAgent(id);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if (agent.deprovisionedAt) {
    return NextResponse.json(
      { error: "Agent is deprovisioned" },
      { status: 410 },
    );
  }
  if (!agent.healthUrl || !agent.apiSecretCipher) {
    return NextResponse.json(
      { error: "Agent missing healthUrl or apiSecret" },
      { status: 422 },
    );
  }

  const masterKey = getMasterKey();
  if (!masterKey) {
    return NextResponse.json(
      { error: "Server encryption key not configured" },
      { status: 500 },
    );
  }

  try {
    const apiSecret = decryptSecret(agent.apiSecretCipher, masterKey);
    const result = await fetchAgentAdapters({
      agentBaseUrl: agentBaseUrl(agent.healthUrl),
      apiSecret,
      signal: AbortSignal.timeout(8_000),
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to reach agent: ${msg}` },
      { status: 502 },
    );
  }
}

/** PUT /api/admin/agents/[id]/adapters — push adapter config to agent */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const { id } = await params;
  const agent = lookupAgent(id);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if (agent.deprovisionedAt) {
    return NextResponse.json(
      { error: "Agent is deprovisioned" },
      { status: 410 },
    );
  }
  if (!agent.healthUrl || !agent.apiSecretCipher) {
    return NextResponse.json(
      { error: "Agent missing healthUrl or apiSecret" },
      { status: 422 },
    );
  }

  const masterKey = getMasterKey();
  if (!masterKey) {
    return NextResponse.json(
      { error: "Server encryption key not configured" },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    adapters?: Record<
      string,
      { enabled: boolean; env?: Record<string, string> }
    >;
  } | null;

  if (!body?.adapters) {
    return NextResponse.json(
      { error: "Body must include { adapters: { ... } }" },
      { status: 400 },
    );
  }

  try {
    const apiSecret = decryptSecret(agent.apiSecretCipher, masterKey);
    const result = await configureAgentAdapters({
      agentBaseUrl: agentBaseUrl(agent.healthUrl),
      apiSecret,
      adapters: body.adapters,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Configuration failed" },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, restarting: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to reach agent: ${msg}` },
      { status: 502 },
    );
  }
}
