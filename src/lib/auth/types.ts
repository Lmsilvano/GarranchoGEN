/**
 * Auth-only helpers. Canonical UserRole / UserSession live in @/types
 * (docs/specs/04-contracts.md); re-exported here for convenience.
 */

import type { UserRole, UserSession } from "@/types";

export type { UserRole, UserSession };

/** Safe subset returned to the client by login/me — never sessionId. */
export type AuthenticatedUser = Pick<
  UserSession,
  "userId" | "displayName" | "email" | "roles" | "expiresAt"
>;

export interface LoginRequestBody {
  username: string;
  password: string;
}

export function toAuthenticatedUser(session: UserSession): AuthenticatedUser {
  return {
    userId: session.userId,
    displayName: session.displayName,
    email: session.email,
    roles: session.roles,
    expiresAt: session.expiresAt,
  };
}
