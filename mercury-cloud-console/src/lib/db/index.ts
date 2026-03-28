import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

function createInstance() {
  const url = process.env.DATABASE_URL ?? "file:./data/console.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;
  const client = createClient({ url, authToken });
  return { client, db: drizzle(client, { schema }) };
}

let instance: ReturnType<typeof createInstance> | undefined;
let initialized = false;

function getInstance() {
  if (!instance) {
    instance = createInstance();
  }
  return instance;
}

export async function initDb() {
  if (initialized) return;
  initialized = true;

  const { client } = getInstance();

  // Create all tables (idempotent)
  await client.batch(
    [
      {
        sql: `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT,
          role TEXT NOT NULL DEFAULT 'user',
          created_at TEXT NOT NULL
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS compute_nodes (
          id TEXT PRIMARY KEY NOT NULL,
          label TEXT NOT NULL,
          host TEXT NOT NULL,
          api_url TEXT NOT NULL,
          api_token TEXT NOT NULL,
          max_agents INTEGER NOT NULL DEFAULT 100,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          hostname TEXT NOT NULL,
          server_id INTEGER,
          ipv4 TEXT,
          node_id TEXT REFERENCES compute_nodes(id),
          container_id TEXT,
          container_port INTEGER,
          container_status TEXT,
          image_tag TEXT,
          dashboard_url TEXT,
          health_url TEXT,
          api_secret_cipher TEXT,
          model_chain_config TEXT,
          deprovisioned_at TEXT,
          created_at TEXT NOT NULL
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS subscriptions (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          stripe_customer_id TEXT,
          stripe_subscription_id TEXT,
          price_id TEXT,
          current_period_end TEXT,
          canceled_at TEXT,
          status TEXT NOT NULL DEFAULT 'inactive',
          updated_at TEXT NOT NULL
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS provider_keys (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          label TEXT,
          key_type TEXT NOT NULL DEFAULT 'api_key',
          encrypted_key TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS oauth_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          pkce_verifier TEXT,
          device_code TEXT,
          device_interval INTEGER,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS usage_alerts (
          id TEXT PRIMARY KEY NOT NULL,
          agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          threshold_type TEXT NOT NULL,
          threshold_value REAL NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS usage_snapshots (
          id TEXT PRIMARY KEY NOT NULL,
          agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          space_id TEXT,
          total_input_tokens INTEGER NOT NULL,
          total_output_tokens INTEGER NOT NULL,
          total_tokens INTEGER NOT NULL,
          total_cost REAL NOT NULL,
          run_count INTEGER NOT NULL,
          last_used_at INTEGER,
          snapshot_at TEXT NOT NULL
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS alert_events (
          id TEXT PRIMARY KEY NOT NULL,
          agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          alert_id TEXT NOT NULL REFERENCES usage_alerts(id) ON DELETE CASCADE,
          snapshot_id TEXT NOT NULL REFERENCES usage_snapshots(id) ON DELETE CASCADE,
          threshold_type TEXT NOT NULL,
          current_value REAL NOT NULL,
          threshold_value REAL NOT NULL,
          breach_pct REAL,
          fired_at TEXT NOT NULL,
          notified_at TEXT
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS alert_notifications (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          alert_enabled INTEGER NOT NULL DEFAULT 1,
          digest_frequency TEXT NOT NULL DEFAULT 'immediate',
          created_at TEXT NOT NULL
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS container_events (
          id TEXT PRIMARY KEY NOT NULL,
          agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          event TEXT NOT NULL,
          details TEXT,
          created_at TEXT NOT NULL
        )`,
      },
    ],
    "write",
  );

  // Promote ADMIN_EMAIL to admin role (idempotent)
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (adminEmail) {
    await client.execute({
      sql: `UPDATE users SET role = 'admin' WHERE email = ? AND role != 'admin'`,
      args: [adminEmail],
    });
  }
}

export function getDb() {
  return getInstance().db;
}

export * from "./schema";
