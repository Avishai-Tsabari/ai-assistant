# PRD-05: Console Adaptation

**Status**: 🔲 Todo
**Depends on**: PRD-03 (provisioner)
**Files**: `mercury-cloud-console/src/`

---

## Overview

Three areas: simplify the onboarding wizard, add agent lifecycle API routes, add admin node management UI.

---

## Tasks

### Task 1: Simplify onboarding wizard

Remove hostname input (auto-generate agentId). Update wait messaging. Wizard steps become:
**Welcome → AddKeys → ModelChain → Extensions → Provision/Success**

##### MODIFY: `mercury-cloud-console/src/lib/wizard-types.ts`

Remove `hostname` field from `WizardState` if present.

##### MODIFY: `mercury-cloud-console/src/app/(protected)/wizard/steps/AgentConfig.tsx`

Remove the hostname input field. If this step only had the hostname field, remove the step entirely and adjust step numbering.

##### MODIFY: `mercury-cloud-console/src/app/(protected)/wizard/steps/Provision.tsx`

- Replace "This will take a few minutes" → "Your agent will be ready in seconds"
- Remove any countdown / long-wait UX

##### MODIFY: `mercury-cloud-console/src/app/(protected)/wizard/WizardClient.tsx`

Adjust step count and navigation if AgentConfig step was removed.

**Done when**: Wizard flows from keys → model chain → extensions → provision without hostname input.

---

### Task 2: Agent stop endpoint

##### CREATE: `mercury-cloud-console/src/app/api/user/agents/[id]/stop/route.ts`

```ts
POST /api/user/agents/{id}/stop
```

- Assert user owns agent
- Look up agent's `nodeId` → get compute node from DB
- Call `nodeClient.stopContainer(node, agentId)`
- Update `agents.containerStatus = "stopped"`
- Return `{ success: true }`

**Done when**: Calling the endpoint stops the container and updates DB.

---

### Task 3: Agent restart endpoint

##### CREATE: `mercury-cloud-console/src/app/api/user/agents/[id]/restart/route.ts`

```ts
POST /api/user/agents/{id}/restart
```

- Same auth pattern as stop
- Call `nodeClient.restartContainer(node, agentId)`
- Update `agents.containerStatus = "running"`

**Done when**: Calling the endpoint restarts the container.

---

### Task 4: Agent status endpoint

##### CREATE: `mercury-cloud-console/src/app/api/user/agents/[id]/status/route.ts`

```ts
GET /api/user/agents/{id}/status
```

- Call `nodeClient.getContainerStatus(node, agentId)`
- Return status + uptime

**Done when**: Returns live container status.

---

### Task 5: Agent log streaming endpoint

##### CREATE: `mercury-cloud-console/src/app/api/user/agents/[id]/logs/route.ts`

```ts
GET /api/user/agents/{id}/logs?tail=100&follow=true
```

- Proxy the SSE stream from node agent's log endpoint to the browser
- Auth: user must own the agent

**Done when**: Browser EventSource receives log lines from the agent container.

---

### Task 6: Admin node management API

##### CREATE: `mercury-cloud-console/src/app/api/admin/nodes/route.ts`

```ts
GET  /api/admin/nodes       → list all compute_nodes with health data
POST /api/admin/nodes       → register new node { label, host, apiUrl, apiToken, maxAgents }
```

##### CREATE: `mercury-cloud-console/src/app/api/admin/nodes/[id]/route.ts`

```ts
DELETE /api/admin/nodes/{id} → set status = "draining"
```

**Done when**: Admin can register a node and see it in the list.

---

### Task 7: Admin node management UI page

##### CREATE: `mercury-cloud-console/src/app/(admin)/admin/nodes/page.tsx`

Table of compute nodes showing: label, host, status, containerCount, health metrics. Buttons: Register Node (modal form), Drain.

**Done when**: Page renders, lists nodes from the API.

---

### Task 8: Rolling update endpoint

##### CREATE: `mercury-cloud-console/src/app/api/admin/rolling-update/route.ts`

```ts
POST /api/admin/rolling-update  body: { imageTag: string }
```

SSE response. For each active node:
1. `nodeClient.pullImage(node, "mercury-agent", imageTag)`
2. For each running agent on that node: `restartContainer()`, wait for `/health` to return 200, then proceed to next

Yield progress events: `{ node, agentId, status }` per step.

**Done when**: Calling with a valid image tag restarts all agents sequentially without downtime.

---

### Task 9: Dashboard agent card updates

##### MODIFY: `mercury-cloud-console/src/app/(protected)/dashboard/page.tsx`
##### MODIFY: `mercury-cloud-console/src/app/(protected)/dashboard/AgentCard.tsx`

Show `containerStatus` badge (running / stopped / failed). Add Stop and Restart buttons that call the endpoints from Tasks 2-3.

**Done when**: Dashboard shows live status, buttons work.

---

### Task 10: Update deprovision route

##### MODIFY: `mercury-cloud-console/src/app/api/admin/agents/[id]/deprovision/route.ts`

After marking agent as deprovisioned in DB, also call `nodeClient.removeContainer(node, agentId)` if `nodeId` is set.

**Done when**: Deprovisioning a container agent removes the Docker container from the node.

---

## Acceptance Criteria

- [ ] Wizard flows without hostname input
- [ ] Stop/restart/status/logs routes work and enforce user ownership
- [ ] Admin can register, list, and drain nodes
- [ ] Rolling update cycles through all agents on all nodes
- [ ] Dashboard shows container status with stop/restart controls
- [ ] Deprovision removes container from node
- [ ] `bun run typecheck` passes
