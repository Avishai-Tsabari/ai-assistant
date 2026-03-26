import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  hostname: text("hostname").notNull(),
  serverId: integer("server_id"),
  ipv4: text("ipv4"),
  dashboardUrl: text("dashboard_url"),
  healthUrl: text("health_url"),
  /** AES-GCM ciphertext (hex) of MERCURY_API_SECRET for remote calls */
  apiSecretCipher: text("api_secret_cipher"),
  /**
   * JSON: Array<{ provider: string; keyId: string; model: string }>
   * References provider_keys.id for each leg of the model chain.
   */
  modelChainConfig: text("model_chain_config"),
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
  /** AES-GCM ciphertext (hex) of the plaintext API key */
  encryptedKey: text("encrypted_key").notNull(),
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
