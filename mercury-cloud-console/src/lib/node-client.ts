/**
 * Typed HTTP client for communicating with Mercury Node Agent daemons.
 * Each compute node runs a node agent that manages Docker containers.
 */

export interface NodeAgentHealth {
  status: "ok";
  hostname: string;
  cpuPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  diskUsedPercent: number;
  containerCount: number;
}

export interface ContainerStartResult {
  containerId: string;
  status: "started";
}

export interface ContainerStatusResult {
  agentId: string;
  containerId: string;
  status: "running" | "stopped" | "restarting" | "dead" | "unknown";
  uptimeSeconds: number;
  memoryUsageMb: number;
  imageTag: string;
}

export class NodeClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiToken: string,
  ) {}

  private async request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const url = `${this.apiUrl.replace(/\/$/, "")}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
        ...(init?.headers as Record<string, string> | undefined),
      },
      signal: init?.signal ?? AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Node agent ${init?.method ?? "GET"} ${path} failed (${res.status}): ${body}`,
      );
    }

    return res.json() as Promise<T>;
  }

  /** Get node health and system metrics. */
  async getHealth(): Promise<NodeAgentHealth> {
    return this.request<NodeAgentHealth>("/health");
  }

  /** Start a new agent container. */
  async startContainer(opts: {
    agentId: string;
    image: string;
    env: Record<string, string>;
    memoryMb?: number;
    cpus?: string;
    labels?: Record<string, string>;
  }): Promise<ContainerStartResult> {
    return this.request<ContainerStartResult>("/containers/start", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  /** Stop an agent container. */
  async stopContainer(agentId: string): Promise<{ status: string }> {
    return this.request(`/containers/${agentId}/stop`, { method: "POST" });
  }

  /** Restart an agent container. */
  async restartContainer(agentId: string): Promise<{ status: string }> {
    return this.request(`/containers/${agentId}/restart`, { method: "POST" });
  }

  /** Remove an agent container. */
  async removeContainer(agentId: string): Promise<{ status: string }> {
    return this.request(`/containers/${agentId}`, { method: "DELETE" });
  }

  /** Get container status. */
  async getContainerStatus(
    agentId: string,
  ): Promise<ContainerStatusResult> {
    return this.request<ContainerStatusResult>(
      `/containers/${agentId}/status`,
    );
  }

  /** List all managed containers on this node. */
  async listContainers(): Promise<ContainerStatusResult[]> {
    return this.request<ContainerStatusResult[]>("/containers");
  }

  /** Pull a Docker image. */
  async pullImage(
    image: string,
  ): Promise<{ status: "pulled" | "already_latest" }> {
    return this.request("/images/pull", {
      method: "POST",
      body: JSON.stringify({ image }),
      signal: AbortSignal.timeout(300_000), // Image pulls can be slow
    });
  }

  /** List available mercury agent images. */
  async listImages(): Promise<string[]> {
    return this.request<string[]>("/images");
  }

  /** Get container logs (non-streaming). */
  async getLogs(
    agentId: string,
    tail = 100,
  ): Promise<{ logs: string }> {
    return this.request<{ logs: string }>(
      `/containers/${agentId}/logs?tail=${tail}`,
    );
  }
}
