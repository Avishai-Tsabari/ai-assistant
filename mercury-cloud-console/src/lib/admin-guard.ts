import type { Session } from "next-auth";
import { NextResponse } from "next/server";

/** Returns true if the session belongs to an admin user. */
export function assertAdmin(session: Session | null): boolean {
  return session?.user?.role === "admin";
}

/**
 * For API routes: returns a 403 NextResponse if the session is not admin,
 * or null if authorized.
 */
export function assertAdminOrThrow(
  session: Session | null,
): NextResponse | null {
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
