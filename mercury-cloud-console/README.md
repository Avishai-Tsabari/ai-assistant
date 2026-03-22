# Mercury Cloud Console

Control plane and provisioning tooling for multi-tenant Mercury agents (VPS per user). See the [master plan](./prds/master-plan.md).

## Prerequisites

- [Bun](https://bun.sh) 1.1+
- Hetzner Cloud API token for Phase 1 provisioning
- `better-sqlite3` requires a build toolchain on some platforms (use WSL on Windows if `bun install` fails)

## Install

```bash
cd mercury-cloud-console
bun install
```

## Phase 1 — Provision an agent VPS

1. Copy `.env.example` → `.env` and set `HETZNER_API_TOKEN`, `BASE_DOMAIN`, etc.
2. Create a provision request JSON (see `infra/example-provision.request.json`).
3. Run:

```bash
bun run provision -- path/to/request.json
```

4. Poll agent health:

```bash
bun run health-check
```

Set `MERCURY_API_SECRET` on the agent `.env` so the control plane can call `/api/console/*` and the dashboard stays protected.

## Phase 2 — Web console

```bash
bun run dev
```

Open http://localhost:3000 — sign in, manage agents (when DB is migrated).

## Security

- Never commit `.env`.
- Agent VPS must use strong `MERCURY_API_SECRET` for dashboard + console API.

## Methodology

Development follows `/plan` → `/prd` → `/execute` → `/retro`. See `.cursor/rules/cloud-console-workflow.mdc` and `.cursor/skills/prd-write/`.
