---
prd: "01"
title: "Project Scaffold"
phase: 1
depends_on: []
estimated_effort: "2 hours"
status: approved
---

# PRD-01: Project Scaffold

## Overview

Creates the `mercury-cloud-console` Bun/TypeScript package layout, scripts, and documentation so later PRDs can add catalog, infra templates, and CLIs.

## Tasks

### Task 1: Root package manifest

##### CREATE: mercury-cloud-console/package.json

- `name`: `mercury-cloud-console`
- `type`: `module`
- `private`: true
- Scripts: `typecheck` (tsc --noEmit), `provision` (bun run infra/scripts/provision.ts), `health-check` (bun run infra/scripts/health-check.ts)
- Dependencies: `yaml`, `zod` (for catalog/env validation)
- devDependencies: `@types/bun`, `typescript`

**Acceptance:** JSON is valid; `bun install` succeeds.

### Task 2: TypeScript config

##### CREATE: mercury-cloud-console/tsconfig.json

- `compilerOptions`: `strict`, `moduleResolution: "bundler"`, `module: "ESNext"`, `target: "ES2022"`, `noEmit: true`, `skipLibCheck: true`, `types: ["bun-types"]`

**Acceptance:** `bun run typecheck` exits 0 with empty `src`.

### Task 3: Environment template for operators

##### CREATE: mercury-cloud-console/.env.example

Document: `HETZNER_API_TOKEN`, `HETZNER_SSH_KEY_ID` (optional), `HETZNER_SERVER_TYPE` (default cx22), `HETZNER_IMAGE` (ubuntu-24.04), `HETZNER_LOCATION` (nbg1), `DNS_ZONE_ID` (optional Hetzner DNS), `BASE_DOMAIN`, `AGENTS_JSON_PATH` (path to provisioned agents list for health-check)

**Acceptance:** All keys have comments; no secrets committed.

### Task 4: README

##### CREATE: mercury-cloud-console/README.md

Sections: purpose, prerequisites (Bun, Hetzner token), link to `prds/master-plan.md`, Phase 1 commands (`bun run provision`, `bun run health-check`), security note on API secrets.

**Acceptance:** Renders in GitHub preview without broken links to repo-local paths.

### Task 5: Directory placeholders

##### CREATE: mercury-cloud-console/src/lib/.gitkeep

##### CREATE: mercury-cloud-console/src/catalog/.gitkeep

##### CREATE: mercury-cloud-console/infra/scripts/.gitkeep

**Acceptance:** Directories exist for PRD-02+.

## Execution Log

| Task | Status | Timestamp | Files Touched | Notes |
|------|--------|-----------|---------------|-------|
| 1-5 | done | 2026-03-22 | package.json, tsconfig, .env.example, README, .gitkeep | |

## Acceptance Criteria

- [x] `bun install` succeeds in `mercury-cloud-console/`
- [x] `bun run typecheck` succeeds
