#!/usr/bin/env bun
/**
 * Market data CLI for the Mercury agent container.
 * Uses the Yahoo Finance public REST API — no credentials required.
 *
 * Usage:
 *   bun market-data-cli.ts quotes AAPL[,MSFT,...]
 *   bun market-data-cli.ts bars   SYMBOL [range]   (range: 1d 5d 1mo 3mo 6mo 1y 2y 5y, default 5d)
 *   bun market-data-cli.ts search QUERY
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Crumb auth
// ---------------------------------------------------------------------------

async function getCrumb(): Promise<{ crumb: string; cookie: string }> {
  const allCookies: string[] = [];

  for (const seedUrl of ["https://finance.yahoo.com", "https://fc.yahoo.com"]) {
    try {
      const r = await fetch(seedUrl, {
        headers: { "User-Agent": UA, Accept: "text/html,*/*" },
        redirect: "manual",
      });
      const cookies = r.headers.getSetCookie?.() ?? [];
      const single = cookies.length ? cookies : [r.headers.get("set-cookie") ?? ""].filter(Boolean);
      allCookies.push(...single);
    } catch {
      // ignore — try next seed
    }
  }

  const cookieStr = allCookies
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");

  for (const host of ["query1", "query2"]) {
    const r = await fetch(`https://${host}.finance.yahoo.com/v1/test/getcrumb`, {
      headers: { "User-Agent": UA, Cookie: cookieStr },
    });
    if (r.ok) {
      const crumb = (await r.text()).trim();
      if (crumb && !crumb.startsWith("<")) return { crumb, cookie: cookieStr };
    }
  }
  throw new Error("Unable to obtain Yahoo Finance session. The API may be temporarily unavailable.");
}

async function yfGet(path: string, crumb: string, cookie: string): Promise<unknown> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://query1.finance.yahoo.com${path}${sep}crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", Cookie: cookie },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`Yahoo Finance error ${res.status}: ${body.slice(0, 300)}`);
    process.exit(1);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdQuotes(symbols: string, crumb: string, cookie: string) {
  const encoded = symbols
    .split(",")
    .map((s) => encodeURIComponent(s.trim()))
    .join("%2C");
  const data = (await yfGet(
    `/v7/finance/quote?symbols=${encoded}&fields=` +
      "regularMarketPrice,regularMarketChange,regularMarketChangePercent," +
      "regularMarketVolume,bid,ask,regularMarketDayHigh,regularMarketDayLow," +
      "regularMarketOpen,regularMarketPreviousClose,marketCap,currency,quoteType",
    crumb,
    cookie,
  )) as {
    quoteResponse: {
      result: Record<string, unknown>[];
      error?: unknown;
    };
  };
  const result = data?.quoteResponse?.result;
  if (!result?.length) {
    console.error("No quote data returned. Check symbol(s):", symbols);
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}

async function cmdBars(symbol: string, range: string, crumb: string, cookie: string) {
  // Pick a sensible interval based on range
  const intervalMap: Record<string, string> = {
    "1d": "5m",
    "5d": "1d",
    "1mo": "1d",
    "3mo": "1d",
    "6mo": "1wk",
    "1y": "1wk",
    "2y": "1mo",
    "5y": "1mo",
    ytd: "1wk",
    max: "3mo",
  };
  const interval = intervalMap[range] ?? "1d";
  const data = (await yfGet(
    `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${encodeURIComponent(range)}`,
    crumb,
    cookie,
  )) as {
    chart: {
      result: {
        meta: Record<string, unknown>;
        timestamp: number[];
        indicators: { quote: { open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }[] };
      }[];
      error?: unknown;
    };
  };
  const chart = data?.chart?.result?.[0];
  if (!chart) {
    console.error("No chart data returned for", symbol);
    process.exit(1);
  }
  const { timestamp, indicators, meta } = chart;
  const q = indicators?.quote?.[0];
  const bars = (timestamp ?? []).map((ts, i) => ({
    time: new Date(ts * 1000).toISOString(),
    open: q?.open[i] ?? null,
    high: q?.high[i] ?? null,
    low: q?.low[i] ?? null,
    close: q?.close[i] ?? null,
    volume: q?.volume[i] ?? null,
  }));
  console.log(JSON.stringify({ symbol, range, interval, meta: { currency: meta?.currency, exchangeName: meta?.exchangeName }, bars }, null, 2));
}

async function cmdSearch(query: string, crumb: string, cookie: string) {
  const data = (await yfGet(
    `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`,
    crumb,
    cookie,
  )) as {
    quotes: { symbol: string; shortname?: string; longname?: string; quoteType?: string; exchange?: string }[];
  };
  const quotes = data?.quotes ?? [];
  if (!quotes.length) {
    console.log(JSON.stringify([]));
    return;
  }
  console.log(
    JSON.stringify(
      quotes.map((q) => ({
        symbol: q.symbol,
        name: q.longname ?? q.shortname ?? "",
        type: q.quoteType ?? "",
        exchange: q.exchange ?? "",
      })),
      null,
      2,
    ),
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function usage(): never {
  console.error(`Usage:
  market-data-cli.ts quotes SYMBOL[,SYMBOL2,...]
  market-data-cli.ts bars   SYMBOL [range]        (range: 1d 5d 1mo 3mo 6mo 1y 2y 5y, default: 5d)
  market-data-cli.ts search QUERY

Examples:
  market-data-cli.ts quotes AAPL,MSFT,NVDA
  market-data-cli.ts quotes ES=F,NQ=F              # S&P 500 / Nasdaq futures
  market-data-cli.ts bars   AAPL 1mo
  market-data-cli.ts search "gold futures"`);
  process.exit(1);
}

const [, , cmd, arg1, arg2] = process.argv;
if (!cmd || !arg1) usage();

const { crumb, cookie } = await getCrumb();

switch (cmd) {
  case "quotes":
    await cmdQuotes(arg1, crumb, cookie);
    break;
  case "bars":
    await cmdBars(arg1, arg2 ?? "5d", crumb, cookie);
    break;
  case "search":
    await cmdSearch(arg1, crumb, cookie);
    break;
  default:
    usage();
}
