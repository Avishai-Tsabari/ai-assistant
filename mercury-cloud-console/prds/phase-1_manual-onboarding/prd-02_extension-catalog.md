---
prd: "02"
title: "Extension Catalog"
phase: 1
depends_on: ["01"]
estimated_effort: "3 hours"
status: approved
---

# PRD-02: Extension Catalog

## Overview

Defines billable/catalog extensions with install sources and loads them with Zod validation for use by provisioning and (later) the web UI.

## Tasks

### Task 1: YAML catalog

##### CREATE: mercury-cloud-console/src/catalog/extensions.yaml

At least 5 entries aligned with mercury-fork `examples/extensions`: napkin, pdf, charts, voice-transcribe, web-browser (pinchtab path in examples - check). List mercury-assistant has napkin, tradestation, web-browser under .mercury/extensions.

Use fields: `id`, `display_name`, `description`, `install` (`type: npm|git|path`, `value`), `monthly_price_usd`, `required_env` (string array), `model_capabilities` (optional string array).

**Acceptance:** 5+ entries; YAML parses.

### Task 2: Loader

##### CREATE: mercury-cloud-console/src/lib/catalog.ts

- Zod schema for entries
- `loadCatalog(): Catalog` reading YAML from `src/catalog/extensions.yaml` via `import.meta.dir` or path relative to file
- Export `getExtensionById(id: string)`

**Acceptance:** `bun -e "import { loadCatalog } from './src/lib/catalog.ts'; console.log(loadCatalog().extensions.length)"` prints >= 5

## Execution Log

| Task | Status | Timestamp | Files Touched | Notes |
|------|--------|-----------|---------------|-------|
| 1-2 | done | 2026-03-22 | extensions.yaml, catalog.ts | |

## Acceptance Criteria

- [x] Catalog loads with no errors
- [x] At least 5 extensions defined
