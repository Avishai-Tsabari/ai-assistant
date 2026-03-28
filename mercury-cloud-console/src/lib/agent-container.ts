/**
 * Helpers for performing container lifecycle operations on a user's agent.
 * Resolves ownership, fetches the node credentials, and returns a ready NodeClient.
 */

import { eq, and, isNotNull, sql } from "drizzle-orm";
import { getDb, agents, computeNodes } from "@/lib/db";
import { NodeClient } from "@/lib/node-client";
import { decryptSecret, getMasterKey } from "@/lib/encryption";

export type AgentContainerContext = {
  agentId: string;
  nodeClient: NodeClient;
};

type ResolveResult =
  | { ok: true; ctx: AgentContainerContext }
  | { ok: false; status: 400 | 403 | 404 | 502; error: string };

/**
 * Resolve an agent to a NodeClient, verifying the agent:
 * - exists and is not deprovisioned
 * - belongs to userId
 * - is in container mode (has a nodeId)
 */
export async function resolveAgentContainer(
  agentId: string,
  userId: string,
): Promise<ResolveResult> {
  const db = getDb();

  const row = await db
    .select({
      id: agents.id,
      nodeId: agents.nodeId,
      deprovisionedAt: agents.deprovisionedAt,
      userId: agents.userId,
    })
    .from(agents)
    .where(eq(agents.id, agentId))
    .get();

  if (!row) {
    return { ok: false, status: 404, error: "Agent not found" };
  }
  if (row.userId !== userId) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (row.deprovisionedAt) {
    return { ok: false, status: 400, error: "Agent is deprovisioned" };
  }
  if (!row.nodeId) {
    return {
      ok: false,
      status: 400,
      error: "Agent is not in container mode (VPS-provisioned agents cannot be managed this way)",
    };
  }

  const node = await db
    .select()
    .from(computeNodes)
    .where(eq(computeNodes.id, row.nodeId))
    .get();

  if (!node) {
    return { ok: false, status: 502, error: "Compute node not found" };
  }

  return {
    ok: true,
    ctx: {
      agentId,
      nodeClient: new NodeClient(node.apiUrl, node.apiToken),
    },
  };
}

/**
 * Same as resolveAgentContainer but for admin use — skips userId ownership check.
 */
export async function resolveAgentContainerAdmin(
  agentId: string,
): Promise<ResolveResult> {
  const db = getDb();

  const row = await db
    .select({ id: agents.id, nodeId: agents.nodeId, deprovisionedAt: agents.deprovisionedAt })
    .from(agents)
    .where(eq(agents.id, agentId))
    .get();

  if (!row) return { ok: false, status: 404, error: "Agent not found" };
  if (row.deprovisionedAt) return { ok: false, status: 400, error: "Agent is deprovisioned" };
  if (!row.nodeId) {
    return { ok: false, status: 400, error: "Agent is not in container mode" };
  }

  const node = await db
    .select()
    .from(computeNodes)
    .where(eq(computeNodes.id, row.nodeId))
    .get();

  if (!node) return { ok: false, status: 502, error: "Compute node not found" };

  return {
    ok: true,
    ctx: { agentId, nodeClient: new NodeClient(node.apiUrl, node.apiToken) },
  };
}
