import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertUserOrThrow } from "@/lib/admin-guard";
import { resolveAgentContainer } from "@/lib/agent-container";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
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

  try {
    await resolved.ctx.nodeClient.restartContainer(id);
    return NextResponse.json({ status: "restarted" });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to restart agent: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
