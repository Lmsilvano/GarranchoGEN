export type UserRole = "admin" | "reviewer";

export interface UserSession {
  sessionId: string;
  userId: string; // LDAP uid
  displayName: string;
  email?: string;
  roles: UserRole[];
  issuedAt: string;
  expiresAt: string;
  ldapRevalidatedAt?: string;
}
