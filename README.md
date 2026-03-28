# Mercury

Mercury is a consumer AI assistant platform. Users sign up, connect their AI provider keys, and get a persistent personal AI agent — accessible over WhatsApp, Slack, Discord, or Teams — that remembers context, runs tasks, and can execute extensions.

The platform is split into three packages in this monorepo.

---

## Packages

| Package | Role | Stack |
|---------|------|-------|
| `mercury-fork/` | Core agent runtime — chat adapters, Docker container runner, extensions, knowledge base | Bun, Hono, SQLite |
| `mercury-cloud-console/` | Control plane — user auth, provisioning, billing, admin management | Next.js 15, React 19, Drizzle ORM, SQLite |
| `mercury-node-agent/` | Compute node daemon — container lifecycle management (start/stop/restart/logs/images) on shared nodes | Bun, Hono |
| `mercury-assistant/` | Reference Mercury project (config only — not deployed by this repo) | `mercury.yaml` + `.env` |

Each package has its own `CLAUDE.md` with stack details and commands.

---

## Architecture

### Agent Runtime (`mercury-fork`)

Each user's agent is a long-running process built on `mercury-fork`. It:

- Connects to one or more chat adapters (WhatsApp via Baileys, Slack, Discord, Teams)
- Routes messages through a model chain (configurable per-user via BYOK provider keys)
- Persists a knowledge base and conversation context in SQLite
- Runs short-lived "pi session" containers for sandboxed task execution (Docker-in-Docker)
- Loads extensions (skills) from `.mercury/extensions/` — these are the user-facing capabilities

### Cloud Console (`mercury-cloud-console`)

The console is the SaaS control plane. It handles:

- **Auth**: Email/password sign-up, NextAuth sessions
- **Onboarding wizard**: Connect provider keys → configure model chain → select extensions → provision agent
- **BYOK vault**: User API keys (OpenAI, Anthropic, etc.) stored encrypted with AES-GCM
- **Provisioning**: Spins up agent instances (see Infrastructure below)
- **Billing**: Stripe subscriptions + usage tracking
- **Admin**: Node management, agent lifecycle (stop/restart/deprovision), rolling updates

### Infrastructure

**Current (VPS-per-user)**: Each agent runs on a dedicated Hetzner VPS provisioned via cloud-init. Slow (3-5 min) and expensive (~$4-6/mo per agent).

**Target (Multi-tenant containers)**: Each agent runs as a persistent Docker container on shared compute nodes managed by a lightweight node agent daemon. Sub-10s provisioning, ~$0.30-0.50/mo compute cost per agent. See [`docs/prd/multi-tenant-containers.md`](docs/prd/multi-tenant-containers.md).

### Routing & Networking (Target)

- Traefik reverse proxy on each compute node, auto-configured via Docker labels
- Each agent gets a subdomain: `{agentId}.mercury.app`
- Wildcard TLS via Let's Encrypt + Hetzner DNS

---

## Key Design Decisions

**BYOK (Bring Your Own Keys)**: Users supply their own AI provider API keys. Mercury never holds API keys as platform infrastructure — this keeps costs off the platform and gives users full control over model access.

**Multi-tenant containers over VPS**: Shared compute dramatically reduces cost and provisioning time. Agent isolation is enforced via Docker resource limits (`--memory`, `--cpus`, `--cap-drop=ALL`). See the [multi-tenant PRD](docs/prd/multi-tenant-containers.md) for tradeoffs.

**Docker-in-Docker for task execution**: The agent runtime spawns short-lived inner containers for sandboxed code execution. Agent containers need Docker socket access (`/var/run/docker.sock` mounted in).

**Persistent volumes per agent**: `-v mercury-{agentId}-data:/home/mercury/agent/.mercury` — preserves SQLite DB, WhatsApp auth session, spaces, and extensions across container restarts.

**No workspace links**: Each package manages its own `node_modules`. No cross-package imports.

---

## Running Locally

```bash
# Agent runtime
cd mercury-fork
bun install
bun run dev

# Cloud console
cd mercury-cloud-console
bun install
bun run dev        # http://localhost:3131
bun run db:push    # apply schema changes

# Node agent daemon
cd mercury-node-agent
bun install
bun run dev        # watches src/, requires NODE_AGENT_TOKEN + NODE_AGENT_PORT in .env
```

See each package's `CLAUDE.md` for full command reference.
