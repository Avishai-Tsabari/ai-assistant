import { NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { assertUserOrThrow } from "@/lib/admin-guard";
import { getDb, agents, providerKeys } from "@/lib/db";
import { decryptSecret, getMasterKey } from "@/lib/encryption";
import { providerEnvVar } from "@/lib/providers";
import { configureAgentAdapters } from "@/lib/agent-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChainEntry = { provider: string; keyId: string; model: string };

/** GET /api/user/agents/[id]/model-config — return agent's model chain with key metadata */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;
  const { id } = await params;

  const db = getDb();
  const agent = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.userId, userId)))
    .get();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const chain: ChainEntry[] = agent.modelChainConfig
    ? (JSON.parse(agent.modelChainConfig) as ChainEntry[])
    : [];

  if (chain.length === 0) {
    return NextResponse.json({ modelChain: [] });
  }

  // Single query to fetch all key metadata
  const keyIds = chain.map((leg) => leg.keyId);
  const keyRows = await db
    .select({ id: providerKeys.id, label: providerKeys.label })
    .from(providerKeys)
    .where(and(inArray(providerKeys.id, keyIds), eq(providerKeys.userId, userId)));
  const labelMap = new Map(keyRows.map((k) => [k.id, k.label]));

  const enriched = chain.map((leg) => ({
    provider: leg.provider,
    keyId: leg.keyId,
    model: leg.model,
    label: labelMap.get(leg.keyId) ?? null,
  }));

  return NextResponse.json({ modelChain: enriched });
}

/** PUT /api/user/agents/[id]/model-config — update agent's model chain */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;
  const { id } = await params;

  const db = getDb();
  const agent = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.userId, userId)))
    .get();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if (agent.deprovisionedAt) {
    return NextResponse.json({ error: "Agent is deprovisioned" }, { status: 410 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { modelChain } = body;

  if (
    !Array.isArray(modelChain) ||
    modelChain.length === 0 ||
    !(modelChain as unknown[]).every(
      (leg) =>
        typeof leg === "object" &&
        leg !== null &&
        typeof (leg as Record<string, unknown>).keyId === "string" &&
        ((leg as Record<string, unknown>).keyId as string).trim() !== "" &&
        typeof (leg as Record<string, unknown>).model === "string" &&
        ((leg as Record<string, unknown>).model as string).trim() !== "",
    )
  ) {
    return NextResponse.json(
      { error: "modelChain must be a non-empty array of { keyId, model }" },
      { status: 400 },
    );
  }

  const incomingLegs = modelChain as { keyId: string; model: string }[];

  // Single batch query to validate all keyIds belong to this user
  const requestedKeyIds = incomingLegs.map((l) => l.keyId);
  const fetchedKeys = await db
    .select()
    .from(providerKeys)
    .where(and(inArray(providerKeys.id, requestedKeyIds), eq(providerKeys.userId, userId)));
  const keyMap = new Map(fetchedKeys.map((k) => [k.id, k]));

  const resolvedChain: ChainEntry[] = [];
  for (const leg of incomingLegs) {
    const keyRow = keyMap.get(leg.keyId);
    if (!keyRow) {
      return NextResponse.json({ error: `Key ${leg.keyId} not found` }, { status: 400 });
    }
    resolvedChain.push({ provider: keyRow.provider, keyId: leg.keyId, model: leg.model });
  }

  // Persist updated model chain
  await db.update(agents)
    .set({ modelChainConfig: JSON.stringify(resolvedChain) })
    .where(and(eq(agents.id, id), eq(agents.userId, userId)));

  // Best-effort: push updated env vars to live agent
  if (agent.healthUrl && agent.apiSecretCipher) {
    const masterKey = getMasterKey();
    if (masterKey) {
      try {
        const apiSecret = decryptSecret(agent.apiSecretCipher, masterKey);
        const providerEnvs: Record<string, string> = {};
        for (const leg of resolvedChain) {
          const keyRow = keyMap.get(leg.keyId);
          if (keyRow) {
            providerEnvs[providerEnvVar(leg.provider)] = decryptSecret(keyRow.encryptedKey, masterKey);
          }
        }
        providerEnvs["MERCURY_MODEL_CHAIN"] = JSON.stringify(
          resolvedChain.map(({ provider, model }) => ({ provider, model })),
        );
        await configureAgentAdapters({
          agentBaseUrl: agent.healthUrl,
          apiSecret,
          adapters: { __model_providers: { enabled: true, env: providerEnvs } },
        });
      } catch {
        // Best-effort: agent may be offline; DB is already updated
      }
    }
  }

  return NextResponse.json({ ok: true, modelChain: resolvedChain });
}
