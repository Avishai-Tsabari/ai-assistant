import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
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
  createdAt: text("created_at").notNull(),
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
