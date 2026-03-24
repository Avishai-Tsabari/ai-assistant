import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { assertAdminOrThrow } from "@/lib/admin-guard";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await auth();
  const denied = assertAdminOrThrow(session);
  if (denied) return denied;

  const db = getDb();

  const rows = db.all<{
    id: string;
    email: string;
    role: string;
    createdAt: string;
    subscriptionStatus: string | null;
    stripeCustomerId: string | null;
    agentCount: number;
  }>(sql`
    SELECT
      u.id,
      u.email,
      u.role,
      u.created_at AS createdAt,
      s.status AS subscriptionStatus,
      s.stripe_customer_id AS stripeCustomerId,
      (SELECT COUNT(*) FROM agents a WHERE a.user_id = u.id) AS agentCount
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ORDER BY u.created_at DESC
  `);

  const users = rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    createdAt: r.createdAt,
    subscription: r.subscriptionStatus
      ? { status: r.subscriptionStatus, stripeCustomerId: r.stripeCustomerId }
      : null,
    agentCount: r.agentCount,
  }));

  return NextResponse.json({ users });
}
