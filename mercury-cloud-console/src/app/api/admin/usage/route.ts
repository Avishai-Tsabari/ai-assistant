import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { assertAdminOrThrow } from "@/lib/admin-guard";
import { getDb } from "@/lib/db";
import { usageAlerts, usageSnapshots } from "@/lib/db/schema";

/** GET /api/admin/usage?agentId=xxx — recent snapshots for agent (last 30, desc) */
export async function GET(request: NextRequest) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json({ error: "agentId query param is required" }, { status: 400 });
  }

  const db = getDb();
  const snapshots = await db
    .select()
    .from(usageSnapshots)
    .where(eq(usageSnapshots.agentId, agentId))
    .orderBy(desc(usageSnapshots.snapshotAt))
    .limit(30);

  return NextResponse.json({ snapshots });
}

const createAlertSchema = z.object({
  agentId: z.string().min(1),
  thresholdType: z.enum(["daily_tokens", "monthly_tokens", "daily_cost", "monthly_cost"]),
  thresholdValue: z.number().positive(),
  enabled: z.boolean().optional().default(true),
});

/** POST /api/admin/usage/alerts — create a usage alert */
export async function POST(request: NextRequest) {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = createAlertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const { agentId, thresholdType, thresholdValue, enabled } = parsed.data;
  const db = getDb();
  const now = new Date().toISOString();

  const inserted = await db
    .insert(usageAlerts)
    .values({
      agentId,
      thresholdType,
      thresholdValue,
      enabled: enabled ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json({ alert: inserted[0] }, { status: 201 });
}
