/**
 * Node scheduler — decides which compute node should host a new agent container.
 * Uses least-loaded strategy: picks the active node with the fewest running agents.
 */

import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, computeNodes, agents } from "@/lib/db";

export interface ScheduledNode {
  id: string;
  label: string;
  host: string;
  apiUrl: string;
  apiToken: string;
}

/**
 * Select the best compute node for a new agent.
 * Strategy: least-loaded (fewest non-deprovisioned agents).
 * Falls back to the first active node if agent counts can't be determined.
 */
export async function selectNode(): Promise<ScheduledNode> {
  const db = getDb();

  // Get all active nodes
  const activeNodes = await db
    .select()
    .from(computeNodes)
    .where(eq(computeNodes.status, "active"));

  if (activeNodes.length === 0) {
    throw new Error(
      "No active compute nodes available. Register a node via POST /api/admin/nodes.",
    );
  }

  // Count active agents per node (SQL aggregate — avoids full table scan)
  const agentCounts = await db
    .select({ nodeId: agents.nodeId, count: count() })
    .from(agents)
    .where(and(isNotNull(agents.nodeId), isNull(agents.deprovisionedAt)))
    .groupBy(agents.nodeId);

  const countByNode = new Map<string, number>(
    agentCounts.map((r) => [r.nodeId!, r.count]),
  );

  // Pick the node with the fewest agents (and under maxAgents limit)
  let bestNode = activeNodes[0];
  let bestCount = countByNode.get(bestNode.id) ?? 0;

  for (const node of activeNodes.slice(1)) {
    const count = countByNode.get(node.id) ?? 0;
    if (count < bestCount) {
      bestNode = node;
      bestCount = count;
    }
  }

  // Check capacity
  if (bestCount >= bestNode.maxAgents) {
    throw new Error(
      `All compute nodes are at capacity. Best node "${bestNode.label}" has ${bestCount}/${bestNode.maxAgents} agents.`,
    );
  }

  return {
    id: bestNode.id,
    label: bestNode.label,
    host: bestNode.host,
    apiUrl: bestNode.apiUrl,
    apiToken: bestNode.apiToken,
  };
}
