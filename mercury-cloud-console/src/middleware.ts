import { getToken } from "next-auth/jwt";
import { type NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (token) {
    return NextResponse.redirect(new URL("/auth/redirect", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/signin", "/signup"],
};
