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
  enable_whatsapp: false
  enable_discord: false
  enable_slack: false
  enable_teams: false
  enable_telegram: false
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
log "=== Mercury provision start ==="

log "apt-get update"
apt-get update -y || fatal "apt-get update failed"

log "apt-get install packages"
apt-get install -y ca-certificates curl git gnupg ufw util-linux || fatal "apt-get install failed"

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

log "bun install for mercury user"
curl -fsSL https://bun.sh/install | sudo -u mercury env BUN_INSTALL=/home/mercury/.bun bash || fatal "bun install failed"

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
sudo -u mercury bash -lc 'export PATH=/home/mercury/.bun/bin:\\$PATH && bun install -g mercury-ai@latest' || fatal "bun install mercury-ai failed"
sudo -u mercury bash -lc 'export PATH=/home/mercury/.bun/bin:\\$PATH && cd /home/mercury/agent && mercury init' || fatal "mercury init failed"

log "mercury add extensions"
echo ${shellSingleQuote(specsB64)} | base64 -d > /tmp/specs_lines.txt
while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && continue
  spec_q=$(printf %q "$line")
  sudo -u mercury /bin/bash -c "export PATH=/home/mercury/.bun/bin:\\$PATH; cd /home/mercury/agent && mercury add $spec_q" || fatal "mercury add failed for: $line"
done < /tmp/specs_lines.txt
rm -f /tmp/specs_lines.txt

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
runcmd:
  - |
${indented}
`;
}
