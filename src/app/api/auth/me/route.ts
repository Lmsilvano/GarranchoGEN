import { NextRequest, NextResponse } from "next/server";

import { UNAUTHENTICATED_MESSAGE, jsonError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/get-session";
import { clearSessionCookie, readSessionCookieValue, writeSessionCookie } from "@/lib/auth/session";
import { toAuthenticatedUser } from "@/lib/auth/types";

export async function GET(request: NextRequest) {
  const cookieValue = readSessionCookieValue(request.cookies);
  const result = await getSession(cookieValue);

  if (!result.session) {
    const response = jsonError(401, "UNAUTHENTICATED", UNAUTHENTICATED_MESSAGE);
    if (result.destroyed) clearSessionCookie(response);
    return response;
  }

  const response = NextResponse.json({ user: toAuthenticatedUser(result.session) });
  if (result.refreshedCookie) {
    writeSessionCookie(response, result.refreshedCookie.value, result.refreshedCookie.expiresAt);
  }
  return response;
}
