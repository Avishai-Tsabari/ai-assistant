---
prd: "19"
title: "Quick Actions"
phase: 4
depends_on: ["18"]
estimated_effort: "3 hours"
status: done
---

# PRD-19: Quick Actions

## Overview

Add actionable operations to the admin agent views: dashboard links, IP copy, and a deprovision workflow (DB-only for safety -- no actual Hetzner server deletion). Adds an agent detail page for deeper inspection.

## Tasks

### Task 1: Add deprovisionedAt column to agents schema
##### MODIFY: src/lib/db/schema.ts

Add to `agents` table:
```typescript
deprovisionedAt: text("deprovisioned_at"),
```

**Acceptance:** Schema includes nullable `deprovisionedAt` field.

### Task 2: Bootstrap SQL migration for deprovisionedAt
##### MODIFY: src/lib/db/index.ts

Add idempotent migration block (try/catch):
```sql
ALTER TABLE agents ADD COLUMN deprovisioned_at TEXT;
```

**Acceptance:** Existing DB gets column without error. Fresh DB has it from CREATE TABLE.

### Task 3: Filter deprovisioned agents from default queries
##### MODIFY: src/app/api/admin/agents/route.ts

- Default query excludes agents where `deprovisionedAt IS NOT NULL`
- Add `?includeDeprovisioned=true` query param to show all
- Include `deprovisionedAt` in response when present

**Acceptance:** Deprovisioned agents hidden by default. Visible with query param.

### Task 4: Deprovision API endpoint
##### CREATE: src/app/api/admin/agents/[id]/deprovision/route.ts

POST handler:
1. Check admin auth
2. Look up agent by ID, verify exists
3. Set `deprovisionedAt` to current ISO timestamp
4. Return `{ ok: true, deprovisionedAt }`

This is a DB-only operation. Actual Hetzner server deletion is deferred.

**Acceptance:** Agent marked as deprovisioned. Disappears from default agent list.

### Task 5: Agent detail page
##### CREATE: src/app/(admin)/admin/agents/[id]/page.tsx

Server component showing:
- Full agent info: hostname, owner (email + link to user), IP, server ID, dashboard URL, health URL, created date
- Live health status (client-side fetch from `/api/admin/agents/[id]/health`)
- Action buttons: "Open Dashboard" (external link), "Copy IP", "Deprovision" (with confirmation dialog)
- If deprovisioned: show deprovisioned timestamp, disable actions

Deprovision button shows a confirmation dialog (client component) before calling the API.

**Acceptance:** Agent detail page shows all info. Deprovision requires confirmation. Deprovisioned agents show disabled state.

## Execution Log

| Task | Status | Timestamp | Files Touched | Notes |
|------|--------|-----------|---------------|-------|
| 1    | done   | 2026-03-25 | src/lib/db/schema.ts | Added deprovisionedAt to agents table |
| 2    | done   | 2026-03-25 | src/lib/db/index.ts | CREATE TABLE + idempotent ALTER TABLE migration |
| 3    | done   | 2026-03-25 | src/app/api/admin/agents/route.ts, src/lib/health-poller.ts | Filter deprovisioned by default, ?includeDeprovisioned param |
| 4    | done   | 2026-03-25 | src/app/api/admin/agents/[id]/deprovision/route.ts | POST sets deprovisionedAt timestamp |
| 5    | done   | 2026-03-25 | src/app/(admin)/admin/agents/[id]/{page,AgentDetailClient}.tsx | Full detail page with health, actions, deprovision confirm |

## Acceptance Criteria

- [x] Deprovisioned agents hidden from default agent list
- [x] Deprovision button requires confirmation before acting
- [x] Agent detail page shows full info + live health
- [x] "Open Dashboard" links open in new tab
- [x] Deprovisioned agents can be shown with a toggle/filter
