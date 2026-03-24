/**
 * Builds Hetzner-compatible #cloud-config user_data for Docker CE app image (or Ubuntu).
 * Docker is expected pre-installed (use HETZNER_IMAGE=docker-ce).
 */

export type CloudInitOptions = {
  /** base64-encoded .env file for /home/mercury/agent/.env */
  envFileB64: string;
  /** base64-encoded mercury.yaml */
  mercuryYamlB64: string;
  /** Each entry is full `mercury add` source (e.g. Michaelliv/mercury#examples/extensions/napkin) */
  mercuryAddSpecs: string[];
  /** Full image reference to pull (e.g. ghcr.io/user/mercury-agent:latest) */
  agentImage: string;
  /** GHCR credentials for private image pull (omit if image is public) */
  ghcr?: { username: string; token: string };
};

export function toB64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

export const DEFAULT_MERCURY_YAML = `server:
  port: 8787
ingress:
  # Keys must match mercury.yaml schema (whatsapp not enable_whatsapp).
  # WhatsApp needs no token at boot; pair via /dashboard when ready. Required so Mercury has ≥1 adapter.
  whatsapp: true
  discord: false
  slack: false
  teams: false
  telegram: false
runtime:
  data_dir: .mercury
`;

function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Escape for systemd unit Environment= line (no newlines; value is unquoted so avoid spaces if possible — image refs have no spaces) */
function systemdEnvValue(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Returns full user_data string starting with #cloud-config
 */
/** PATH for `sudo -u mercury` steps — login shells may omit /usr/bin (no `cat`, `git`, etc.). */
const MERCURY_FULL_PATH =
  "/home/mercury/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

export function buildCloudInitUserData(opts: CloudInitOptions): string {
  const specsJoined = opts.mercuryAddSpecs.join("\n");
  const specsB64 = toB64(specsJoined);
  const agentImageEsc = systemdEnvValue(opts.agentImage);

  const dockerLoginBlock = opts.ghcr
    ? `log "docker login ghcr.io"
if ! echo ${shellSingleQuote(opts.ghcr.token)} | docker login ghcr.io -u ${shellSingleQuote(opts.ghcr.username)} --password-stdin; then
  fatal "docker login failed"
fi`
    : "";

  const bootstrapScript = `#!/bin/bash
LOG=/var/log/mercury-provision.log
log() { echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") $*" | tee -a "$LOG"; }
fatal() { log "FATAL: $*"; exit 1; }

export DEBIAN_FRONTEND=noninteractive
# cloud-init runcmd often runs with no HOME; bun's install script uses HOME (set -u).
export HOME="\${HOME:-/root}"
log "=== Mercury provision start ==="

log "apt-get update"
apt-get update -y || fatal "apt-get update failed"

log "apt-get install packages"
apt-get install -y ca-certificates curl git gnupg ufw util-linux unzip || fatal "apt-get install failed"

log "ensure docker daemon"
systemctl enable docker 2>/dev/null || true
systemctl start docker || fatal "docker service start failed"
timeout 120 bash -c 'until docker info >/dev/null 2>&1; do sleep 2; done' || fatal "docker not ready"

useradd -m -s /bin/bash mercury 2>/dev/null || true
usermod -aG docker mercury || fatal "usermod docker group failed"

${dockerLoginBlock}

log "docker pull (nice/ionice) ${opts.agentImage}"
if ! nice -n 19 ionice -c 3 docker pull ${shellSingleQuote(opts.agentImage)}; then
  fatal "docker pull failed"
fi

log "bun install into /home/mercury/.bun (curl to file + bash — avoids dash pipe/env quirks in cloud-init)"
mkdir -p /home/mercury/.bun
if ! curl -fsSL https://bun.sh/install -o /tmp/bun-install.sh; then
  fatal "curl bun installer failed"
fi
if ! HOME=/root BUN_INSTALL=/home/mercury/.bun bash /tmp/bun-install.sh; then
  fatal "bun install failed"
fi
rm -f /tmp/bun-install.sh
chown -R mercury:mercury /home/mercury/.bun || fatal "chown .bun failed"

sudo -u mercury mkdir -p /home/mercury/agent || fatal "mkdir agent failed"

log "write .env"
echo ${shellSingleQuote(opts.envFileB64)} | base64 -d > /tmp/mercury-agent.env
install -o mercury -g mercury -m 0600 /tmp/mercury-agent.env /home/mercury/agent/.env
rm -f /tmp/mercury-agent.env

log "write mercury.yaml"
echo ${shellSingleQuote(opts.mercuryYamlB64)} | base64 -d > /tmp/mercury.yaml
install -o mercury -g mercury -m 0644 /tmp/mercury.yaml /home/mercury/agent/mercury.yaml
rm -f /tmp/mercury.yaml

log "ufw"
ufw allow OpenSSH
ufw allow 8787/tcp
ufw --force enable || true

log "mercury-ai global + init"
sudo -u mercury bash -lc ${shellSingleQuote(`export PATH=${MERCURY_FULL_PATH} && bun install -g mercury-ai@latest`)} || fatal "bun install mercury-ai failed"
sudo -u mercury bash -lc ${shellSingleQuote(`export PATH=${MERCURY_FULL_PATH} && cd /home/mercury/agent && mercury init`)} || fatal "mercury init failed"

log "mercury add extensions"
echo ${shellSingleQuote(specsB64)} | base64 -d > /tmp/specs_lines.txt
while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && continue
  printf '%s' "$line" > /tmp/mercury_one_add_spec
  chown mercury:mercury /tmp/mercury_one_add_spec
  chmod 600 /tmp/mercury_one_add_spec
  sudo -u mercury bash -lc ${shellSingleQuote(`export PATH=${MERCURY_FULL_PATH}; cd /home/mercury/agent && mercury add "$(cat /tmp/mercury_one_add_spec)"`)} || fatal "mercury add failed for: $line"
done < /tmp/specs_lines.txt
rm -f /tmp/specs_lines.txt /tmp/mercury_one_add_spec

log "write systemd unit"
cat >/etc/systemd/system/mercury-agent.service <<'UNIT'
[Unit]
Description=Mercury agent
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=mercury
Group=mercury
SupplementaryGroups=docker
WorkingDirectory=/home/mercury/agent
Environment=HOME=/home/mercury
Environment=PATH=/home/mercury/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=MERCURY_AGENT_IMAGE=${agentImageEsc}
ExecStartPre=/bin/sh -c 'docker image inspect "$MERCURY_AGENT_IMAGE" >/dev/null'
ExecStart=/home/mercury/.bun/bin/bun run /home/mercury/.bun/bin/mercury run
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable mercury-agent.service
systemctl start mercury-agent.service || fatal "mercury-agent start failed"

log "=== Mercury provision done ==="
`;

  const indented = bootstrapScript
    .split("\n")
    .map((line) => (line.length ? `    ${line}` : ""))
    .join("\n");

  return `#cloud-config
package_update: true
packages:
  - ca-certificates
  - curl
  - git
  - gnupg
  - ufw
  - unzip
runcmd:
  - |
${indented}
`;
}
