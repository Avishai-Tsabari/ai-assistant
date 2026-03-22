import { defineConfig } from "drizzle-kit";

const file = process.env.DATABASE_URL?.replace(/^file:/, "") ?? "./data/console.db";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: file },
});
