# PRD-03: Container Provisioner

**Status**: 🔲 Todo
**Depends on**: PRD-01 (schema), PRD-02 (node agent running)
**Files**: `mercury-cloud-console/src/lib/`

---

## Overview

Replace the VPS provisioner with a container-based one. Keep the same `AsyncGenerator<ProvisionProgress>` interface so the wizard and API routes don't need to change.

---

## Tasks

### Task 1: Node scheduler

##### CREATE: `mercury-cloud-console/src/lib/node-scheduler.ts`

```ts
export async function selectNode(): Promise<ComputeNode>
```

- Query `compute_nodes` where `status = "active"`
- Call `GET /health` on each node via `node-client.ts` (Task 2)
- Pick the node with the lowest `containerCount / maxAgents` ratio
- Fallback: round-robin if health calls fail

**Done when**: Returns a node when at least one active node is registered.

---

### Task 2: Node client

##### CREATE: `mercury-cloud-console/src/lib/node-client.ts`

Typed HTTP client wrapping the node agent API. All methods take a `ComputeNode` as first arg.

```ts
export const nodeClient = {
  getHealth(node): Promise<NodeHealth>
  startContainer(node, opts): Promise<{ containerId: string }>
  stopContainer(node, agentId): Promise<void>
  restartContainer(node, agentId): Promise<void>
  removeContainer(node, agentId): Promise<void>
  getContainerStatus(node, agentId): Promise<ContainerStatus>
  pullImage(node, image, tag): Promise<void>
  streamLogs(node, agentId, opts): AsyncIterable<string>
}
```

Auth: include `Authorization: Bearer {node.apiToken}` on every request.

**Done when**: Unit test can call `getHealth` against a mock server.

---

### Task 3: Env renderer update

##### MODIFY: `mercury-cloud-console/src/lib/env-renderer.ts`

Add a new export alongside the existing file-string renderer:

```ts
export function renderMercuryEnvRecord(
  keys: VaultKey[],
  config: AgentConfig,
): Record<string, string>
```

Same logic as the existing renderer, but returns a plain object instead of a file string. Used to inject env vars into the Docker container at start time.

**Done when**: Existing env file rendering still works; new function returns correct key-value pairs.

---

### Task 4: Container provisioner

##### CREATE: `mercury-cloud-console/src/lib/container-provisioner.ts`

```ts
export async function* provisionContainerAgent(
  agentId: string,
  userId: string,
  config: WizardState,
): AsyncGenerator<ProvisionProgress>
```

Flow:
1. `yield { step: "selecting-node", message: "Finding available node..." }`
2. Call `selectNode()` — yield error if none available
3. `yield { step: "building-env", message: "Preparing configuration..." }`
4. Decrypt vault keys, call `renderMercuryEnvRecord()`
5. `yield { step: "starting-container", message: "Starting agent..." }`
6. Call `nodeClient.startContainer()` with env vars + Traefik labels
7. Update `agents` table: set `nodeId`, `containerId`, `containerStatus = "running"`, `imageTag`, `healthUrl = https://{agentId}.mercury.app`
8. `yield { step: "waiting-health", message: "Waiting for agent to be ready..." }`
9. Poll `https://{agentId}.mercury.app/health` until 200 (timeout 30s)
10. `yield { step: "done", message: "Agent is live!" }`

**Done when**: End-to-end provision creates a running container and updates the DB.

---

### Task 5: Feature flag in provision routes

##### MODIFY: `mercury-cloud-console/src/app/api/user/provision/route.ts`
##### MODIFY: `mercury-cloud-console/src/app/api/admin/provision/route.ts`

```ts
const mode = process.env.PROVISIONER_MODE ?? "vps";
const result = mode === "container"
  ? provisionContainerAgent(...)
  : provisionAgent(...);
```

Default to `"vps"` so existing behavior is unchanged until a compute node is registered.

**Done when**: Setting `PROVISIONER_MODE=container` routes to the new provisioner; leaving it unset uses VPS provisioner.

---

## Acceptance Criteria

- [ ] `selectNode()` picks least-loaded node
- [ ] `nodeClient` methods all typed correctly, auth header sent
- [ ] `renderMercuryEnvRecord` returns correct env vars (spot-check against existing file renderer)
- [ ] Container provisioner creates container, updates DB, polls health
- [ ] Feature flag works: `vps` mode unchanged, `container` mode calls new provisioner
- [ ] `bun run typecheck` passes
