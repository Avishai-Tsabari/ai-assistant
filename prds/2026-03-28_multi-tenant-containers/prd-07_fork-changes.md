# PRD-07: Mercury Fork Changes

**Status**: 🔲 Todo
**Independent** — can run in parallel with all other PRDs
**Files**: `mercury-fork/src/`

---

## Overview

Small hardening changes to the agent runtime to work correctly inside Docker containers managed by the node agent.

---

## Tasks

### Task 1: Verify graceful shutdown

##### READ: `mercury-fork/src/core/runtime.ts`

Confirm that `process.on("SIGTERM", ...)` handler:
- Stops accepting new messages
- Waits for in-progress tasks to complete (or times out gracefully)
- Calls `process.exit(0)`

`docker stop` sends SIGTERM then SIGKILL after 10s. The agent must exit cleanly within that window so no orphaned inner containers are left running.

If the handler is missing or incomplete, add it.

**Done when**: `docker stop mercury-{agentId}` results in clean exit with no orphaned containers.

---

### Task 2: Add version to /health endpoint

##### MODIFY: `mercury-fork/src/server.ts`

In the `/health` route handler, add `version` to the response:

```ts
version: process.env.MERCURY_VERSION ?? packageJson.version,
```

Import `version` from `package.json` (Bun supports JSON imports natively).

This lets the control plane know which image version each agent is running.

**Done when**: `GET /health` returns `{ ..., version: "0.x.x" }`.

---

### Task 3: Inner container name isolation

##### MODIFY: `mercury-fork/src/agent/container-runner.ts` (around line 203-206)

Current naming:
```ts
const containerName = `mercury-${timestamp}-${id}`;
```

New naming — prefix with the agent's own ID so inner containers from different agents on the same Docker host don't collide:

```ts
const agentId = process.env.MERCURY_AGENT_ID ?? "local";
const containerName = `mercury-${agentId}-${timestamp}-${id}`;
```

The node agent injects `MERCURY_AGENT_ID` as an env var when starting the container.

**Done when**: Inner containers on a shared node include the agent ID in their name.

---

### Task 4: Docker-in-Docker smoke test

Manual verification (document result here after testing):

1. Start an agent container with Docker socket mounted: `-v /var/run/docker.sock:/var/run/docker.sock`
2. With all hardening flags applied: `--cap-drop=ALL --security-opt=no-new-privileges`
3. Ask the agent to run a task that spawns an inner pi container
4. Verify the inner container starts and completes successfully
5. Verify the inner container is cleaned up after the task

**Done when**: DinD works with hardening flags. Document any required flag adjustments.

---

## Acceptance Criteria

- [ ] `docker stop` exits agent cleanly within 10s (no SIGKILL needed)
- [ ] `/health` returns `version` field
- [ ] Inner container names include `MERCURY_AGENT_ID` prefix
- [ ] DinD verified working with container hardening flags
- [ ] `bun run check` passes in mercury-fork
