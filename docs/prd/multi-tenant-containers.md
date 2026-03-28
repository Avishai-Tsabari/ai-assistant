# PRD: Multi-Tenant Container Platform

## Problem

Mercury currently provisions one Hetzner VPS per user agent via cloud-init. This creates:

- **Slow onboarding**: 3-5 min provisioning time
- **High cost**: ~$4-6/mo per agent (dedicated VPS)
- **Operational overhead**: Rolling updates require coordinating across many independent VPS instances
- **Poor UX**: Users must provide a hostname; long wait during wizard

## Goal

Each user's agent runs as a persistent Docker container on shared compute nodes managed by the platform.

- Sub-10s provisioning
- ~$0.30-0.50/mo compute cost per agent
- One-command rolling updates across all agents
- Simplified onboarding: connect keys → live agent in seconds

## Non-Goals

- Multi-region support (Phase 1 is single node)
- Container migration between nodes (Phase 2)
- Custom domains per agent (subdomain per agentId is sufficient)

---

## Architecture

### Components

**`mercury-node-agent/`** — New lightweight HTTP daemon running on each compute node. The control plane sends commands; it executes Docker operations locally. Auth via bearer token (shared secret per node).

Key endpoints:
- `GET /health` — CPU, memory, disk, container count
- `POST /containers/start` — `docker run` with hardening flags
- `POST /containers/{agentId}/stop|restart`
- `DELETE /containers/{agentId}`
- `GET /containers/{agentId}/logs` — SSE log stream
- `POST /images/pull`

Container hardening: `--cap-drop=ALL --security-opt=no-new-privileges --memory={mb}m --restart=unless-stopped`

**Node scheduler** (`mercury-cloud-console/src/lib/node-scheduler.ts`) — Picks the least-loaded active node when provisioning. Falls back to round-robin if health data is unavailable.

**Container provisioner** (`mercury-cloud-console/src/lib/container-provisioner.ts`) — Replaces the VPS provisioner. Same `AsyncGenerator<ProvisionProgress>` interface. Flow: select node → build env from vault → start container → poll health → done.

**Traefik** — Runs on each compute node. Agent containers register themselves via Docker labels at start time; Traefik picks up routing automatically (no config reload). Wildcard TLS via Let's Encrypt + Hetzner DNS.

### Networking

- `*.mercury.app` A record → compute node IP
- Each agent: `{agentId}.mercury.app` → Traefik → container port 8787
- No host port mapping needed (Traefik routes on Docker network)

### Secrets

Secrets passed as Docker env vars at container start, decrypted from vault at provisioning time. No `.env` file written to disk on the compute node.

### Persistence

Named volume per agent: `-v mercury-{agentId}-data:/home/mercury/agent/.mercury`

Preserves: SQLite DB, WhatsApp Baileys auth session, spaces, extensions. Survives container restarts and image updates.

### Docker-in-Docker

Agent containers need Docker socket access to spawn pi session containers. Mount `/var/run/docker.sock` into agent container. Inner container names: `mercury-{MERCURY_AGENT_ID}-{timestamp}-{id}` to avoid collisions across agents on the same node.

---

## Migration Strategy

Feature flag `PROVISIONER_MODE=container|vps` (default: `vps` during migration). Existing VPS agents continue working. New signups go to containers once a compute node is registered.

---

## Console Changes

**Onboarding wizard**: Remove hostname input step (auto-generate agentId slug). Remove "several minutes" wait messaging. Wizard steps: Welcome → AddKeys → ModelChain → Extensions → Provision/Success.

**Agent lifecycle routes**:
- `POST /api/user/agents/{id}/stop|restart`
- `GET /api/user/agents/{id}/logs` (proxy SSE from node agent)
- `GET /api/user/agents/{id}/status`

**Admin node management**:
- `GET/POST /api/admin/nodes` — list/register compute nodes
- `DELETE /api/admin/nodes/{id}` — mark as draining
- `POST /api/admin/rolling-update` — pull image + restart agents sequentially with health checks

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Docker socket access (DinD security) | `--userns-remap` for user namespace isolation. Evaluate gVisor for Phase 2. |
| Noisy neighbor | `--memory` and `--cpus` limits per container enforced at start |
| Single point of failure | Phase 1 accepts this. Phase 2 adds second node. |
| Secret exposure via `docker inspect` | Acceptable for Phase 1 (node is trusted infra). Phase 2: evaluate Docker secrets. |
| WhatsApp session loss on restart | Persistent volume includes `whatsapp-auth/` directory |

---

## Phase 2 (after Phase 1 is stable)

- **Multi-node**: Add 2nd/3rd compute nodes, agent migration between nodes
- **Egress proxy pool**: `MERCURY_WEB_PROXY` env var on containers; web-scraping extensions route through proxy, LLM calls go direct
- **Lightweight orchestration**: Evaluate Nomad if manual node management becomes painful
