#!/usr/bin/env bun
/**
 * Minimal TradeStation v3 CLI for the Mercury agent container.
 * Uses TRADESTATION_ACCESS_TOKEN and TRADESTATION_API_BASE from the host hook.
 */

const token = process.env.TRADESTATION_ACCESS_TOKEN;
const authErr = process.env.TRADESTATION_AUTH_ERROR;
const base = (
  process.env.TRADESTATION_API_BASE || "https://api.tradestation.com/v3"
).replace(/\/$/, "");

function usage(): never {
  console.error(`Usage:
  ts-cli.ts accounts
  ts-cli.ts balances <accountKey>
  ts-cli.ts positions <accountKey>
  ts-cli.ts bars <symbol> [barsback]
  ts-cli.ts quotes <symbols>        (comma-separated, e.g. SPY,QQQ,@ES)

Environment: TRADESTATION_ACCESS_TOKEN (and optional TRADESTATION_API_BASE)`);
  process.exit(1);
}

async function apiGet(
  path: string,
  query?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(path.replace(/^\//, ""), `${base}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    console.error(res.status, body);
    process.exit(1);
  }
  return body;
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd) usage();

  if (authErr) {
    console.error("TradeStation auth error:", authErr);
    process.exit(1);
  }
  if (!token) {
    console.error(
      "Missing TRADESTATION_ACCESS_TOKEN. This TradeStation integration is admin-only; check Mercury host configuration.",
    );
    process.exit(1);
  }

  switch (cmd) {
    case "accounts": {
      const data = await apiGet("/brokerage/accounts");
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case "balances": {
      const accountKey = rest[0];
      if (!accountKey) usage();
      const data = await apiGet(
        `/brokerage/accounts/${encodeURIComponent(accountKey)}/balances`,
      );
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case "positions": {
      const accountKey = rest[0];
      if (!accountKey) usage();
      const data = await apiGet(
        `/brokerage/accounts/${encodeURIComponent(accountKey)}/positions`,
      );
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case "bars": {
      const symbol = rest[0];
      if (!symbol) usage();
      const barsback = rest[1] ?? "20";
      const data = await apiGet(
        `/marketdata/barcharts/${encodeURIComponent(symbol)}`,
        {
          barsback,
        },
      );
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case "quotes": {
      // Comma-separated symbols, e.g. "SPY,QQQ,DIA,@ES"
      // Uses the streaming SSE endpoint; reads the first quote per symbol then exits.
      const symbols = rest[0];
      if (!symbols) usage();
      const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      const url = new URL(
        `/marketdata/stream/quotes/${encodeURIComponent(symbols)}`,
        `${base}/`,
      );
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(res.status, text);
        process.exit(1);
      }
      const seen = new Set<string>();
      const quotes: unknown[] = [];
      outer: for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        const lines = Buffer.from(chunk).toString("utf8").split("\n");
        for (const line of lines) {
          const raw = line.trim();
          if (!raw) continue;
          try {
            const obj = JSON.parse(raw) as Record<string, unknown>;
            if (obj["Symbol"]) {
              const sym = String(obj["Symbol"]).toUpperCase();
              if (!seen.has(sym)) {
                seen.add(sym);
                quotes.push(obj);
              }
            }
          } catch {
            // skip heartbeat / non-JSON lines
          }
          if (symbolList.every((s) => seen.has(s))) break outer;
        }
      }
      console.log(JSON.stringify(quotes, null, 2));
      break;
    }
    default:
      usage();
  }
}

await main();
