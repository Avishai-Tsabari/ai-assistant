# PRD-04: Reverse Proxy & Networking

**Status**: 🔲 Todo
**New dir**: `mercury-node-agent/traefik/`
**Infrastructure**: Configured on the compute node, not in code

---

## Overview

Traefik runs as a Docker container on each compute node. Agent containers register themselves via Docker labels at start — no config reload needed. Wildcard TLS via Let's Encrypt.

---

## Tasks

### Task 1: Traefik configuration

##### CREATE: `mercury-node-agent/traefik/traefik.yml`

```yaml
api:
  dashboard: false

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
  websecure:
    address: ":443"

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: mercury-net

certificatesResolvers:
  letsencrypt:
    acme:
      email: "${ACME_EMAIL}"
      storage: /letsencrypt/acme.json
      dnsChallenge:
        provider: hetzner
        resolvers:
          - "1.1.1.1:53"
```

**Done when**: File exists, valid YAML.

---

### Task 2: Docker Compose for node services

##### CREATE: `mercury-node-agent/docker-compose.yml`

```yaml
version: "3.9"

networks:
  mercury-net:
    external: false

services:
  traefik:
    image: traefik:v3
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik/traefik.yml:/traefik.yml:ro
      - letsencrypt:/letsencrypt
    environment:
      - HETZNER_API_KEY=${HETZNER_API_KEY}
      - ACME_EMAIL=${ACME_EMAIL}
    networks:
      - mercury-net

  node-agent:
    build: .
    restart: unless-stopped
    ports:
      - "9000:9000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - NODE_API_TOKEN=${NODE_API_TOKEN}
    networks:
      - mercury-net

volumes:
  letsencrypt:
```

**Done when**: `docker compose up` starts both services without errors.

---

### Task 3: Traefik labels in node agent

##### MODIFY: `mercury-node-agent/src/routes/containers.ts` (Task 3 from PRD-02)

When `POST /containers/start` is called, always apply these labels:

```ts
const labels = {
  "traefik.enable": "true",
  [`traefik.http.routers.${agentId}.rule`]: `Host(\`${agentId}.mercury.app\`)`,
  [`traefik.http.routers.${agentId}.tls`]: "true",
  [`traefik.http.routers.${agentId}.tls.certresolver`]: "letsencrypt",
  [`traefik.http.services.${agentId}.loadbalancer.server.port`]: "8787",
  "traefik.docker.network": "mercury-net",
  ...extraLabels,
};
```

**Done when**: Starting a container via the API results in Traefik picking up the route automatically (visible in `docker logs traefik`).

---

### Task 4: DNS setup doc

##### CREATE: `mercury-node-agent/docs/dns-setup.md`

Document:
- Add `*.mercury.app` A record → compute node IP in Hetzner DNS
- Required env vars: `HETZNER_API_KEY`, `ACME_EMAIL`, `NODE_API_TOKEN`
- How to verify TLS is working: `curl https://{any-agentId}.mercury.app/health`

**Done when**: Doc exists, accurate.

---

### Task 5: Update URL generation in container provisioner

##### MODIFY: `mercury-cloud-console/src/lib/container-provisioner.ts`

Set on the agent record after container start:
```ts
healthUrl: `https://${agentId}.mercury.app`,
dashboardUrl: `https://${agentId}.mercury.app/dashboard`,
```

**Done when**: Provisioned agent record has correct URLs.

---

## Acceptance Criteria

- [ ] Traefik starts via `docker compose up` on a compute node
- [ ] Agent container started by node-agent gets Traefik labels applied
- [ ] Traefik auto-discovers the container route without restart
- [ ] TLS cert issued for `{agentId}.mercury.app` (first request may be slow; subsequent fast)
- [ ] HTTP → HTTPS redirect works
- [ ] DNS setup doc is accurate
