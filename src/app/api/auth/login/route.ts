import { NextRequest, NextResponse } from "next/server";

import {
  INVALID_CREDENTIALS_MESSAGE,
  INVALID_LOGIN_BODY_MESSAGE,
  InvalidCredentialsError,
  LDAP_UNAVAILABLE_MESSAGE,
  LdapUnavailableError,
  jsonError,
} from "@/lib/auth/errors";
import { authenticateWithLdap } from "@/lib/auth/ldap";
import { buildSessionPayload, sealSession, writeSessionCookie } from "@/lib/auth/session";
import { toAuthenticatedUser, type LoginRequestBody } from "@/lib/auth/types";

export async function POST(request: NextRequest) {
  let body: Partial<LoginRequestBody>;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "INVALID_BODY", INVALID_LOGIN_BODY_MESSAGE);
  }

  const { username, password } = body;
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return jsonError(400, "INVALID_BODY", INVALID_LOGIN_BODY_MESSAGE);
  }

  try {
    const authenticated = await authenticateWithLdap(username, password);
    const session = buildSessionPayload({
      userId: authenticated.userId,
      displayName: authenticated.displayName,
      email: authenticated.email,
      roles: authenticated.roles,
    });
    const sealedValue = await sealSession(session);

    const response = NextResponse.json({ user: toAuthenticatedUser(session) });
    writeSessionCookie(response, sealedValue, session.expiresAt);
    return response;
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return jsonError(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
    }
    if (error instanceof LdapUnavailableError) {
      return jsonError(503, "LDAP_UNAVAILABLE", LDAP_UNAVAILABLE_MESSAGE);
    }
    // Unexpected error — fail safe: never imply the credentials themselves were at fault.
    console.error("[auth] unexpected login error", error instanceof Error ? error.name : "unknown");
    return jsonError(503, "LDAP_UNAVAILABLE", LDAP_UNAVAILABLE_MESSAGE);
  }
}
