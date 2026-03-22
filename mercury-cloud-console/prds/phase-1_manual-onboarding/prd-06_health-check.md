---
prd: "06"
title: "Health check script"
phase: 1
depends_on: ["05"]
estimated_effort: "2 hours"
status: approved
---

# PRD-06: Health Check

## Overview

`infra/scripts/health-check.ts` reads `AGENTS_JSON_PATH` and prints status per agent.

## Tasks

##### CREATE: infra/scripts/health-check.ts

**Acceptance:** Exits 1 if agents file missing; otherwise prints one line per agent.

## Execution Log

| Task | Status | Timestamp | Files Touched | Notes |
|------|--------|-----------|---------------|-------|
| 1 | done | 2026-03-22 | health-check.ts | |

## Acceptance Criteria

- [x] Script implemented
