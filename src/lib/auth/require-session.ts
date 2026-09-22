import type { NextRequest, NextResponse } from "next/server";

import { UNAUTHENTICATED_MESSAGE, jsonError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/get-session";
import {
  clearSessionCookie,
  readSessionCookieValue,
  writeSessionCookie,
} from "@/lib/auth/session";
import type { UserSession } from "@/types";

export type RequireSessionResult =
  | {
      ok: true;
      session: UserSession;
      /** Apply refreshed/destroyed cookie side-effects onto the success response. */
      applyCookies: (response: NextResponse) => void;
    }
  | { ok: false; response: NextResponse };

/**
 * Node-only session gate for Route Handlers (Vitest calls handlers without middleware).
 * Mirrors the cookie refresh/destroy behavior of GET /api/auth/me.
 */
export async function requireSession(request: NextRequest): Promise<RequireSessionResult> {
  const cookieValue = readSessionCookieValue(request.cookies);
  const result = await getSession(cookieValue);

  if (!result.session) {
    const response = jsonError(401, "UNAUTHENTICATED", UNAUTHENTICATED_MESSAGE);
    if (result.destroyed) clearSessionCookie(response);
    return { ok: false, response };
  }

  const session = result.session;
  const refreshedCookie = result.refreshedCookie;

  return {
    ok: true,
    session,
    applyCookies(response: NextResponse) {
      if (refreshedCookie) {
        writeSessionCookie(response, refreshedCookie.value, refreshedCookie.expiresAt);
      }
    },
  };
}
