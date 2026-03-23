/**
 * Builds Hetzner-compatible #cloud-config user_data for Ubuntu 24.04 agent VPS.
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

/**
 * Returns full user_data string starting with #cloud-config
 */
export function buildCloudInitUserData(opts: CloudInitOptions): string {
  const specsJoined = opts.mercuryAddSpecs.join("\n");
  const specsB64 = toB64(specsJoined);

  const dockerLoginBlock = opts.ghcr
    ? `echo ${shellSingleQuote(opts.ghcr.token)} | docker login ghcr.io -u ${shellSingleQuote(opts.ghcr.username)} --password-stdin`
    : "";

  const bootstrapScript = `#!/bin/bash
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git gnupg ufw

curl -fsSL https://get.docker.com | sh
useradd -m -s /bin/bash mercury || true
usermod -aG docker mercury

${dockerLoginBlock}
docker pull ${shellSingleQuote(opts.agentImage)}

curl -fsSL https://bun.sh/install | sudo -u mercury env BUN_INSTALL=/home/mercury/.bun bash

sudo -u mercury mkdir -p /home/mercury/agent

echo ${shellSingleQuote(opts.envFileB64)} | base64 -d > /tmp/mercury-agent.env
install -o mercury -g mercury -m 0600 /tmp/mercury-agent.env /home/mercury/agent/.env
rm -f /tmp/mercury-agent.env

echo ${shellSingleQuote(opts.mercuryYamlB64)} | base64 -d > /tmp/mercury.yaml
install -o mercury -g mercury -m 0644 /tmp/mercury.yaml /home/mercury/agent/mercury.yaml
rm -f /tmp/mercury.yaml

ufw allow OpenSSH
ufw allow 8787/tcp
ufw --force enable

sudo -u mercury bash -lc 'export PATH=/home/mercury/.bun/bin:\\$PATH && bun install -g mercury-ai@latest'
sudo -u mercury bash -lc 'export PATH=/home/mercury/.bun/bin:\\$PATH && cd /home/mercury/agent && mercury init'

echo ${shellSingleQuote(specsB64)} | base64 -d > /tmp/specs_lines.txt
while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && continue
  spec_q=$(printf %q "$line")
  sudo -u mercury /bin/bash -c "export PATH=/home/mercury/.bun/bin:\\$PATH; cd /home/mercury/agent && mercury add $spec_q"
done < /tmp/specs_lines.txt
rm -f /tmp/specs_lines.txt

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
ExecStart=/home/mercury/.bun/bin/bun run /home/mercury/.bun/bin/mercury run
Restart=on-failure
RestartSec=15

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable mercury-agent.service
systemctl start mercury-agent.service
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
