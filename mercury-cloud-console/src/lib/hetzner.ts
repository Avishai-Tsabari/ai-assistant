const API = "https://api.hetzner.cloud/v1";

export type CreateServerInput = {
  name: string;
  serverType: string;
  image: string;
  location?: string;
  sshKeys?: number[];
  userData: string;
  labels?: Record<string, string>;
};

export class HetznerClient {
  constructor(private readonly token: string) {}

  private async req<T>(
    path: string,
    init?: RequestInit & { json?: unknown },
  ): Promise<T> {
    const url = `${API}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
    const body =
      init?.json !== undefined ? JSON.stringify(init.json) : init?.body;
    const res = await fetch(url, { ...init, headers, body });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Hetzner API ${init?.method ?? "GET"} ${path}: ${res.status} ${text}`);
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  async createServer(input: CreateServerInput): Promise<{ server: { id: number } }> {
    return this.req("/servers", {
      method: "POST",
      json: {
        name: input.name,
        server_type: input.serverType,
        image: input.image,
        location: input.location,
        ssh_keys: input.sshKeys,
        user_data: input.userData,
        labels: input.labels,
        start_after_create: true,
      },
    });
  }

  async getServer(id: number): Promise<{
    server: {
      status: string;
      public_net?: { ipv4?: { ip?: string } };
    };
  }> {
    return this.req(`/servers/${id}`);
  }

  async deleteServer(id: number): Promise<void> {
    await this.req(`/servers/${id}`, { method: "DELETE" });
  }
}

/** Hetzner DNS uses a separate API host (same API token). */
export async function createHetznerDnsARecord(opts: {
  token: string;
  zoneId: string;
  name: string;
  ip: string;
  ttl?: number;
}): Promise<void> {
  const res = await fetch("https://dns.hetzner.com/api/v1/records", {
    method: "POST",
    headers: {
      "Auth-API-Token": opts.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      zone_id: opts.zoneId,
      type: "A",
      name: opts.name,
      value: opts.ip,
      ttl: opts.ttl ?? 300,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Hetzner DNS POST /records: ${res.status} ${text}`);
  }
}
