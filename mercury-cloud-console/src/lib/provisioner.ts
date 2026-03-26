import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  buildCloudInitUserData,
  DEFAULT_MERCURY_YAML,
  toB64,
} from "@/lib/cloud-init";
import { renderMercuryEnv } from "@/lib/env-renderer";
import { resolveMercuryAdd } from "@/lib/catalog";
import { createHetznerDnsARecord, HetznerClient } from "@/lib/hetzner";
import { getDb, agents as agentsTable, providerKeys as providerKeysTable, users } from "@/lib/db";
import { encryptSecret, getMasterKey } from "@/lib/encryption";

export type ProvisionProgress =
  | { type: "progress"; message: string }
  | {
      type: "done";
      agentId: string;
      ipv4: string;
      dashboardUrl: string;
      status: "healthy" | "provisioning_in_progress";
    }
  | { type: "error"; message: string };

export type ModelChainEntry = {
  /** Provider id, e.g. "anthropic", "openai", "google" */
  provider: string;
  /** Plaintext API key (or OAuth access token) — will be encrypted and stored in provider_keys */
  apiKey: string;
  /** Model name, e.g. "claude-sonnet-4-6" */
  model: string;
  /**
   * Optional override for the env var name injected into the agent .env.
   * Used for OAuth tokens (e.g. MERCURY_ANTHROPIC_OAUTH_TOKEN vs MERCURY_ANTHROPIC_API_KEY).
   */
  envVarOverride?: string;
};

export type ProvisionRequest = {
  /** DB user.id — caller must verify it exists */
  userId: string;
  hostname: string;
  /** Ordered model chain; at least one entry required */
  modelChain: ModelChainEntry[];
  extensionIds: string[];
  extensionsRepo?: string;
  optionalEnv?: Record<string, string>;
};

async function waitForIpv4(
  client: HetznerClient,
  serverId: number,
  maxAttempts = 60,
  delayMs = 5000,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const { server } = await client.getServer(serverId);
    const ip = server.public_net?.ipv4?.ip;
    if (server.status === "running" && ip) return ip;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("Timeout waiting for server IPv4");
}

async function waitForHealth(
  baseUrl: string,
  maxAttempts = 60,
  delayMs = 10_000,
): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, "")}/health`;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
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

export async function* provisionAgent(
  req: ProvisionRequest,
): AsyncGenerator<ProvisionProgress> {
  const token = process.env.HETZNER_API_TOKEN;
  if (!token) {
    yield { type: "error", message: "Missing HETZNER_API_TOKEN" };
    return;
  }

  const serverType = process.env.HETZNER_SERVER_TYPE ?? "cx22";
  const image = process.env.HETZNER_IMAGE ?? "docker-ce";
  const location = process.env.HETZNER_LOCATION;
  const sshKeyIds = (process.env.HETZNER_SSH_KEY_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
  const dnsZoneId = process.env.HETZNER_DNS_ZONE_ID;
  const agentImage =
    process.env.MERCURY_AGENT_IMAGE ?? "ghcr.io/michaelliv/mercury-agent:latest";
  const ghcrToken = process.env.GHCR_TOKEN;
  const ghcrUsername = process.env.GHCR_USERNAME;
  const masterKey = getMasterKey();

  const repo =
    req.extensionsRepo ??
    process.env.MERCURY_EXTENSIONS_REPO ??
    "Michaelliv/mercury";

  const apiSecret = randomBytes(24).toString("hex");

  const optionalLines = Object.entries(req.optionalEnv ?? {}).map(
    ([k, v]) => `${k}=${v}`,
  );

  const envContent = renderMercuryEnv({
    resolvedKeys: req.modelChain.map(({ provider, apiKey, envVarOverride }) => ({
      provider,
      apiKey,
      envVarOverride,
    })),
    modelChain: req.modelChain.map(({ provider, model }) => ({ provider, model })),
    apiSecret,
    agentImage,
    optionalLines,
  });

  const mercuryAddSpecs = req.extensionIds.map((id) =>
    resolveMercuryAdd(id, repo),
  );

  const ghcr =
    ghcrToken && ghcrUsername
      ? { username: ghcrUsername, token: ghcrToken }
      : undefined;

  const userData = buildCloudInitUserData({
    envFileB64: toB64(envContent),
    mercuryYamlB64: toB64(DEFAULT_MERCURY_YAML),
    mercuryAddSpecs,
    agentImage,
    ghcr,
  });

  yield { type: "progress", message: "Creating server..." };
  const client = new HetznerClient(token);
  const { server } = await client.createServer({
    name: req.hostname,
    serverType,
    image,
    location: location || undefined,
    sshKeys: sshKeyIds.length ? sshKeyIds : undefined,
    userData,
    labels: { managed_by: "mercury-cloud-console" },
  });
  const serverId = server.id;

  yield { type: "progress", message: "Waiting for IPv4..." };
  const ipv4 = await waitForIpv4(client, serverId);

  if (dnsZoneId) {
    try {
      await createHetznerDnsARecord({
        token,
        zoneId: dnsZoneId,
        name: req.hostname,
        ip: ipv4,
      });
      yield { type: "progress", message: `DNS A record created: ${req.hostname} → ${ipv4}` };
    } catch (e) {
      yield { type: "progress", message: `DNS record skipped: ${String(e)}` };
    }
  }

  const healthUrl = `http://${ipv4}:8787`;
  const dashboardUrl = `${healthUrl}/dashboard`;

  // Insert DB row before health polling so the agent is visible immediately
  const db = getDb();
  const agentId = crypto.randomUUID();
  const apiSecretCipher =
    masterKey && masterKey.length > 0 ? encryptSecret(apiSecret, masterKey) : null;

  // Atomically persist provider keys + agent row
  const keyIds: { provider: string; keyId: string; model: string }[] = [];
  db.transaction((tx) => {
    for (const leg of req.modelChain) {
      const keyId = crypto.randomUUID();
      const encryptedKey =
        masterKey && masterKey.length > 0
          ? encryptSecret(leg.apiKey, masterKey)
          : leg.apiKey; // fallback: store plaintext if no master key (dev only)
      tx.insert(providerKeysTable)
        .values({
          id: keyId,
          userId: req.userId,
          provider: leg.provider,
          label: null,
          encryptedKey,
          createdAt: new Date().toISOString(),
        })
        .run();
      keyIds.push({ provider: leg.provider, keyId, model: leg.model });
    }

    tx.insert(agentsTable)
      .values({
        id: agentId,
        userId: req.userId,
        hostname: req.hostname,
        serverId,
        ipv4,
        dashboardUrl,
        healthUrl,
        apiSecretCipher,
        modelChainConfig: JSON.stringify(keyIds),
        createdAt: new Date().toISOString(),
      })
      .run();
  });

  // Verify user still exists (sanity check for FK)
  const user = db.select().from(users).where(eq(users.id, req.userId)).get();
  if (!user) {
    yield { type: "error", message: `User ${req.userId} not found in DB` };
    return;
  }

  yield { type: "progress", message: `Server ready at ${ipv4}. Waiting for agent health (may take several minutes)...` };
  const healthy = await waitForHealth(healthUrl);

  if (healthy) {
    yield { type: "done", agentId, ipv4, dashboardUrl, status: "healthy" };
  } else {
    yield {
      type: "done",
      agentId,
      ipv4,
      dashboardUrl,
      status: "provisioning_in_progress",
    };
  }
}
