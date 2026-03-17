---
name: pinchtab
description: Web search (API) and browser automation (Pinchtab) for real-time info, scraping, form filling, screenshots.
allowed-tools: Bash(web-search:*, pinchtab:*)
metadata:
  short-description: Web search + browser automation
---

# Web Search & Browser

## When to Use Which

**web-search** (API, fast, reliable): Stocks, weather, news, current events, factual lookups.
Example: `web-search "SPY ETF price today"`

**pinchtab** (browser): Logged-in sites, form filling, screenshots, JS-heavy pages, interactive flows.
Example: `pinchtab & sleep 3 && pinchtab nav 'https://search.brave.com/search?q=query' && sleep 3 && pinchtab text`

Prefer web-search for simple lookups. Use pinchtab only when you need browser interaction.

### web-search usage

```bash
web-search "your query here"
```

Requires `MERCURY_BRAVE_API_KEY` in .env. Output is title + description per result. Summarize directly from the bash result.

---

# Pinchtab

Fast, lightweight browser control for AI agents via HTTP + accessibility tree.

**Security Note:** Pinchtab runs entirely locally. It does not contact external services, send telemetry, or exfiltrate data. However, it controls a real Chrome instance — if pointed at a profile with saved logins, agents can access authenticated sites. Always use a dedicated empty profile and set BRIDGE_TOKEN when exposing the API. See [TRUST.md](TRUST.md) for the full security model.

## Quick Start (Agent Workflow)

The 30-second pattern for browser tasks:

```bash
# 1. Start Pinchtab (runs forever, local on :9867)
pinchtab &

# 2. In your agent, follow this loop:
#    a) Navigate to a URL
#    b) Snapshot the page (get refs like e0, e5, e12)
#    c) Act on a ref (click e5, type e12 "search text")
#    d) Snapshot again to see the result
#    e) Repeat step c-d until done
```

**That's it.** Refs are stable—you don't need to re-snapshot before every action. Only snapshot when the page changes significantly.

## Setup

```bash
# Headless (default) — no visible window
pinchtab &

# Headed — visible Chrome window for human debugging
BRIDGE_HEADLESS=false pinchtab &

# With auth token
BRIDGE_TOKEN="your-secret-token" pinchtab &

# Custom port
BRIDGE_PORT=8080 pinchtab &
```

Default: **port 9867**, no auth required (local). Set `BRIDGE_TOKEN` for remote access.

For advanced setup, see [references/profiles.md](references/profiles.md) and [references/env.md](references/env.md).

## What a Snapshot Looks Like

After calling `pinchtab snap`, you get the page's accessibility tree — flat list of elements with refs (e0, e1, e2...). Then act on refs: `pinchtab click e5`, `pinchtab type e12 "hello"`, `pinchtab press Enter`.

## Core Workflow

1. **Navigate** to a URL
2. **Snapshot** the accessibility tree (get refs)
3. **Act** on refs (click, type, press)
4. **Snapshot** again to see results

Refs (e.g. `e0`, `e5`, `e12`) are cached per tab after each snapshot — no need to re-snapshot before every action unless the page changed significantly.

### Quick examples

```bash
pinchtab nav https://example.com
pinchtab snap -i -c                    # interactive + compact
pinchtab click e5
pinchtab type e12 hello world
pinchtab press Enter
pinchtab text                          # readable text (~1K tokens)
pinchtab ss -o page.jpg                # screenshot
pinchtab eval "document.title"         # run JavaScript
```

For the full HTTP API, see [references/api.md](references/api.md).

## Web Search Pattern

For real-time info (stocks, weather, news), use Brave Search:

```bash
pinchtab & sleep 3 && pinchtab nav 'https://search.brave.com/search?q=your+query+here' && sleep 3 && pinchtab text
```

**Run as ONE bash command** — multiple separate bash calls run in parallel and fail. The single command runs sequentially in the shell.

**Wait 3+ seconds after navigate** — Chrome needs time to render. Use `pinchtab text` for readable content (~800 tokens); use `pinchtab snap -i -c` when you need to click elements.

## Tips

- Refs are stable between snapshot and actions — no need to re-snapshot before clicking
- After navigation or major page changes, take a new snapshot for fresh refs
- Use `BRIDGE_BLOCK_IMAGES=true` for read-heavy tasks (faster, fewer tokens)
- **Wait 3+ seconds after navigate** before snapshot or text
