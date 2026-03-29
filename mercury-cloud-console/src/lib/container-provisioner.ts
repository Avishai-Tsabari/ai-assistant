/**
 * Container-based agent provisioner.
 * Replaces VPS provisioner — creates Docker containers on shared compute nodes
 * via the node agent daemon.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ProvisionProgress, ProvisionRequest } from "@/lib/provisioner";
import { renderMercuryEnvRecord } from "@/lib/env-renderer";
import { selectNode } from "@/lib/node-scheduler";
import { NodeClient } from "@/lib/node-client";
import { TIER_RESOURCES } from "@/lib/tiers";
import {
  getDb,
  agents as agentsTable,
  providerKeys as providerKeysTable,
  containerEvents,
  users,
} from "@/lib/db";
import { encryptSecret, getMasterKey } from "@/lib/encryption";

/**
 * Poll an agent's /health endpoint until it returns { status: "ok" }.
 * Much faster than VPS provisioning — typically completes in 2-10 seconds.
 */
async function waitForHealth(
  baseUrl: string,
  maxAttempts = 30,
  delayMs = 2_000,
): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, "")}/health`;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const j = (await res.json()) as { status?: string };
        if (j.status === "ok") return true;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/**
 * Provision an agent as a Docker container on a shared compute node.
 * Yields the same ProvisionProgress events as the VPS provisioner
 * so the existing SSE streaming in provision routes works unchanged.
 */
export async function* provisionAgentContainer(
  req: ProvisionRequest,
): AsyncGenerator<ProvisionProgress> {
  const masterKey = getMasterKey();
  const tier = req.tier ?? "standard";
  const agentImage =
    process.env.MERCURY_AGENT_IMAGE ??
    "ghcr.io/avishai-tsabari/mercury-agent:latest";
  const baseDomain = process.env.NODE_AGENT_BASE_DOMAIN ?? "mercury.app";

  // ─── 1. Select compute node ───────────────────────────────────────────
  yield { type: "progress", message: "Selecting compute node..." };
  let node;
  try {
    node = await selectNode();
  } catch (err) {
    yield {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    return;
  }
  yield {
    type: "progress",
    message: `Selected node: ${node.label}`,
  };

  // ─── 2. Build environment variables ───────────────────────────────────
  const apiSecret = randomBytes(24).toString("hex");
  const agentId = crypto.randomUUID();

  const env = renderMercuryEnvRecord({
    resolvedKeys: req.modelChain.map(
      ({ provider, apiKey, envVarOverride }) => ({
        provider,
        apiKey,
        envVarOverride,
      }),
    ),
    modelChain: req.modelChain.map(({ provider, model }) => ({
      provider,
      model,
    })),
    apiSecret,
    agentImage,
    agentId,
    optionalEnv: req.optionalEnv,
  });

  // ─── 3. Start container via node agent ────────────────────────────────
  yield { type: "progress", message: "Starting agent container..." };
  const client = new NodeClient(node.apiUrl, node.apiToken);

  let containerId: string;
  try {
    const { memoryMb, cpus } = TIER_RESOURCES[tier];
    const result = await client.startContainer({
      agentId,
      image: agentImage,
      env,
      memoryMb,
      cpus,
    });
    containerId = result.containerId;
  } catch (err) {
    yield {
      type: "error",
      message: `Failed to start container: ${err instanceof Error ? err.message : String(err)}`,
    };
    return;
  }

  // ─── 4. Persist to database ───────────────────────────────────────────
  const healthUrl = `https://${agentId}.${baseDomain}`;
  const dashboardUrl = `${healthUrl}/dashboard`;
  const imageTag = agentImage.split(":").pop() ?? "latest";

  const apiSecretCipher =
    masterKey && masterKey.length > 0
      ? encryptSecret(apiSecret, masterKey)
      : null;

  const db = getDb();
  const keyIds: { provider: string; keyId: string; model: string }[] = [];

  await db.transaction(async (tx) => {
    for (const leg of req.modelChain) {
      const keyId = crypto.randomUUID();
      const encryptedKey =
        masterKey && masterKey.length > 0
          ? encryptSecret(leg.apiKey, masterKey)
          : leg.apiKey;
      await tx.insert(providerKeysTable)
        .values({
          id: keyId,
          userId: req.userId,
          provider: leg.provider,
          label: null,
          encryptedKey,
          createdAt: new Date().toISOString(),
        });
      keyIds.push({ provider: leg.provider, keyId, model: leg.model });
    }

    await tx.insert(agentsTable)
      .values({
        id: agentId,
        userId: req.userId,
        hostname: req.hostname || agentId.slice(0, 8),
        nodeId: node.id,
        containerId,
        containerStatus: "running",
        imageTag,
        tier,
        dashboardUrl,
        healthUrl,
        apiSecretCipher,
        modelChainConfig: JSON.stringify(keyIds),
        createdAt: new Date().toISOString(),
      });

    await tx.insert(containerEvents)
      .values({
        agentId,
        event: "started",
        details: JSON.stringify({ nodeId: node.id, image: agentImage }),
      });
  });

  // ─── 5. Verify user exists (sanity check) ────────────────────────────
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, req.userId))
    .get();
  if (!user) {
    yield { type: "error", message: `User ${req.userId} not found in DB` };
    return;
  }

  // ─── 6. Wait for health ───────────────────────────────────────────────
  yield {
    type: "progress",
    message: "Agent container started. Waiting for health check...",
  };
  const healthy = await waitForHealth(healthUrl);

  if (healthy) {
    yield {
      type: "done",
      agentId,
      ipv4: node.host,
      dashboardUrl,
      status: "healthy",
    };
  } else {
    yield {
      type: "done",
      agentId,
      ipv4: node.host,
      dashboardUrl,
      status: "provisioning_in_progress",
    };
  }
}
