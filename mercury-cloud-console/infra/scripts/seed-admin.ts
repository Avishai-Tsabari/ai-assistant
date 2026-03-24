#!/usr/bin/env bun
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: bun run infra/scripts/seed-admin.ts <email>");
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? "file:./data/console.db";
const path = url.replace(/^file:/, "");
mkdirSync(dirname(path), { recursive: true });

const db = new Database(path);
const result = db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email);

if (result.changes === 0) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}

console.log(`✓ User ${email} promoted to admin`);
