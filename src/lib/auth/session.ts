import { sealData, unsealData } from "iron-session";
import type { NextResponse } from "next/server";

import type { UserRole, UserSession } from "@/types";

import { getLdapRevalidateSeconds, getSessionSecret, getSessionTtlSeconds } from "./config";

/**
 * Edge-safe cookie/session mechanics (iron-session's seal/unseal only touch Web
 * Crypto). Never import ./ldap here — that module needs Node sockets and must
 * stay out of anything the Edge middleware runtime evaluates.
 */

export const SESSION_COOKIE_NAME = "garranchogen_session";

interface CookieReader {
  get(name: string): { value: string } | undefined;
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export interface CreateSessionInput {
  userId: string;
  displayName: string;
  email?: string;
  roles: UserRole[];
}

export function buildSessionPayload(input: CreateSessionInput): UserSession {
  const ttlSeconds = getSessionTtlSeconds();
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  return {
    sessionId: crypto.randomUUID(),
    userId: input.userId,
    displayName: input.displayName,
    email: input.email,
    roles: input.roles,
    issuedAt,
    expiresAt,
    ldapRevalidatedAt: issuedAt,
  };
}

export async function sealSession(session: UserSession): Promise<string> {
  // ttl: 0 disables iron-session's own implicit expiry — expiresAt is the sole
  // authority, checked explicitly in unsealSession.
  return sealData(session, { password: getSessionSecret(), ttl: 0 });
}

export async function unsealSession(sealedValue: string): Promise<UserSession | null> {
  try {
    const data = await unsealData<UserSession>(sealedValue, {
      password: getSessionSecret(),
      ttl: 0,
    });
    if (!data || typeof data.expiresAt !== "string") return null;
    if (Date.parse(data.expiresAt) <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function isRevalidationDue(session: UserSession, nowMs = Date.now()): boolean {
  const revalidateSeconds = getLdapRevalidateSeconds();
  const last = Date.parse(session.ldapRevalidatedAt ?? session.issuedAt);
  if (Number.isNaN(last)) return true;
  return nowMs - last >= revalidateSeconds * 1000;
}

export function readSessionCookieValue(cookies: CookieReader): string | undefined {
  return cookies.get(SESSION_COOKIE_NAME)?.value;
}

export function writeSessionCookie(
  response: NextResponse,
  sealedValue: string,
  expiresAt: string
): void {
  response.cookies.set(SESSION_COOKIE_NAME, sealedValue, {
    ...baseCookieOptions(),
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...baseCookieOptions(),
    maxAge: 0,
  });
}
