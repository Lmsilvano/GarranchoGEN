import { NextRequest, NextResponse } from "next/server";

import { UNAUTHENTICATED_MESSAGE, jsonError } from "@/lib/auth/errors";
import { readSessionCookieValue, unsealSession } from "@/lib/auth/session";

/**
 * Edge runtime (default — no `runtime: "nodejs"` override). Only touches
 * ./errors and ./session, neither of which imports ./ldap or ./get-session —
 * ldapts needs Node sockets that don't exist here. This layer only checks
 * "is there a valid, unexpired cookie"; the LDAP-backed periodic revalidation
 * happens in getSession() (Node), called from Route Handlers / Server
 * Components. See docs/specs/05-auth-ldap.md route protection table.
 */

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/health",
  "/api/ready",
  "/api/auth/login",
  "/api/auth/logout",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const cookieValue = readSessionCookieValue(request.cookies);
  const session = cookieValue ? await unsealSession(cookieValue) : null;

  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return jsonError(401, "UNAUTHENTICATED", UNAUTHENTICATED_MESSAGE);
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico)$).*)",
  ],
};
