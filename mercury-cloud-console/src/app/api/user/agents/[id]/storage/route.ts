import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { assertUserOrThrow } from "@/lib/admin-guard";
import { getDb } from "@/lib/db";
import { decryptSecret, getMasterKey } from "@/lib/encryption";
import { fetchAgentStorage } from "@/lib/agent-client";

export const runtime = "nodejs";

type AgentRow = {
  id: string;
  userId: string;
  healthUrl: string | null;
  apiSecretCipher: string | null;
  deprovisionedAt: string | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;

  const agent = await getDb().get<AgentRow>(sql`
    SELECT
      id,
      user_id AS userId,
      health_url AS healthUrl,
      api_secret_cipher AS apiSecretCipher,
      deprovisioned_at AS deprovisionedAt
    FROM agents
    WHERE id = ${id}
  `);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if (agent.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (agent.deprovisionedAt) {
    return NextResponse.json({ error: "Agent is deprovisioned" }, { status: 410 });
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
    const result = await fetchAgentStorage({
      agentBaseUrl: agent.healthUrl.replace(/\/+$/, ""),
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
