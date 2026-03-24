import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertAdminOrThrow } from "@/lib/admin-guard";
import { pollSingleAgentHealth } from "@/lib/health-poller";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const { id } = await params;
  const result = await pollSingleAgentHealth(id);

  if (!result) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
