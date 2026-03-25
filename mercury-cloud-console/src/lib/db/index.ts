import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

function dbPath(): string {
  const url = process.env.DATABASE_URL ?? "file:./data/console.db";
  return url.replace(/^file:/, "");
}

function bootstrap(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hostname TEXT NOT NULL,
      server_id INTEGER,
      ipv4 TEXT,
      dashboard_url TEXT,
      health_url TEXT,
      api_secret_cipher TEXT,
      deprovisioned_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id TEXT,
      status TEXT NOT NULL DEFAULT 'inactive',
      updated_at TEXT NOT NULL
    );
  `);

  // Migration: add role column to existing users table
  try {
    sqlite.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
  } catch {
    // Column already exists — ignore
  }

  // Migration: add deprovisioned_at column to existing agents table
  try {
    sqlite.exec(`ALTER TABLE agents ADD COLUMN deprovisioned_at TEXT`);
  } catch {
    // Column already exists — ignore
  }

  // Migration: make password_hash nullable (for OAuth accounts)
  try {
    const info = sqlite.prepare("PRAGMA table_info(users)").all() as Array<{ name: string; notnull: number }>;
    const col = info.find((c) => c.name === "password_hash");
    if (col && col.notnull === 1) {
      sqlite.exec(`
        ALTER TABLE users RENAME TO users_old;
        CREATE TABLE users (
          id TEXT PRIMARY KEY NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT,
          role TEXT NOT NULL DEFAULT 'user',
          created_at TEXT NOT NULL
        );
        INSERT INTO users SELECT id, email, password_hash, role, created_at FROM users_old;
        DROP TABLE users_old;
      `);
    }
  } catch {
    // Already nullable or migration failed — ignore
  }

  // Promote ADMIN_EMAIL to admin role (idempotent, runs once per process on DB init)
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (adminEmail) {
    sqlite
      .prepare(`UPDATE users SET role = 'admin' WHERE email = ? AND role != 'admin'`)
      .run(adminEmail);
  }
}

let drizzleInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!drizzleInstance) {
    const path = dbPath();
    mkdirSync(dirname(path), { recursive: true });
    const raw = new Database(path);
    bootstrap(raw);
    drizzleInstance = drizzle(raw, { schema });
  }
  return drizzleInstance;
}

export * from "./schema";
