import type { Session } from "next-auth";
import { NextResponse } from "next/server";

/**
 * For user API routes: returns a 401 NextResponse if not authenticated,
 * or the userId string if authorized.
 */
export function assertUserOrThrow(
  session: Session | null,
): NextResponse | string {
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session.user.id;
}

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
