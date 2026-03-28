import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  if (!email || !password || password.length < 8) {
    return NextResponse.json(
      { error: "Valid email and password (8+ chars) required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const existing = (await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1))[0];
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(users)
    .values({
      id,
      email,
      passwordHash,
      createdAt: new Date().toISOString(),
    });

  return NextResponse.json({ ok: true, id });
}
