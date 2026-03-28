import { execSync, spawn, type ChildProcess } from "node:child_process";
import type { NodeAgentConfig } from "./config.js";

/** Options for starting an agent container. */
export interface StartContainerOpts {
  agentId: string;
  image: string;
  env: Record<string, string>;
  memoryMb?: number;
  cpus?: string;
  labels?: Record<string, string>;
}

/** Container status from docker inspect. */
export interface ContainerStatus {
  agentId: string;
  containerId: string;
  status: "running" | "stopped" | "restarting" | "dead" | "unknown";
  uptimeSeconds: number;
  memoryUsageMb: number;
  imageTag: string;
}

const CONTAINER_PREFIX = "mercury-agent-";

function containerName(agentId: string): string {
  return `${CONTAINER_PREFIX}${agentId}`;
}

function exec(cmd: string, timeoutMs = 30_000): string {
  return execSync(cmd, { timeout: timeoutMs, encoding: "utf-8" }).trim();
}

/**
 * Start a new agent container with hardening flags.
 * Returns the Docker container ID.
 */
export function startContainer(
  opts: StartContainerOpts,
  config: NodeAgentConfig,
): string {
  const name = containerName(opts.agentId);
  const memoryMb = opts.memoryMb ?? config.defaultMemoryMb;
  const cpus = opts.cpus ?? config.defaultCpus;

  // Build env flags
  const envFlags = Object.entries(opts.env)
    .map(([k, v]) => `-e ${shellEscape(k)}=${shellEscape(v)}`)
    .join(" ");

  // Traefik labels for automatic routing
  const traefikLabels = [
    `traefik.enable=true`,
    `traefik.http.routers.${opts.agentId}.rule=Host(\`${opts.agentId}.${config.baseDomain}\`)`,
    `traefik.http.routers.${opts.agentId}.entrypoints=websecure`,
    `traefik.http.routers.${opts.agentId}.tls.certresolver=letsencrypt`,
    `traefik.http.services.${opts.agentId}.loadbalancer.server.port=8787`,
  ];

  // Custom + Traefik labels
  const allLabels: Record<string, string> = {
    "mercury.managed": "true",
    "mercury.agent-id": opts.agentId,
    ...Object.fromEntries(traefikLabels.map((l) => l.split("=", 2) as [string, string])),
    ...(opts.labels ?? {}),
  };

  const labelFlags = Object.entries(allLabels)
    .map(([k, v]) => `--label ${shellEscape(`${k}=${v}`)}`)
    .join(" ");

  // Persistent data volume for agent state (SQLite, WhatsApp auth, spaces)
  const volumeName = `mercury-${opts.agentId}-data`;

  const cmd = [
    "docker run -d",
    `--name ${name}`,
    `--network ${config.dockerNetwork}`,
    // Persistent state
    `-v ${volumeName}:/home/mercury/agent/.mercury`,
    // Docker socket for inner container-runner
    `-v /var/run/docker.sock:/var/run/docker.sock`,
    // Hardening
    `--cap-drop=ALL`,
    `--security-opt=no-new-privileges`,
    `--memory=${memoryMb}m`,
    `--cpus=${cpus}`,
    `--restart=unless-stopped`,
    // Log rotation — prevent unbounded disk growth
    `--log-opt max-size=20m`,
    `--log-opt max-file=3`,
    // Inject agent ID so inner containers get namespaced names
    `-e MERCURY_AGENT_ID=${shellEscape(opts.agentId)}`,
    envFlags,
    labelFlags,
    opts.image,
  ].join(" ");

  const containerId = exec(cmd, 60_000);
  return containerId;
}

/** Stop an agent container gracefully. */
export function stopContainer(agentId: string): void {
  exec(`docker stop ${containerName(agentId)}`, 35_000);
}

/** Restart an agent container. */
export function restartContainer(agentId: string): void {
  exec(`docker restart ${containerName(agentId)}`, 60_000);
}

/** Force-remove an agent container. */
export function removeContainer(agentId: string): void {
  exec(`docker rm -f ${containerName(agentId)}`);
}

/** Get container status via docker inspect. */
export function getContainerStatus(agentId: string): ContainerStatus {
  const name = containerName(agentId);
  try {
    const raw = exec(
      `docker inspect --format '{{json .}}' ${name}`,
    );
    const info = JSON.parse(raw);
    const state = info.State;

    let status: ContainerStatus["status"] = "unknown";
    if (state.Running) status = "running";
    else if (state.Restarting) status = "restarting";
    else if (state.Dead) status = "dead";
    else status = "stopped";

    const startedAt = state.StartedAt
      ? new Date(state.StartedAt).getTime()
      : Date.now();
    const uptimeSeconds = status === "running"
      ? Math.floor((Date.now() - startedAt) / 1000)
      : 0;

    // Memory usage from docker stats (one-shot)
    let memoryUsageMb = 0;
    if (status === "running") {
      try {
        const statsRaw = exec(
          `docker stats --no-stream --format '{{.MemUsage}}' ${name}`,
          10_000,
        );
        const match = statsRaw.match(/([\d.]+)(MiB|GiB)/);
        if (match) {
          memoryUsageMb = Number.parseFloat(match[1]);
          if (match[2] === "GiB") memoryUsageMb *= 1024;
        }
      } catch {
        // stats may fail, non-critical
      }
    }

    const imageTag = (info.Config?.Image as string) ?? "unknown";

    return {
      agentId,
      containerId: info.Id?.slice(0, 12) ?? "",
      status,
      uptimeSeconds,
      memoryUsageMb,
      imageTag,
    };
  } catch {
    return {
      agentId,
      containerId: "",
      status: "unknown",
      uptimeSeconds: 0,
      memoryUsageMb: 0,
      imageTag: "unknown",
    };
  }
}

/** List all mercury-managed containers on this node. */
export function listContainers(): ContainerStatus[] {
  try {
    const raw = exec(
      `docker ps -a --filter "label=mercury.managed=true" --format '{{.Names}}'`,
    );
    if (!raw) return [];
    return raw
      .split("\n")
      .filter(Boolean)
      .map((name) => {
        const agentId = name.replace(CONTAINER_PREFIX, "");
        return getContainerStatus(agentId);
      });
  } catch {
    return [];
  }
}

/** Pull a Docker image. Returns true if a new layer was pulled. */
export function pullImage(image: string): boolean {
  try {
    const output = exec(`docker pull ${shellEscape(image)}`, 300_000);
    return !output.includes("Image is up to date");
  } catch {
    return false;
  }
}

/** List mercury agent images available locally. */
export function listImages(): string[] {
  try {
    const raw = exec(
      `docker images --format '{{.Repository}}:{{.Tag}}' | grep mercury-agent`,
    );
    return raw.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** Spawn a docker logs -f process. Returns the ChildProcess for streaming. */
export function streamLogs(
  agentId: string,
  tail = 100,
): ChildProcess {
  return spawn("docker", [
    "logs",
    "-f",
    "--tail",
    String(tail),
    containerName(agentId),
  ]);
}

/** Escape a string for safe shell usage. */
function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
