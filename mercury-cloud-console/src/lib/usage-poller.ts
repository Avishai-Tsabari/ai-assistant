import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usageSnapshots } from "@/lib/db/schema";
import { fetchAgentUsage, type UsageResponse } from "@/lib/agent-client";

type AgentRow = {
  id: string;
  userId: string;
  healthUrl: string | null;
  apiSecretCipher: string | null;
};

function queryAllAgents(): AgentRow[] {
  const db = getDb();
  return db.all<AgentRow>(sql`
    SELECT
      a.id,
      a.user_id AS userId,
      a.health_url AS healthUrl,
      a.api_secret_cipher AS apiSecretCipher
    FROM agents a
    WHERE a.deprovisioned_at IS NULL
  `);
}

export async function pollOneAgentUsage(agent: {
  id: string;
  healthUrl: string | null;
  apiSecretCipher: string | null;
}): Promise<{ agentId: string; usage: UsageResponse | null }> {
  if (!agent.healthUrl || !agent.apiSecretCipher) {
    return { agentId: agent.id, usage: null };
  }

  const usage = await fetchAgentUsage({
    healthUrl: agent.healthUrl,
    apiSecretCipher: agent.apiSecretCipher,
  });

  return { agentId: agent.id, usage };
}

export async function pollAllAgentUsage(): Promise<
  Array<{ agentId: string; userId: string; usage: UsageResponse | null }>
> {
  const agents = queryAllAgents();
  const results = await Promise.allSettled(agents.map(pollOneAgentUsage));

  const output: Array<{ agentId: string; userId: string; usage: UsageResponse | null }> = [];
  const db = getDb();
  const now = new Date().toISOString();

  for (let i = 0; i < results.length; i++) {
    const agent = agents[i];
    const result = results[i];
    const usage = result.status === "fulfilled" ? result.value.usage : null;

    output.push({ agentId: agent.id, userId: agent.userId, usage });

    if (!usage) continue;

    // Store totals as a null-spaceId snapshot
    db.insert(usageSnapshots)
      .values({
        agentId: agent.id,
        spaceId: null,
        totalInputTokens: usage.totals.totalInputTokens,
        totalOutputTokens: usage.totals.totalOutputTokens,
        totalTokens: usage.totals.totalTokens,
        totalCost: usage.totals.totalCost,
        runCount: usage.totals.runCount,
        lastUsedAt: null,
        snapshotAt: now,
      })
      .run();

    // Store per-space snapshots
    for (const space of usage.perSpace) {
      db.insert(usageSnapshots)
        .values({
          agentId: agent.id,
          spaceId: space.spaceId,
          totalInputTokens: space.totalInputTokens,
          totalOutputTokens: space.totalOutputTokens,
          totalTokens: space.totalTokens,
          totalCost: space.totalCost,
          runCount: space.runCount,
          lastUsedAt: space.lastUsedAt ?? null,
          snapshotAt: now,
        })
        .run();
    }
  }

  return output;
}
