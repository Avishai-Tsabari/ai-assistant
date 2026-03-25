---
name: market-data
description: Broker-agnostic real-time market data (quotes, OHLCV bars, symbol search) via Yahoo Finance. No credentials or brokerage account required.
allowed-tools: Bash
---

# Market Data (Mercury extension)

Provides real-time quotes, historical OHLCV bars, and symbol search using the Yahoo Finance public REST API. No API key or brokerage account is required — works for every user.

## CLI

Scripts live next to this skill. In the agent container the skill is typically mounted under `/home/node/.pi/agent/skills/market-data/`.

```bash
MD="$(find /home/node/.pi/agent/skills/market-data -name market-data-cli.ts | head -1)"
bun "$MD" quotes SYMBOL[,SYMBOL2,...]
bun "$MD" bars   SYMBOL [range]        # range: 1d 5d 1mo 3mo 6mo 1y 2y 5y (default 5d)
bun "$MD" search QUERY
```

## Commands

### `quotes` — real-time snapshot

Returns current price, bid/ask, day range, volume, market cap and percent change for one or more symbols.

```bash
bun "$MD" quotes AAPL
bun "$MD" quotes AAPL,MSFT,NVDA,GOOGL       # US stocks
bun "$MD" quotes ES=F,NQ=F,YM=F             # index futures (S&P 500, Nasdaq, Dow)
bun "$MD" quotes GC=F,SI=F,CL=F             # commodities (Gold, Silver, Oil)
bun "$MD" quotes BTC-USD,ETH-USD            # crypto
bun "$MD" quotes EURUSD=X,GBPUSD=X         # forex
```

Key fields in the response: `symbol`, `regularMarketPrice`, `regularMarketChange`, `regularMarketChangePercent`, `bid`, `ask`, `regularMarketDayHigh`, `regularMarketDayLow`, `regularMarketVolume`, `marketCap`, `currency`.

### `bars` — historical OHLCV

Returns open/high/low/close/volume bars. The interval is chosen automatically based on the range.

```bash
bun "$MD" bars AAPL               # last 5 days (default), daily bars
bun "$MD" bars AAPL 1d            # today, 5-minute bars
bun "$MD" bars AAPL 1mo           # last month, daily bars
bun "$MD" bars AAPL 1y            # last year, weekly bars
bun "$MD" bars 'ES=F' 5d          # S&P 500 futures, daily bars
bun "$MD" bars BTC-USD 3mo        # Bitcoin 3 months
```

Response shape: `{ symbol, range, interval, meta: { currency, exchangeName }, bars: [{ time, open, high, low, close, volume }] }`.

### `search` — symbol lookup

Find tickers by company name, commodity, or keyword.

```bash
bun "$MD" search "Apple"
bun "$MD" search "gold futures"
bun "$MD" search "S&P 500 ETF"
bun "$MD" search "Bitcoin"
```

Returns an array of `{ symbol, name, type, exchange }` objects.

## Notes

- Data is sourced from Yahoo Finance and is typically delayed 15 minutes for US equities on the free tier.
- Futures symbols use `=F` suffix (e.g. `ES=F`, `GC=F`). Crypto uses `-USD` suffix (e.g. `BTC-USD`). Forex uses `=X` suffix (e.g. `EURUSD=X`).
- The CLI performs a brief session handshake (crumb auth) on startup — this is normal and takes ~1 second.
- Rate limits are generous for conversational usage. Do not call in tight loops.
