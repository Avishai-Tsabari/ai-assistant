#!/usr/bin/env bun
/**
 * Provision a Hetzner VPS with cloud-init Mercury agent bootstrap.
 * Usage: bun run infra/scripts/provision.ts path/to/request.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  buildCloudInitUserData,
  DEFAULT_MERCURY_YAML,
  toB64,
} from "../../src/lib/cloud-init";
import { renderMercuryEnv } from "../../src/lib/env-renderer";
import { resolveMercuryAdd, loadCatalog } from "../../src/lib/catalog";
import { createHetznerDnsARecord, HetznerClient } from "../../src/lib/hetzner";
import { getDb, users, agents as agentsTable } from "../../src/lib/db";
import { encryptSecret } from "../../src/lib/encryption";

const ModelChainLegSchema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

const RequestSchema = z.object({
  hostname: z.string().min(1).max(63),
  /** Email of the console user to link this agent to. */
  userEmail: z.string().email(),
  extensionIds: z.array(z.string()).default([]),
  /** Override MERCURY_EXTENSIONS_REPO for this run (GitHub `owner/repo` with `examples/extensions/` on default branch). */
  extensionsRepo: z.string().min(1).optional(),
  /**
   * Ordered model chain: first entry is primary, rest are fallbacks.
   * Example: [{ provider: "anthropic", apiKey: "sk-ant-...", model: "claude-sonnet-4-6" }]
   */
  modelChain: z.array(ModelChainLegSchema).min(1),
  secrets: z.object({
    apiSecret: z.string().optional(),
  }).optional().default({}),
  optionalEnv: z.record(z.string()).optional().default({}),
});

type AgentsFile = {
  agents: Array<{
    hostname: string;
    serverId: number;
    ipv4: string;
    dashboardUrl: string;
    healthUrl: string;
    createdAt: string;
    extensionIds: string[];
  }>;
};

function loadAgents(path: string): AgentsFile {
  if (!existsSync(path)) {
    return { agents: [] };
  }
  return JSON.parse(readFileSync(path, "utf8")) as AgentsFile;
}

function saveAgents(path: string, data: AgentsFile) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

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
  delayMs = 10000,
): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, "")}/health`;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const j = (await res.json()) as { status?: string };
        if (j.status === "ok") return;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Timeout waiting for Mercury /health at ${url}`);
}

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error("Usage: bun run infra/scripts/provision.ts <request.json>");
    process.exit(1);
  }

  const token = process.env.HETZNER_API_TOKEN;
  if (!token) {
    console.error("Missing HETZNER_API_TOKEN");
    process.exit(1);
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
  const baseDomain = process.env.BASE_DOMAIN;
  const agentsPath =
    process.env.AGENTS_JSON_PATH ??
    join(process.cwd(), "data", "agents.json");
  const agentImage =
    process.env.MERCURY_AGENT_IMAGE ??
    "ghcr.io/avishai-tsabari/mercury-agent:latest";
  const ghcrToken = process.env.GHCR_TOKEN;
  const ghcrUsername = process.env.GHCR_USERNAME;

  const raw = JSON.parse(readFileSync(jsonPath, "utf8"));
  const req = RequestSchema.parse(raw);

  const repo =
    req.extensionsRepo ??
    process.env.MERCURY_EXTENSIONS_REPO ??
    "Michaelliv/mercury";

  const apiSecret =
    req.secrets?.apiSecret && req.secrets.apiSecret.length > 0
      ? req.secrets.apiSecret
      : randomBytes(24).toString("hex");

  const optionalLines = Object.entries(req.optionalEnv).map(
    ([k, v]) => `${k}=${v}`,
  );

  const envContent = renderMercuryEnv({
    resolvedKeys: req.modelChain.map(({ provider, apiKey }) => ({ provider, apiKey })),
    modelChain: req.modelChain.map(({ provider, model }) => ({ provider, model })),
    apiSecret,
    agentImage,
    optionalLines,
  });

  loadCatalog();
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
  console.log(`Created server id=${serverId}, waiting for IPv4...`);
  const ipv4 = await waitForIpv4(client, serverId);
  console.log(`Public IPv4: ${ipv4}`);

  if (dnsZoneId) {
    try {
      await createHetznerDnsARecord({
        token,
        zoneId: dnsZoneId,
        name: req.hostname,
        ip: ipv4,
      });
      console.log(
        `DNS A record created: ${req.hostname} -> ${ipv4} (relative to your Hetzner DNS zone).`,
      );
    } catch (e) {
      console.warn("DNS record failed (add manually in Hetzner DNS):", e);
    }
  }
  console.log(
    `Public URL (until DNS): http://${ipv4}:8787/dashboard` +
      (baseDomain
        ? ` — with DNS: https://${req.hostname}.${baseDomain}:8787 (add TLS separately)`
        : ""),
  );

  const healthUrl = `http://${ipv4}:8787`;
  const dashboardUrl = `${healthUrl}/dashboard`;

  const agents = loadAgents(agentsPath);
  agents.agents.push({
    hostname: req.hostname,
    serverId,
    ipv4,
    dashboardUrl,
    healthUrl,
    createdAt: new Date().toISOString(),
    extensionIds: req.extensionIds,
  });
  saveAgents(agentsPath, agents);

  // ── Insert into control-plane SQLite DB so the dashboard can show this agent ──
  const db = getDb();
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, req.userEmail))
    .get();

  if (!user) {
    console.warn(
      `WARNING: No console user found for ${req.userEmail} — agent saved to JSON but NOT linked in the dashboard DB. Register the user first, then re-run or insert manually.`,
    );
  } else {
    const masterKey = process.env.CONSOLE_ENCRYPTION_MASTER_KEY;
    const apiSecretCipher =
      masterKey && masterKey.length > 0
        ? encryptSecret(apiSecret, masterKey)
        : null;

    await db.insert(agentsTable)
      .values({
        userId: user.id,
        hostname: req.hostname,
        serverId,
        ipv4,
        dashboardUrl,
        healthUrl,
        apiSecretCipher,
        createdAt: new Date().toISOString(),
      });

    console.log(`Agent linked to user ${req.userEmail} in console DB.`);
  }

  console.log("\n--- Mercury agent ---");
  console.log(`Dashboard: ${dashboardUrl}`);
  console.log(`Health:    ${healthUrl}/health`);
  console.log(`MERCURY_API_SECRET (save this): ${apiSecret}`);
  console.log("\nWaiting for Mercury /health (first boot can take several minutes)...");

  try {
    await waitForHealth(healthUrl, 120, 10000);
    console.log("Mercury is healthy.");
  } catch (e) {
    console.warn(String(e));
    console.log("Check server cloud-init logs: journalctl -u mercury-agent -f (on the VPS)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
