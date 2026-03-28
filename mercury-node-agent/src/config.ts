/** Node agent configuration loaded from environment variables. */
export interface NodeAgentConfig {
  port: number;
  token: string;
  /** Docker socket path (default: /var/run/docker.sock) */
  dockerSocket: string;
  /** Base domain for Traefik routing, e.g. "mercury.app" */
  baseDomain: string;
  /** Docker network that Traefik and agent containers share */
  dockerNetwork: string;
  /** Default memory limit per agent container in MB */
  defaultMemoryMb: number;
  /** Default CPU share per agent container (Docker --cpus) */
  defaultCpus: string;
}

export function loadConfig(): NodeAgentConfig {
  const token = process.env.NODE_AGENT_TOKEN;
  if (!token) {
    throw new Error("NODE_AGENT_TOKEN is required");
  }

  return {
    port: Number.parseInt(process.env.NODE_AGENT_PORT ?? "9090", 10),
    token,
    dockerSocket: process.env.DOCKER_SOCKET ?? "/var/run/docker.sock",
    baseDomain: process.env.NODE_AGENT_BASE_DOMAIN ?? "mercury.app",
    dockerNetwork: process.env.NODE_AGENT_DOCKER_NETWORK ?? "mercury-net",
    defaultMemoryMb: Number.parseInt(
      process.env.NODE_AGENT_DEFAULT_MEMORY_MB ?? "512",
      10,
    ),
    defaultCpus: process.env.NODE_AGENT_DEFAULT_CPUS ?? "0.5",
  };
}
