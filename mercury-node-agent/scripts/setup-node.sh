#!/usr/bin/env bash
# Mercury Compute Node — One-time setup script
#
# Run on a fresh Ubuntu 22.04+ server to bootstrap a compute node.
# After running, register the node in the Mercury Cloud Console via
# POST /api/admin/nodes.
#
# Usage:
#   export NODE_AGENT_TOKEN="your-secret-token"
#   export NODE_AGENT_BASE_DOMAIN="mercury.app"
#   export ACME_EMAIL="admin@example.com"
#   export HETZNER_DNS_API_TOKEN="your-hetzner-dns-token"
#   bash setup-node.sh

set -euo pipefail

echo "=== Mercury Compute Node Setup ==="

# ─── 1. Install Docker ──────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "Docker already installed."
fi

# ─── 2. Install Bun ─────────────────────────────────────────────────────
if ! command -v bun &>/dev/null; then
  echo "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
else
  echo "Bun already installed."
fi

# ─── 3. Clone and install node agent ────────────────────────────────────
NODE_AGENT_DIR="/opt/mercury-node-agent"
if [ ! -d "$NODE_AGENT_DIR" ]; then
  echo "Setting up node agent at $NODE_AGENT_DIR..."
  mkdir -p "$NODE_AGENT_DIR"
  # Copy files (in production, this would be a git clone or Docker image)
  cp -r "$(dirname "$0")/.." "$NODE_AGENT_DIR/"
  cd "$NODE_AGENT_DIR"
  bun install --production
else
  echo "Node agent already installed at $NODE_AGENT_DIR."
fi

# ─── 4. Create Docker network ───────────────────────────────────────────
if ! docker network inspect mercury-net &>/dev/null; then
  echo "Creating mercury-net Docker network..."
  docker network create mercury-net
else
  echo "mercury-net network already exists."
fi

# ─── 5. Write .env for Docker Compose ───────────────────────────────────
ENV_FILE="$NODE_AGENT_DIR/.env"
cat > "$ENV_FILE" <<EOF
NODE_AGENT_TOKEN=${NODE_AGENT_TOKEN:?NODE_AGENT_TOKEN is required}
NODE_AGENT_BASE_DOMAIN=${NODE_AGENT_BASE_DOMAIN:-mercury.app}
NODE_AGENT_PORT=${NODE_AGENT_PORT:-9090}
ACME_EMAIL=${ACME_EMAIL:?ACME_EMAIL is required}
HETZNER_DNS_API_TOKEN=${HETZNER_DNS_API_TOKEN:?HETZNER_DNS_API_TOKEN is required}
EOF
echo "Wrote $ENV_FILE"

# ─── 6. Start services via Docker Compose ────────────────────────────────
cd "$NODE_AGENT_DIR"
echo "Starting Traefik and node agent..."
docker compose up -d

echo ""
echo "=== Setup Complete ==="
echo "Node agent running at http://$(hostname -I | awk '{print $1}'):${NODE_AGENT_PORT:-9090}"
echo ""
echo "Next steps:"
echo "  1. Create wildcard DNS: *.${NODE_AGENT_BASE_DOMAIN:-mercury.app} → $(hostname -I | awk '{print $1}')"
echo "  2. Register this node in Mercury Cloud Console:"
echo "     POST /api/admin/nodes"
echo "     {"
echo "       \"label\": \"$(hostname)\","
echo "       \"host\": \"$(hostname -I | awk '{print $1}')\","
echo "       \"apiUrl\": \"http://$(hostname -I | awk '{print $1}'):${NODE_AGENT_PORT:-9090}\","
echo "       \"apiToken\": \"\$NODE_AGENT_TOKEN\","
echo "       \"maxAgents\": 100"
echo "     }"
