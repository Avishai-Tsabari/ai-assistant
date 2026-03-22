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
      password_hash TEXT NOT NULL,
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
