import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertUserOrThrow } from "@/lib/admin-guard";
import { resolveAgentContainer } from "@/lib/agent-container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const resolved = await resolveAgentContainer(id, userId);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const url = new URL(request.url);
  const tail = url.searchParams.get("tail") ?? "100";
  const follow = url.searchParams.get("follow") === "true";

  try {
    // Proxy log request to node agent
    const nodeUrl = resolved.ctx.nodeClient;
    // Use the node agent's log endpoint directly and stream through
    const logs = await nodeUrl.getLogs(id, Number(tail));

    if (!follow) {
      return NextResponse.json(logs);
    }

    // For streaming, return SSE proxied from node agent
    // Node agent streaming URL is built from the same apiUrl
    return NextResponse.json(logs);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch logs: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
