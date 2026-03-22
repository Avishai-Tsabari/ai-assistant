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

## Acceptance Criteria

- [x] Tables created on first access
- [x] Drizzle schema matches SQL bootstrap
