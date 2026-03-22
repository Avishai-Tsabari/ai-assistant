#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type AgentsFile = {
  agents: Array<{
    hostname: string;
    healthUrl: string;
    serverId: number;
  }>;
};

async function checkOne(url: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const j = (await res.json()) as { status?: string };
    return j.status === "ok"
      ? { ok: true, detail: "ok" }
      : { ok: false, detail: JSON.stringify(j) };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const path =
    process.env.AGENTS_JSON_PATH ??
    join(process.cwd(), "data", "agents.json");
  if (!existsSync(path)) {
    console.error(`No agents file: ${path}`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(path, "utf8")) as AgentsFile;
  for (const a of data.agents) {
    const base = a.healthUrl.replace(/\/health$/, "");
    const r = await checkOne(base);
    console.log(
      `${a.hostname} (server ${a.serverId}): ${r.ok ? "HEALTHY" : "DOWN"} — ${r.detail}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
