---
prd: "03"
title: "Cloud-init bootstrap"
phase: 1
depends_on: ["01"]
estimated_effort: "4 hours"
status: approved
---

# PRD-03: Cloud-init Template

## Overview

Programmatic `#cloud-config` generation installs Docker, Bun, global `mercury-ai`, runs `mercury init`, installs extensions, and starts a systemd `mercury-agent` unit.

## Tasks

##### CREATE: src/lib/cloud-init.ts — implemented (`buildCloudInitUserData`, `DEFAULT_MERCURY_YAML`, `toB64`).

**Acceptance:** Exported function returns string starting with `#cloud-config`.

## Execution Log

| Task | Status | Timestamp | Files Touched | Notes |
|------|--------|-----------|---------------|-------|
| 1 | done | 2026-03-22 | src/lib/cloud-init.ts | |

## Acceptance Criteria

- [x] Valid cloud-config with `runcmd` multiline bootstrap
- [x] Extension specs passed safely (base64 list + loop)
