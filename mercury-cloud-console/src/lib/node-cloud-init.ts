import fs from "node:fs";
import path from "node:path";

export interface CloudInitOpts {
  nodeToken: string;
  baseDomain: string;
  acmeEmail: string;
  hetznerDnsToken: string;
  port?: number;
}

const NODE_AGENT_FILES = [
  "package.json",
  "tsconfig.json",
  "Dockerfile",
  "docker-compose.yml",
  "traefik/traefik.yml",
  "src/main.ts",
  "src/config.ts",
  "src/routes.ts",
  "src/docker.ts",
  "src/system.ts",
];

function findNodeAgentRoot(): string {
  const candidates = [
    path.join(process.cwd(), "..", "mercury-node-agent"),
    path.join(process.cwd(), "mercury-node-agent"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, "package.json"))) return p;
  }
  throw new Error(
    `mercury-node-agent directory not found. Expected at ${candidates[0]}. ` +
      "Provision must be run from the Mercury monorepo.",
  );
}

function writeFileEntry(filePath: string, content: string): string {
  const b64 = Buffer.from(content, "utf-8").toString("base64");
  return [
    `  - path: ${filePath}`,
    `    encoding: b64`,
    `    content: ${b64}`,
  ].join("\n");
}

/**
 * Build a cloud-init user_data script that bootstraps a Mercury compute node.
 * Embeds all mercury-node-agent source files so no git clone or registry is needed.
 */
export function buildNodeCloudInit(opts: CloudInitOpts): string {
  const port = opts.port ?? 9090;
  const nodeAgentRoot = findNodeAgentRoot();

  const envContent = [
    `NODE_AGENT_TOKEN=${opts.nodeToken}`,
    `NODE_AGENT_BASE_DOMAIN=${opts.baseDomain}`,
    `NODE_AGENT_PORT=${port}`,
    `ACME_EMAIL=${opts.acmeEmail}`,
    `HETZNER_DNS_API_TOKEN=${opts.hetznerDnsToken}`,
  ].join("\n");

  const entries: string[] = [
    writeFileEntry("/opt/mercury-node-agent/.env", envContent),
  ];

  for (const relPath of NODE_AGENT_FILES) {
    const content = fs.readFileSync(path.join(nodeAgentRoot, relPath), "utf-8");
    entries.push(writeFileEntry(`/opt/mercury-node-agent/${relPath}`, content));
  }

  return [
    "#cloud-config",
    "",
    "write_files:",
    ...entries,
    "",
    "runcmd:",
    "  - curl -fsSL https://get.docker.com | sh",
    "  - systemctl enable --now docker",
    "  - sleep 3",
    "  - cd /opt/mercury-node-agent && docker compose up -d --build",
  ].join("\n");
}
