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

1. Copy `.env.example` → `.env` and set `HETZNER_API_TOKEN`, `HETZNER_SSH_KEY_IDS` (numeric ID from Hetzner Console → Security → SSH Keys), `BASE_DOMAIN`, etc. Use `HETZNER_IMAGE=docker-ce` (Hetzner [Docker CE app](https://docs.hetzner.com/cloud/apps/list/docker-ce/)) so Docker is pre-installed. Use an SSH key **without a passphrase** for non-interactive `ssh root@<ip>`, or set `IdentityFile` in `~/.ssh/config`.
2. **Extensions:** Catalog entries install from `git:https://github.com/<MERCURY_EXTENSIONS_REPO>.git#examples/extensions/...`. The public `Michaelliv/mercury` repo may omit `examples/` on `main`; push your `mercury-fork` (with `examples/extensions`) to GitHub and set `MERCURY_EXTENSIONS_REPO=you/your-repo`, or add `"extensionsRepo": "you/your-repo"` to the request JSON. Otherwise keep `"extensionIds": []` for a working first boot.
3. Create a provision request JSON (see `infra/example-provision.request.json`).
4. Run:

```bash
bun run provision -- path/to/request.json
```

5. Poll agent health:

```bash
bun run health-check
```

Set `MERCURY_API_SECRET` on the agent `.env` so the control plane can call `/api/console/*` and the dashboard stays protected.

**Troubleshooting:** On the VPS, `tail -f /var/log/mercury-provision.log` (bootstrap steps) and `journalctl -u mercury-agent -f` (Mercury service). First boot can take 20+ minutes while `docker pull` runs. If you see `FATAL: bun install failed`, check `/var/log/mercury-provision.log` and `/var/log/cloud-init-output.log`. Cloud-init uses `/bin/sh` (dash): the bootstrap installs `unzip` and runs the Bun installer from a downloaded script (not `curl | bash`) so `BUN_INSTALL` is applied reliably.

## Phase 2 — Web console

```bash
bun run dev
```

Open http://localhost:3131 — sign in, manage agents (when DB is migrated).

## Security

- Never commit `.env`.
- Agent VPS must use strong `MERCURY_API_SECRET` for dashboard + console API.

## Methodology

Development follows `/plan` → `/prd` → `/execute` → `/retro`. See `.cursor/rules/cloud-console-workflow.mdc` and `.cursor/skills/prd-write/`.
