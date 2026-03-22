---
prd: "05"
title: "Provisioning CLI"
phase: 1
depends_on: ["02", "03", "04"]
estimated_effort: "6 hours"
status: approved
---

# PRD-05: Provisioning CLI

## Overview

`infra/scripts/provision.ts` reads JSON request, calls Hetzner API, optional DNS, appends `data/agents.json`, polls `/health`.

## Tasks

##### CREATE: src/lib/hetzner.ts, infra/scripts/provision.ts, infra/example-provision.request.json

**Acceptance:** Script runs with `--help` or errors clearly on missing token; imports resolve.

## Execution Log

| Task | Status | Timestamp | Files Touched | Notes |
|------|--------|-----------|---------------|-------|
| 1 | done | 2026-03-22 | hetzner.ts, provision.ts, example json | |

## Acceptance Criteria

- [x] Hetzner server create + wait IPv4 + user_data
- [x] Agents registry file updated
