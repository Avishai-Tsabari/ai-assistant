---
prd: "04"
title: "Env template"
phase: 1
depends_on: ["01"]
estimated_effort: "2 hours"
status: approved
---

# PRD-04: Env Template

## Overview

`infra/mercury.env.tmpl` plus `src/lib/env-renderer.ts` render per-agent `.env` with required keys.

## Tasks

##### CREATE: infra/mercury.env.tmpl, src/lib/env-renderer.ts

**Acceptance:** `renderMercuryEnv` produces text containing `MERCURY_PORT`, `MERCURY_ANTHROPIC_API_KEY`, `MERCURY_API_SECRET`.

## Execution Log

| Task | Status | Timestamp | Files Touched | Notes |
|------|--------|-----------|---------------|-------|
| 1 | done | 2026-03-22 | infra/mercury.env.tmpl, src/lib/env-renderer.ts | |

## Acceptance Criteria

- [x] Template + renderer implemented
