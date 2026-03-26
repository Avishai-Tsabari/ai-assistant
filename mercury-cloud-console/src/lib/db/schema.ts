import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  status: text("status").notNull().default("inactive"),
  updatedAt: text("updated_at").notNull(),
});
