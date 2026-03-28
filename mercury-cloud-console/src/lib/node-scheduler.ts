/**
 * Node scheduler — decides which compute node should host a new agent container.
 * Uses least-loaded strategy: picks the active node with the fewest running agents.
 */

import { eq } from "drizzle-orm";
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
export function selectNode(): ScheduledNode {
  const db = getDb();

  // Get all active nodes
  const activeNodes = db
    .select()
    .from(computeNodes)
    .where(eq(computeNodes.status, "active"))
    .all();

  if (activeNodes.length === 0) {
    throw new Error(
      "No active compute nodes available. Register a node via POST /api/admin/nodes.",
    );
  }

  // Count running agents per node
  const allAgents = db
    .select({ nodeId: agents.nodeId })
    .from(agents)
    .all()
    .filter((a) => a.nodeId !== null);

  const countByNode = new Map<string, number>();
  for (const a of allAgents) {
    countByNode.set(a.nodeId!, (countByNode.get(a.nodeId!) ?? 0) + 1);
  }

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
