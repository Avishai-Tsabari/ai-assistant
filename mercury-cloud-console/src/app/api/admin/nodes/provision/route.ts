import { auth } from "@/auth";
import { assertAdminOrThrow } from "@/lib/admin-guard";
import { getDb, computeNodes } from "@/lib/db";
import { buildNodeCloudInit } from "@/lib/node-cloud-init";
import { z } from "zod";

const ProvisionSchema = z.object({
  label: z.string().min(1).max(80),
  serverType: z.string().min(1).default("cpx31"),
  location: z.string().min(1).default("nbg1"),
  maxAgents: z.number().int().min(1).max(500).default(50),
  hetznerApiToken: z.string().min(1),
  hetznerDnsToken: z.string().min(1),
  baseDomain: z.string().min(1),
  acmeEmail: z.string().email(),
  sshKeyIds: z.array(z.number().int()).optional(),
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** POST /api/admin/nodes/provision — create a Hetzner server and bootstrap it as a compute node. */
export async function POST(request: Request) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const raw = await request.json().catch(() => null);
  const parsed = ProvisionSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.errors.map((e) => e.message).join("; ") },
      { status: 400 },
    );
  }

  const {
    label,
    serverType,
    location,
    maxAgents,
    hetznerApiToken,
    hetznerDnsToken,
    baseDomain,
    acmeEmail,
    sshKeyIds,
  } = parsed.data;

  // Generate secure node token and build cloud-init early to fail fast on missing files
  const nodeToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  let userdata: string;
  try {
    userdata = buildNodeCloudInit({ nodeToken, baseDomain, acmeEmail, hetznerDnsToken });
  } catch (err) {
    return Response.json(
      { error: `cloud-init build failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      function enqueue(data: object) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected
        }
      }

      function log(msg: string) {
        enqueue({ log: msg });
      }

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 15_000);

      try {
        // Sanitize name: Hetzner requires lowercase alphanumeric + hyphens, max 63 chars
        const serverName = label
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 63) || "mercury-node";

        log(`Creating Hetzner server "${serverName}" (${serverType} / ${location})…`);

        const createRes = await fetch("https://api.hetzner.cloud/v1/servers", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hetznerApiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: serverName,
            server_type: serverType,
            image: "ubuntu-24.04",
            location,
            user_data: userdata,
            ...(sshKeyIds?.length ? { ssh_keys: sshKeyIds } : {}),
          }),
        });

        if (!createRes.ok) {
          const errData = await createRes.json().catch(() => ({})) as Record<string, unknown>;
          const msg = (errData.error as { message?: string } | undefined)?.message ?? JSON.stringify(errData);
          throw new Error(`Hetzner API ${createRes.status}: ${msg}`);
        }

        const createData = await createRes.json() as {
          server: { id: number; public_net: { ipv4: { ip: string } }; status: string };
        };

        const serverId = createData.server.id;
        const serverIp = createData.server.public_net.ipv4.ip;

        log(`Server #${serverId} created — IP ${serverIp}. Waiting for it to start…`);

        // Poll until server status === "running"
        const runDeadline = Date.now() + 120_000;
        while (Date.now() < runDeadline) {
          await sleep(5_000);
          const r = await fetch(`https://api.hetzner.cloud/v1/servers/${serverId}`, {
            headers: { Authorization: `Bearer ${hetznerApiToken}` },
          });
          const d = await r.json() as { server: { status: string } };
          if (d.server.status === "running") break;
          if (Date.now() >= runDeadline) {
            throw new Error("Server did not reach 'running' within 2 minutes.");
          }
        }

        log(`Server is running. Docker is installing and node agent is starting (5–8 min)…`);

        const agentUrl = `http://${serverIp}:9090`;
        const healthDeadline = Date.now() + 600_000; // 10 min
        let attempt = 0;
        let ready = false;

        while (Date.now() < healthDeadline) {
          await sleep(15_000);
          attempt++;
          try {
            const h = await fetch(`${agentUrl}/health`, {
              signal: AbortSignal.timeout(5_000),
            });
            if (h.ok) {
              ready = true;
              break;
            }
          } catch {
            // not ready yet
          }
          log(`Still waiting… (${Math.round((attempt * 15) / 60)} min elapsed)`);
        }

        if (!ready) {
          throw new Error(
            `Node agent did not become healthy within 10 minutes. ` +
              `Check ${agentUrl}/health manually.`,
          );
        }

        log("Node agent is healthy! Registering in console…");

        const db = getDb();
        const [node] = await db
          .insert(computeNodes)
          .values({
            label,
            host: serverIp,
            apiUrl: agentUrl,
            apiToken: nodeToken,
            maxAgents,
            status: "active",
            createdAt: new Date().toISOString(),
          })
          .returning();

        log(`Node "${label}" registered successfully.`);
        enqueue({ done: true, node: { ...node, apiToken: "***" } });
      } catch (err) {
        enqueue({ error: err instanceof Error ? err.message : String(err) });
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
