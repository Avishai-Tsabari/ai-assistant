# PRD-02: Node Agent Daemon

**Status**: 🔲 Todo
**New package**: `mercury-node-agent/` (Bun + Hono, same stack as mercury-fork)
**Blocks**: PRD-03, PRD-06

---

## Overview

A lightweight HTTP daemon that runs on each compute node. The cloud console sends commands to it; it executes Docker operations locally. One daemon per physical node.

---

## Tasks

### Task 1: Scaffold the package

##### CREATE: `mercury-node-agent/package.json`

```json
{
  "name": "mercury-node-agent",
  "version": "0.1.0",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "check": "bun run typecheck && bun run lint",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src"
  }
}
```

Also create `tsconfig.json`, `biome.json` (copy from mercury-fork), `src/index.ts` entry point.

Auth: every request must include `Authorization: Bearer {NODE_API_TOKEN}`. Token read from env.

**Done when**: `bun run dev` starts without errors on port 9000.

---

### Task 2: Health endpoint

##### CREATE: `mercury-node-agent/src/routes/health.ts`

`GET /health` response:

```ts
{
  status: "ok",
  hostname: string,
  cpuPercent: number,
  memoryUsedMb: number,
  memoryTotalMb: number,
  diskUsedPercent: number,
  containerCount: number,
  version: string,
}
```

Use `os` module for memory. Use `df` shell command for disk. Use `docker ps -q | wc -l` for container count.

**Done when**: `curl http://localhost:9000/health` returns valid JSON.

---

### Task 3: Container lifecycle endpoints

##### CREATE: `mercury-node-agent/src/routes/containers.ts`

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/containers/start` | `docker run -d` with hardening flags |
| `POST` | `/containers/:agentId/stop` | `docker stop` |
| `POST` | `/containers/:agentId/restart` | `docker restart` |
| `DELETE` | `/containers/:agentId` | `docker rm -f` |
| `GET` | `/containers/:agentId/status` | `docker inspect` summary |

`POST /containers/start` body:
```ts
{
  agentId: string;
  image: string;
  env: Record<string, string>;
  memoryMb: number;
  cpuShares: number;
  labels?: Record<string, string>;
}
```

Docker run flags:
```
--name mercury-{agentId}
--cap-drop=ALL
--security-opt=no-new-privileges
--memory={memoryMb}m
--cpu-shares={cpuShares}
--restart=unless-stopped
-v mercury-{agentId}-data:/home/mercury/agent/.mercury
-v /var/run/docker.sock:/var/run/docker.sock
-e KEY=VALUE ...
{traefik labels}
```

**Critical**: Mount `/var/run/docker.sock` so agents can spawn inner pi containers.
**Critical**: Mount named volume for persistence across restarts.

**Done when**: Can start, stop, restart, remove a test container via API.

---

### Task 4: Log streaming endpoint

##### CREATE: `mercury-node-agent/src/routes/logs.ts`

`GET /containers/:agentId/logs?follow=true&tail=100`

- Response: SSE stream (`text/event-stream`)
- Command: `docker logs --follow --tail={tail} mercury-{agentId}`
- Send each line as `data: {line}\n\n`
- Close stream when Docker process exits

**Done when**: `curl` with SSE shows live log output from a running container.

---

### Task 5: Image management endpoints

##### CREATE: `mercury-node-agent/src/routes/images.ts`

- `POST /images/pull` — `{ image, tag }` → `docker pull {image}:{tag}`, stream progress as SSE
- `GET /images` — list mercury agent images: `docker images mercury-agent --format json`

**Done when**: Can pull an image via API and see it in the list.

---

## Acceptance Criteria

- [ ] All endpoints return correct responses
- [ ] Bearer token auth rejects requests without valid token (401)
- [ ] `docker run` uses all hardening flags
- [ ] Docker socket and data volume mounted correctly in started containers
- [ ] Traefik labels applied when `labels` provided in start request
- [ ] Log stream closes cleanly when container stops
- [ ] `bun run check` passes (typecheck + lint)
