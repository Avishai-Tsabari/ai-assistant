# PRD-06: Compute Node Bootstrap

**Status**: 🔲 Todo
**Depends on**: PRD-02 (node agent), PRD-04 (Traefik)
**New dir**: `mercury-node-agent/scripts/`

---

## Overview

One-command setup for a new Hetzner dedicated server: install Docker, start Traefik + node agent, register the node in the console.

---

## Tasks

### Task 1: Node setup script

##### CREATE: `mercury-node-agent/scripts/setup-node.sh`

```bash
#!/bin/bash
set -e

# 1. Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker

# 2. Install Bun
curl -fsSL https://bun.sh/install | bash

# 3. Clone node-agent repo (or copy if deploying from tarball)
# git clone ... /opt/mercury-node-agent

# 4. Create .env from prompts
# NODE_API_TOKEN, HETZNER_API_KEY, ACME_EMAIL

# 5. Start services
cd /opt/mercury-node-agent
docker compose up -d

# 6. Print registration curl command
echo "Register this node in the console:"
echo "curl -X POST https://console.mercury.app/api/admin/nodes \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"label\": \"node-01\", \"apiUrl\": \"http://$PUBLIC_IP:9000\", ...}'"
```

**Done when**: Script runs end-to-end on a fresh Debian/Ubuntu server.

---

### Task 2: Systemd service for node agent (alternative to Docker Compose)

##### CREATE: `mercury-node-agent/scripts/mercury-node-agent.service`

```ini
[Unit]
Description=Mercury Node Agent
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/opt/mercury-node-agent
ExecStart=/root/.bun/bin/bun run src/index.ts
Restart=always
EnvironmentFile=/opt/mercury-node-agent/.env

[Install]
WantedBy=multi-user.target
```

**Done when**: `systemctl enable mercury-node-agent` starts the daemon on boot.

---

### Task 3: Registration flow documentation

##### CREATE: `mercury-node-agent/docs/setup.md`

Step-by-step:
1. Provision a Hetzner server (recommended: AX41 or similar, 64GB RAM, runs ~100 agents)
2. Run `setup-node.sh`
3. Point `*.mercury.app` DNS A record to server IP
4. Register node via admin console: Settings → Nodes → Register
5. Set `PROVISIONER_MODE=container` in console `.env`
6. Verify: provision a test agent, check it comes up at `{agentId}.mercury.app`

**Done when**: Doc is accurate against actual setup experience.

---

## Acceptance Criteria

- [ ] Setup script installs Docker + Bun + starts services on a fresh server
- [ ] Traefik and node-agent both running after script completes
- [ ] Setup doc matches actual steps required
- [ ] Node agent accessible on port 9000 with bearer token auth
