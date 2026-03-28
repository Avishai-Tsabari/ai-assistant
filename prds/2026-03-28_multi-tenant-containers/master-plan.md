# Master Plan: Multi-Tenant Container Platform

**Status**: In Progress
**Started**: 2026-03-28
**Goal**: Replace VPS-per-user with Docker containers on shared compute nodes.

## Why

| Problem | Impact |
|---------|--------|
| 3-5 min provisioning via cloud-init | Bad onboarding UX |
| ~$4-6/mo per agent (dedicated VPS) | Unsustainable at scale |
| Rolling updates require coordinating N VPS instances | Operational pain |

**Target**: Sub-10s provisioning, ~$0.30-0.50/mo per agent, one-command rolling updates.

---

## PRDs

| # | File | Scope | Status | Blocks |
|---|------|-------|--------|--------|
| 01 | [prd-01_schema.md](prd-01_schema.md) | DB schema: compute_nodes, agents extension, container_events | 🔲 Todo | Everything |
| 02 | [prd-02_node-agent.md](prd-02_node-agent.md) | New `mercury-node-agent/` daemon package | 🔲 Todo | 03, 06 |
| 03 | [prd-03_container-provisioner.md](prd-03_container-provisioner.md) | Replace VPS provisioner with container provisioner | 🔲 Todo | 05 |
| 04 | [prd-04_traefik-networking.md](prd-04_traefik-networking.md) | Traefik reverse proxy + wildcard TLS + DNS | 🔲 Todo | 03 |
| 05 | [prd-05_console-adaptation.md](prd-05_console-adaptation.md) | Wizard simplification, lifecycle routes, admin UI | 🔲 Todo | — |
| 06 | [prd-06_node-bootstrap.md](prd-06_node-bootstrap.md) | Setup script + docker-compose for compute nodes | 🔲 Todo | 02, 04 |
| 07 | [prd-07_fork-changes.md](prd-07_fork-changes.md) | Mercury fork: graceful shutdown, version, DinD, naming | 🔲 Todo | — (parallel) |

## Critical Path

```
PRD-01 (Schema)
    └──► PRD-03 (Provisioner) ──► PRD-05 (Console)
PRD-02 (Node Agent) ─────────┘
PRD-04 (Traefik) ────────────┘
PRD-06 (Bootstrap) requires PRD-02 + PRD-04
PRD-07 (Fork) — independent, run any time
```

## Phase 2: Future Features (post Phase 1 stable)

### User DB Encryption at Rest

Each user's agent has a SQLite DB in a named Docker volume (`mercury-{agentId}-data`). Currently plaintext — anyone with server access can read it via the volume path.

**Options considered:**

| Option | Approach | Trade-off |
|--------|----------|-----------|
| SQLCipher | Full DB encryption with per-user key injected via env var | True zero-knowledge; Bun's SQLite doesn't support SQLCipher natively — requires native module swap; lost password = unrecoverable data |
| Field-level encryption | Encrypt message content columns with per-user key before write | Easier with current stack; metadata (timestamps, space names) still visible |
| Do nothing | Privacy policy covers it | Acceptable for MVP; most SaaS at this stage don't offer this |

**Recommendation**: Field-level encryption (Option 2) as a Phase 2 feature. Full SQLCipher (Option 1) is a significant lift and creates a UX problem (no password recovery path).

**Prerequisite**: User-facing key management UI — user sets a passphrase, key derived and injected as `MERCURY_DB_KEY` env var at container start, never stored by the platform.

---

## Status Legend
- 🔲 Todo
- 🔄 In Progress
- ✅ Done
- ⛔ Blocked
