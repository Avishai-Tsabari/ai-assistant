import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { agents } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = getDb()
    .select({
      id: agents.id,
      hostname: agents.hostname,
      ipv4: agents.ipv4,
      dashboardUrl: agents.dashboardUrl,
      healthUrl: agents.healthUrl,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .where(eq(agents.userId, session.user.id))
    .all();

  return NextResponse.json({ agents: rows });
}
