# PRD-20 — Container Provisioning Architecture & Compute Tiers

**Phase:** 5 — Compute Tiers
**Status:** implementing
**Scope:** mercury-cloud-console

---

## Background

Mercury moved from a VPS-per-user model to a multi-tenant container architecture in Phase 4.
The provisioning flow (wizard → node agent → Docker → Traefik) was never formally documented,
and users have no ability to choose compute resources — every agent silently gets the same
fixed 512 MB / 0.5 CPU slice regardless of their needs.

This PRD covers:
1. A written specification of the container provisioning architecture (developer reference)
2. A user-selectable compute tier system (Starter / Standard / Pro) that maps to real Docker resource limits

---

## Provisioning Architecture

### Overview

When a user completes the wizard and clicks "Launch", the following sequence runs:

```
Browser (wizard)
  └─ POST /api/user/provision
       └─ selectNode()                     # pick least-loaded compute node
       └─ renderMercuryEnvRecord()          # build container env vars
       └─ NodeClient.startContainer()       # call node agent HTTP API
            └─ node agent: docker run ...   # spawn container with Traefik labels
       └─ waitForHealth()                   # poll https://{agentId}.mercury.app/health
       └─ SSE: progress events → done
  └─ Wizard advances to Success screen
```

### Step-by-step

**1. Node selection** (`src/lib/node-scheduler.ts`)

The console queries the `computeNodes` table for all `active` nodes, counts running agents
per node, and returns the node with the lowest count that is below its `maxAgents` limit.
This is a simple least-loaded strategy — no affinity or geography awareness yet.

**2. Environment assembly** (`src/lib/env-renderer.ts`)

`renderMercuryEnvRecord()` produces a flat `Record<string, string>` containing:
- `MERCURY_ANTHROPIC_API_KEY` (or equivalent per provider) — decrypted from vault
- `MERCURY_MODEL_CHAIN` — JSON array of `{ provider, model }` legs
- `MERCURY_API_SECRET` — random 24-byte hex, stored encrypted in the DB
- `MERCURY_AGENT_ID` — UUID that namespaces the agent's data volume
- `MERCURY_AGENT_IMAGE` — image reference (see below)
- Any `optionalEnv` entries passed from the wizard

No `mercury.yaml` file is injected — the container image ships a default config.

**3. Container start** (`src/lib/node-client.ts` → node agent)

The console POSTs to `https://{node.apiUrl}/containers/start` with:
```json
{
  "agentId": "<uuid>",
  "image": "ghcr.io/avishai-tsabari/mercury-agent:latest",
  "env": { "MERCURY_...": "..." },
  "memoryMb": 512,
  "cpus": "0.5"
}
```

The node agent (`mercury-node-agent`) translates this to a `docker run` command with:
- `--memory=512m --cpus=0.5` — resource limits (from tier, see below)
- `--cap-drop=ALL --security-opt=no-new-privileges` — security hardening
- `-v mercury-{agentId}-data:/home/mercury/agent/.mercury` — persistent state volume
- `-v /var/run/docker.sock:/var/run/docker.sock` — Docker-in-Docker for extension containers
- `--restart=unless-stopped` — auto-restart on crash
- `--log-opt max-size=20m --log-opt max-file=3` — log rotation
- Traefik labels:
  ```
  traefik.enable=true
  traefik.http.routers.{agentId}.rule=Host(`{agentId}.mercury.app`)
  traefik.http.routers.{agentId}.tls.certresolver=letsencrypt
  traefik.http.services.{agentId}.loadbalancer.server.port=8787
  ```

Traefik picks up these labels automatically and issues a Let's Encrypt certificate.
No host port mapping is needed — all routing is done through the Traefik reverse proxy
on the shared node.

**4. Database record** (`src/lib/container-provisioner.ts`)

After the container starts, the console inserts rows into:
- `agents` — agentId, nodeId, containerId, imageTag, dashboardUrl, healthUrl, apiSecretCipher, modelChainConfig, tier
- `providerKeys` — encrypted API key per model chain leg
- `containerEvents` — audit event: "started"

**5. Health check**

The console polls `https://{agentId}.mercury.app/health` every 2 seconds (up to 30 attempts).
The Mercury agent returns `{ "status": "ok" }` once it has initialized.
Typical time: 2–10 seconds.

**6. SSE response**

Throughout the process, the console streams SSE events to the browser:
- `event: progress` — human-readable log lines displayed in the wizard
- `event: done` — includes `{ agentId, ipv4, dashboardUrl, status }`
- `event: error` — terminates the stream on failure

### Docker image

Source: `ghcr.io/avishai-tsabari/mercury-agent:latest`
Override: `MERCURY_AGENT_IMAGE` environment variable on the console
Pull: Images are cached on each compute node's Docker daemon. The node agent exposes
`POST /images/pull` for explicit pre-pulls.

### Compute nodes

Nodes are registered in the `computeNodes` table by an admin. Each node runs:
- The `mercury-node-agent` daemon (port 9090, Bearer token auth)
- Traefik as a reverse proxy (ports 80/443)
- A shared Docker network `mercury-net`

Current production node: CX33 (4 vCPU, 8 GB RAM, Hetzner) — `hetzner-the-first`

---

## Compute Tiers

### Problem

All agents currently receive identical resources (512 MB / 0.5 CPU) regardless of workload.
A user running Mercury in a group chat with 10 members and 5 extensions has very different
needs from someone trying it solo for the first time.

### Solution

Introduce three named tiers that map directly to Docker resource limits passed to the node agent.

### Tier definitions

| Tier     | RAM     | CPU  | Use case                                              |
|----------|---------|------|-------------------------------------------------------|
| Starter  | 256 MB  | 0.25 | Evaluating Mercury — light personal use, try-before-buy |
| Standard | 512 MB  | 0.5  | Everyday personal AI assistant (default)              |
| Pro      | 1024 MB | 1.0  | Developers, group chats, many extensions, heavy tools |

**Starter** is aimed at new users exploring Mercury's capabilities before committing.
It is intentionally constrained — sufficient for single-user chat, not suitable for
running many extensions simultaneously.

**Standard** is the baseline for regular personal use. Covers typical single-user workloads
with 2–3 extensions.

**Pro** is for power users: software developers using Mercury as a coding assistant, anyone
running Mercury in a multi-user group chat, or users who rely on extension-heavy workflows
(e.g., web search + code execution + knowledge base distillation simultaneously).

### Wizard UX

A new **Plan** step is inserted between Extensions and Provision in the 7-step wizard:

```
Welcome → Add Keys → Model Chain → Extensions → Plan → Provision → Done
```

The Plan step shows three cards, one per tier, with:
- Tier name and tagline
- Resource specs (RAM / CPU)
- One-sentence use case description

The selected tier is stored in wizard state and passed to `POST /api/user/provision`.

### Billing integration (future)

Tiers are implemented independently of Stripe in this PRD. Tier selection is unrestricted —
any user can pick any tier. Stripe price IDs per tier are documented in `.env.example` for
future enforcement:

- `STRIPE_PRICE_ID_STARTER`
- `STRIPE_PRICE_ID_STANDARD`
- `STRIPE_PRICE_ID_PRO`

---

## Implementation

### Files changed

| File | Change |
|------|--------|
| `src/lib/tiers.ts` | New — `AgentTier` type + `TIER_RESOURCES` + `TIER_LABELS` |
| `src/lib/db/schema.ts` | Add `tier` column to `agents` table |
| `src/lib/provisioner.ts` | Add `tier` to `ProvisionRequest` type |
| `src/lib/wizard-types.ts` | Add `tier: AgentTier` to `WizardState` |
| `src/app/(protected)/wizard/steps/PlanTier.tsx` | New — tier selector step |
| `src/app/(protected)/wizard/WizardClient.tsx` | Insert PlanTier step, add `SET_TIER` action |
| `src/app/(protected)/wizard/steps/Provision.tsx` | Pass `tier` in fetch body |
| `src/app/api/user/provision/route.ts` | Accept `tier` in Zod schema, pass to provisioner |
| `src/lib/container-provisioner.ts` | Map tier → `memoryMb`/`cpus`, store in DB |
| `.env.example` | Document `STRIPE_PRICE_ID_*` vars |

### Out of scope

- Tier enforcement via Stripe subscription (gate Starter/Pro behind paid plans)
- Upgrade / downgrade flow (restart container with new resource limits)
- Per-tier agent count limits (e.g. Starter = 1 agent max)
- Metered billing per token / request
- Node auto-scaling when capacity is exhausted

---

## Verification

```bash
cd mercury-cloud-console
bun run typecheck    # must pass with zero errors
bun run db:push      # apply tier column migration
```

Manual end-to-end:
1. Run `bun run dev`, sign in, open the wizard
2. Step through to the new Plan step — confirm all three tier cards render
3. Select Pro, complete provisioning
4. On the compute node, run `docker inspect mercury-agent-<agentId>` and verify
   `--memory=1024m` and `--cpus=1.0` in the container config
