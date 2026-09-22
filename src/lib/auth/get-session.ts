import type { UserSession } from "@/types";

import { revalidateRoles } from "./ldap";
import { isRevalidationDue, sealSession, unsealSession } from "./session";

/**
 * Node-only orchestrator (imports ./ldap). Route Handlers and Server Components
 * run in the Node.js runtime by default, so this is safe to call from either —
 * never from src/middleware.ts.
 */

export interface GetSessionResult {
  session: UserSession | null;
  /** Set when a due revalidation succeeded — caller must write this cookie. */
  refreshedCookie?: { value: string; expiresAt: string };
  /** Set when a previously-valid session was destroyed by a due revalidation. */
  destroyed?: boolean;
}

export async function getSession(cookieValue: string | undefined): Promise<GetSessionResult> {
  if (!cookieValue) return { session: null };

  const session = await unsealSession(cookieValue);
  if (!session) return { session: null };

  if (!isRevalidationDue(session)) {
    return { session };
  }

  try {
    const roles = await revalidateRoles(session.userId);
    if (roles.length === 0) {
      return { session: null, destroyed: true };
    }

    const updated: UserSession = {
      ...session,
      roles,
      ldapRevalidatedAt: new Date().toISOString(),
    };
    const sealedValue = await sealSession(updated);
    return { session: updated, refreshedCookie: { value: sealedValue, expiresAt: updated.expiresAt } };
  } catch {
    // Any revalidation failure — network down, anonymous-bind ACL denied — is
    // treated the same as "LDAP down": destroy the session.
    return { session: null, destroyed: true };
  }
}
