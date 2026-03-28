import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertUserOrThrow } from "@/lib/admin-guard";
import { resolveAgentContainer } from "@/lib/agent-container";

export const runtime = "nodejs";

export async function GET(
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
    const status = await resolved.ctx.nodeClient.getContainerStatus(id);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to get status: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
