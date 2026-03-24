---
prd: "07"
title: "Control plane DB schema"
phase: 2
depends_on: ["phase-1"]
estimated_effort: "3 hours"
status: done
---

# PRD-07: DB Schema

## Overview

SQLite (better-sqlite3) tables: `users`, `agents`, `subscriptions` — see [src/lib/db/schema.ts](../../src/lib/db/schema.ts) and bootstrap in [src/lib/db/index.ts](../../src/lib/db/index.ts).

## Tasks

### Task 1: Bootstrap tables on first access
##### CREATE: src/lib/db/index.ts + src/lib/db/schema.ts
**Status:** done

### Task 2: Link provision CLI to agents table
##### MODIFY: infra/scripts/provision.ts
Add `userEmail` field to the request JSON schema. After server creation, look up the user by email in SQLite, insert a row into the `agents` table with `userId`, server details, and the AES-encrypted `apiSecret` (using `CONSOLE_ENCRYPTION_MASTER_KEY`). This bridges the Phase 1 JSON registry with the Phase 2 control-plane DB so the dashboard can display provisioned agents.

**Acceptance:** After `bun run provision`, the agent appears on the logged-in user's dashboard.

## Acceptance Criteria

- [x] Tables created on first access
- [x] Drizzle schema matches SQL bootstrap
- [ ] Provisioned agents inserted into `agents` table with correct `user_id`
