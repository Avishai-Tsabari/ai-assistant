import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fetchAgentHealth, type HealthResponse } from "@/lib/agent-client";

export type AgentHealthResult = {
  agentId: string;
  hostname: string;
  userId: string;
  userEmail: string;
  ipv4: string | null;
  serverId: number | null;
  dashboardUrl: string | null;
  health: HealthResponse | null;
  error: string | null;
  checkedAt: string;
};

const HEALTH_TIMEOUT_MS = 8_000;

async function pollOne(agent: {
  id: string;
  hostname: string;
  userId: string;
  userEmail: string;
  ipv4: string | null;
  serverId: number | null;
  dashboardUrl: string | null;
  healthUrl: string | null;
}): Promise<AgentHealthResult> {
  const base: Omit<AgentHealthResult, "health" | "error" | "checkedAt"> = {
    agentId: agent.id,
    hostname: agent.hostname,
    userId: agent.userId,
    userEmail: agent.userEmail,
    ipv4: agent.ipv4,
    serverId: agent.serverId,
    dashboardUrl: agent.dashboardUrl,
  };

  if (!agent.healthUrl) {
    return { ...base, health: null, error: "No health URL configured", checkedAt: new Date().toISOString() };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const health = await fetchAgentHealth(agent.healthUrl, { signal: controller.signal });
    clearTimeout(timer);
    return { ...base, health, error: null, checkedAt: new Date().toISOString() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, health: null, error: message, checkedAt: new Date().toISOString() };
  }
}

type AgentRow = {
  id: string;
  hostname: string;
  userId: string;
  userEmail: string;
  ipv4: string | null;
  serverId: number | null;
  dashboardUrl: string | null;
  healthUrl: string | null;
};

async function queryAllAgents(opts?: { includeDeprovisioned?: boolean }): Promise<AgentRow[]> {
  const db = getDb();
  const filter = opts?.includeDeprovisioned ? sql`` : sql`WHERE a.deprovisioned_at IS NULL`;
  return db.all<AgentRow>(sql`
    SELECT
      a.id,
      a.hostname,
      a.user_id AS userId,
      u.email AS userEmail,
      a.ipv4,
      a.server_id AS serverId,
      a.dashboard_url AS dashboardUrl,
      a.health_url AS healthUrl
    FROM agents a
    JOIN users u ON u.id = a.user_id
    ${filter}
  `);
}

export async function pollAllAgentHealth(opts?: { includeDeprovisioned?: boolean }): Promise<AgentHealthResult[]> {
  const agents = await queryAllAgents(opts);
  const results = await Promise.allSettled(agents.map(pollOne));
  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          agentId: agents[i].id,
          hostname: agents[i].hostname,
          userId: agents[i].userId,
          userEmail: agents[i].userEmail,
          ipv4: agents[i].ipv4,
          serverId: agents[i].serverId,
          dashboardUrl: agents[i].dashboardUrl,
          health: null,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          checkedAt: new Date().toISOString(),
        },
  );
}

export async function pollSingleAgentHealth(agentId: string): Promise<AgentHealthResult | null> {
  const db = getDb();
  const agent = await db.get<AgentRow>(sql`
    SELECT
      a.id,
      a.hostname,
      a.user_id AS userId,
      u.email AS userEmail,
      a.ipv4,
      a.server_id AS serverId,
      a.dashboard_url AS dashboardUrl,
      a.health_url AS healthUrl
    FROM agents a
    JOIN users u ON u.id = a.user_id
    WHERE a.id = ${agentId}
  `);
  if (!agent) return null;
  return pollOne(agent);
}
