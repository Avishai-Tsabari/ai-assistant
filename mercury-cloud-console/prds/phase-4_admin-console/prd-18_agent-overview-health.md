---
prd: "18"
title: "Agent Overview & Live Health"
phase: 4
depends_on: ["16", "17"]
estimated_effort: "5 hours"
status: done
---

# PRD-18: Agent Overview & Live Health

## Overview

Create a cross-user agent list with live health status indicators, replacing the CLI `health-check.ts` script with a web-based dashboard. Health is fetched asynchronously after page load to avoid blocking SSR.

## Tasks

### Task 1: Health poller utility
##### CREATE: src/lib/health-poller.ts

Export `pollAllAgentHealth()`:
1. Query all agents from DB (no user filter), joined with user email
2. For each agent with a `healthUrl`, call `fetchAgentHealth()` from `agent-client.ts`
3. Use `Promise.allSettled` with 8s per-agent timeout
4. Return array of `{ agentId, hostname, userId, userEmail, ipv4, serverId, dashboardUrl, health: { status, uptime, adapters } | null, error: string | null, checkedAt: string }`

Also export `pollSingleAgentHealth(agentId)` for individual refresh.

**Acceptance:** Returns health data for all agents. Failed health checks return `error` string, not thrown exception.

### Task 2: Admin API -- list all agents
##### CREATE: src/app/api/admin/agents/route.ts

GET handler:
1. Check admin auth
2. Query all agents joined with user email
3. If `?includeHealth=true` query param, call `pollAllAgentHealth()` and merge results
4. Return `{ agents: [...] }`

**Acceptance:** Returns all agents across users. Health data included when requested.

### Task 3: Admin API -- single agent health
##### CREATE: src/app/api/admin/agents/[id]/health/route.ts

GET handler:
1. Check admin auth
2. Look up agent by ID
3. Call `fetchAgentHealth()` for that agent
4. Return health result

**Acceptance:** Returns fresh health for one agent. 404 if agent not found.

### Task 4: Agents list page
##### CREATE: src/app/(admin)/admin/agents/page.tsx

Two-part rendering:
- **Server component**: renders table with all agents from DB (hostname, owner email, IP, server ID, dashboard link)
- **Client component child**: fetches health via `/api/admin/agents?includeHealth=true` after mount, updates status column with green/red dot indicators and uptime

Table columns: Hostname, Owner, IP, Server ID, Health (dot + status), Uptime, Dashboard Link

Include a "Refresh All" button that re-fetches health.

**Acceptance:** Page loads fast showing agent data. Health indicators appear after async fetch. Refresh button works.

### Task 5: Health-only view
##### CREATE: src/app/(admin)/admin/health/page.tsx

Filtered view showing:
- Summary: X healthy, Y unhealthy, Z unreachable
- Table of only unhealthy/unreachable agents for quick triage
- "Refresh All" button
- Link to full agents list

Fetches health from `/api/admin/agents?includeHealth=true` on the client side.

**Acceptance:** Only problematic agents shown. Healthy agents hidden. Counts correct.

## Execution Log

| Task | Status | Timestamp | Files Touched | Notes |
|------|--------|-----------|---------------|-------|
| 1    | done   | 2026-03-25 | src/lib/health-poller.ts | pollAllAgentHealth + pollSingleAgentHealth with 8s timeout |
| 2    | done   | 2026-03-25 | src/app/api/admin/agents/route.ts | GET with optional ?includeHealth=true |
| 3    | done   | 2026-03-25 | src/app/api/admin/agents/[id]/health/route.ts | Single agent health endpoint |
| 4    | done   | 2026-03-25 | src/app/(admin)/admin/agents/{page,AgentsHealthClient}.tsx | SSR table + client health fetch with refresh |
| 5    | done   | 2026-03-25 | src/app/(admin)/admin/health/page.tsx | Triage view: healthy/unhealthy/unreachable pills + table |

## Acceptance Criteria

- [x] Admin sees all agents across all users in one table
- [x] Health status shown with green/red indicators after async fetch
- [x] Individual agent health can be refreshed
- [x] "Refresh All" re-polls all agents
- [x] Health page shows only problematic agents
- [x] Page loads fast (health does not block SSR)
