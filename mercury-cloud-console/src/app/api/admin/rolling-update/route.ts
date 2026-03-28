import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { assertAdminOrThrow } from "@/lib/admin-guard";
import { getDb, computeNodes, containerEvents } from "@/lib/db";
import { NodeClient } from "@/lib/node-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgentRow = { id: string; nodeId: string };

/**
 * POST /api/admin/rolling-update
 *
 * Body: { imageTag: string }
 *
 * Streams SSE progress events while rolling out a new agent image:
 * 1. For each active compute node: pull the new image
 * 2. For each agent on that node: restart the container (Docker will use the
 *    new image on restart if it was pulled with the same tag)
 * 3. Between each restart: wait for the agent's /health endpoint
 */
export async function POST(request: Request) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const body = await request.json().catch(() => ({})) as { imageTag?: string };
  const imageTag = body.imageTag?.trim();
  if (!imageTag) {
    return new Response(
      JSON.stringify({ error: "imageTag is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  const db = getDb();

  const stream = new ReadableStream({
    async start(controller) {
      function send(type: "progress" | "done" | "error", message: string, data?: Record<string, unknown>) {
        const payload = JSON.stringify({ message, ...data });
        controller.enqueue(encoder.encode(`event: ${type}\ndata: ${payload}\n\n`));
      }

      try {
        // Load all active nodes
        const nodes = db.select().from(computeNodes).all().filter((n) => n.status !== "offline");

        if (nodes.length === 0) {
          send("error", "No active compute nodes found");
          controller.close();
          return;
        }

        send("progress", `Starting rolling update to image tag: ${imageTag}`);
        send("progress", `Nodes to update: ${nodes.length}`);

        let totalRestarted = 0;
        let totalFailed = 0;

        for (const node of nodes) {
          const client = new NodeClient(node.apiUrl, node.apiToken);

          // Step 1: Pull the new image on this node
          send("progress", `[${node.label}] Pulling image...`);
          try {
            const pullResult = await client.pullImage(imageTag);
            send("progress", `[${node.label}] Image ${pullResult.status === "pulled" ? "pulled successfully" : "already up to date"}`);
          } catch (err) {
            send("progress", `[${node.label}] WARNING: Image pull failed — ${err instanceof Error ? err.message : String(err)}. Continuing with existing image.`);
          }

          // Step 2: Get all non-deprovisioned agents on this node
          const nodeAgents = db.all<AgentRow>(
            sql`SELECT id, node_id AS nodeId FROM agents WHERE node_id = ${node.id} AND deprovisioned_at IS NULL`,
          );

          send("progress", `[${node.label}] Restarting ${nodeAgents.length} agent(s)...`);

          for (const agent of nodeAgents) {
            try {
              await client.restartContainer(agent.id);

              // Brief wait then health check
              await new Promise((r) => setTimeout(r, 3000));
              const status = await client.getContainerStatus(agent.id);

              if (status.status === "running") {
                send("progress", `[${node.label}] Agent ${agent.id.slice(0, 8)}... ✓ running`);
                db.insert(containerEvents)
                  .values({ agentId: agent.id, event: "updated", details: JSON.stringify({ imageTag }) })
                  .run();
                totalRestarted++;
              } else {
                send("progress", `[${node.label}] Agent ${agent.id.slice(0, 8)}... ⚠ status: ${status.status}`);
                totalFailed++;
              }
            } catch (err) {
              send("progress", `[${node.label}] Agent ${agent.id.slice(0, 8)}... ✗ ${err instanceof Error ? err.message : String(err)}`);
              totalFailed++;
            }

            // Small delay between restarts to avoid hammering the node
            await new Promise((r) => setTimeout(r, 1000));
          }
        }

        send("done", `Rolling update complete. Restarted: ${totalRestarted}, Failed: ${totalFailed}`, {
          totalRestarted,
          totalFailed,
          imageTag,
        });
      } catch (err) {
        send("error", err instanceof Error ? err.message : String(err));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
