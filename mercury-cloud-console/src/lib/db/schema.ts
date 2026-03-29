import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/* ───────────────────────── Multi-tenant compute ──────────────────────── */

/** Compute nodes that run agent containers. */
export const computeNodes = sqliteTable("compute_nodes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** Human-readable label, e.g. "hetzner-ax42-nbg1" */
  label: text("label").notNull(),
  /** IP or hostname of the compute node */
  host: text("host").notNull(),
  /** Full URL to the node agent HTTP daemon, e.g. "http://10.0.0.1:9090" */
  apiUrl: text("api_url").notNull(),
  /** Shared secret for authenticating with the node agent */
  apiToken: text("api_token").notNull(),
  /** Maximum number of agent containers allowed on this node */
  maxAgents: integer("max_agents").notNull().default(100),
  /** active = accepting new agents, draining = no new agents, offline = unreachable */
  status: text("status", {
    enum: ["active", "draining", "offline"],
  })
    .notNull()
    .default("active"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("user"),
  createdAt: text("created_at").notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Agent hostname — auto-generated for container mode, user-provided for VPS mode */
  hostname: text("hostname").notNull(),

  /* ── VPS mode fields (legacy, nullable) ────────────────────────────── */
  serverId: integer("server_id"),
  ipv4: text("ipv4"),

  /* ── Container mode fields ─────────────────────────────────────────── */
  /** Compute node this agent runs on (null for VPS-provisioned agents) */
  nodeId: text("node_id").references(() => computeNodes.id),
  /** Docker container ID on the compute node */
  containerId: text("container_id"),
  /** Host port mapped to the container's 8787 (may be null if Traefik routes internally) */
  containerPort: integer("container_port"),
  /** Current container lifecycle state */
  containerStatus: text("container_status", {
    enum: ["running", "stopped", "restarting", "failed"],
  }),
  /** Docker image tag deployed to this agent, e.g. "0.4.5" or "latest" */
  imageTag: text("image_tag"),

  /* ── Common fields ─────────────────────────────────────────────────── */
  dashboardUrl: text("dashboard_url"),
  healthUrl: text("health_url"),
  /** AES-GCM ciphertext (hex) of MERCURY_API_SECRET for remote calls */
  apiSecretCipher: text("api_secret_cipher"),
  /**
   * JSON: Array<{ provider: string; keyId: string; model: string }>
   * References provider_keys.id for each leg of the model chain.
   */
  modelChainConfig: text("model_chain_config"),
  /** Compute tier — determines container memory + CPU limits */
  tier: text("tier", { enum: ["starter", "standard", "pro"] }).notNull().default("standard"),
  deprovisionedAt: text("deprovisioned_at"),
  createdAt: text("created_at").notNull(),
});

/**
 * Per-user API key pool for LLM providers.
 * Keys are stored AES-GCM encrypted using CONSOLE_ENCRYPTION_MASTER_KEY.
 */
export const providerKeys = sqliteTable("provider_keys", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Provider identifier, e.g. "anthropic", "openai", "google", "groq" */
  provider: text("provider").notNull(),
  /** User-defined label, e.g. "Work Anthropic key" */
  label: text("label"),
  /**
   * "api_key" (default) → encryptedKey holds a plaintext API key string.
   * "oauth" → encryptedKey holds JSON { access, refresh, expires, ...extra }.
   */
  keyType: text("key_type").notNull().default("api_key"),
  /** AES-GCM ciphertext (hex) of the plaintext API key or OAuth credentials JSON */
  encryptedKey: text("encrypted_key").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/**
 * Short-lived session state for in-progress OAuth flows.
 * Rows expire after ~10 minutes and are deleted on completion.
 */
export const oauthSessions = sqliteTable("oauth_sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  /** "anthropic" | "github-copilot" */
  provider: text("provider").notNull(),
  /** PKCE verifier (Anthropic only) */
  pkceVerifier: text("pkce_verifier"),
  /** Device code for polling (GitHub Copilot only) */
  deviceCode: text("device_code"),
  /** GitHub device flow polling interval in seconds */
  deviceInterval: integer("device_interval"),
  /** ISO timestamp — reject sessions older than this */
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  priceId: text("price_id"),
  currentPeriodEnd: text("current_period_end"),
  canceledAt: text("canceled_at"),
  status: text("status").notNull().default("inactive"),
  updatedAt: text("updated_at").notNull(),
});

/** Alert thresholds configured per agent. */
export const usageAlerts = sqliteTable("usage_alerts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  thresholdType: text("threshold_type", {
    enum: ["daily_tokens", "monthly_tokens", "daily_cost", "monthly_cost"],
  }).notNull(),
  thresholdValue: real("threshold_value").notNull(),
  enabled: integer("enabled").notNull().default(1),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/** Immutable usage snapshots polled from agents. */
export const usageSnapshots = sqliteTable("usage_snapshots", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  spaceId: text("space_id"),
  totalInputTokens: integer("total_input_tokens").notNull(),
  totalOutputTokens: integer("total_output_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  totalCost: real("total_cost").notNull(),
  runCount: integer("run_count").notNull(),
  lastUsedAt: integer("last_used_at"),
  snapshotAt: text("snapshot_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/** Alert fire history. */
export const alertEvents = sqliteTable("alert_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  alertId: text("alert_id")
    .notNull()
    .references(() => usageAlerts.id, { onDelete: "cascade" }),
  snapshotId: text("snapshot_id")
    .notNull()
    .references(() => usageSnapshots.id, { onDelete: "cascade" }),
  thresholdType: text("threshold_type").notNull(),
  currentValue: real("current_value").notNull(),
  thresholdValue: real("threshold_value").notNull(),
  breachPct: real("breach_pct"),
  firedAt: text("fired_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  notifiedAt: text("notified_at"),
});

/** User notification preferences for usage alerts. */
export const alertNotifications = sqliteTable("alert_notifications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  alertEnabled: integer("alert_enabled").notNull().default(1),
  digestFrequency: text("digest_frequency", {
    enum: ["immediate", "daily"],
  })
    .notNull()
    .default("immediate"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/* ───────────────────────── Container audit log ───────────────────────── */

/** Audit log of container lifecycle events for debugging and observability. */
export const containerEvents = sqliteTable("container_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  /** Lifecycle event type */
  event: text("event", {
    enum: ["started", "stopped", "restarted", "failed", "updated"],
  }).notNull(),
  /** Optional JSON blob with event-specific details (e.g. error message, old/new image tag) */
  details: text("details"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
