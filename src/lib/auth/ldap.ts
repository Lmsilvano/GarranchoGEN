import { Client } from "ldapts";

import type { UserRole } from "@/types";

import { getLdapBaseDn, getLdapUrl, getLdapUserDnTemplate } from "./config";
import { InvalidCredentialsError, LdapUnavailableError } from "./errors";

/**
 * Node-only LDAP wrapper (ldapts needs real net/tls sockets — never import this
 * from src/middleware.ts, which runs on the Edge runtime).
 */

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;
const CONNECT_TIMEOUT_MS = 5000;
const ROLE_GROUP_CNS: ReadonlySet<string> = new Set<UserRole>(["admin", "reviewer"]);

/**
 * Allowlist the username charset before it ever reaches a DN template or LDAP
 * filter. Rejection always throws the same InvalidCredentialsError as a bad
 * password — never reveal that the format, rather than the credential, was
 * the problem.
 */
export function assertSafeUsername(username: string): string {
  if (!USERNAME_PATTERN.test(username)) {
    throw new InvalidCredentialsError("Username contains unsafe characters");
  }
  return username;
}

export function resolveUserDN(username: string): string {
  const safeUsername = assertSafeUsername(username);
  const template = getLdapUserDnTemplate();
  const base = getLdapBaseDn();
  return template.replace("{uid}", safeUsername).replace("{base}", base);
}

/** RFC 4515 filter-value escaping. Defense-in-depth on top of the username allowlist. */
export function escapeFilterValue(value: string): string {
  return value.replace(/[\\*()\0]/g, (char) => {
    switch (char) {
      case "\\":
        return "\\5c";
      case "*":
        return "\\2a";
      case "(":
        return "\\28";
      case ")":
        return "\\29";
      default:
        return "\\00";
    }
  });
}

export function mapGroupsToRoles(groupCns: string[]): UserRole[] {
  const roles = new Set<UserRole>();
  for (const cn of groupCns) {
    if (ROLE_GROUP_CNS.has(cn)) {
      roles.add(cn as UserRole);
    }
  }
  return Array.from(roles);
}

function toStringList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map((entry) => String(entry));
}

/**
 * Classifies any LDAP client error into the two outcomes the API contract
 * distinguishes. Network/timeout failures become LdapUnavailableError (503);
 * everything else (bad password, unknown uid, insufficient access, malformed
 * bind) collapses to InvalidCredentialsError (401) so no response path can be
 * used to enumerate valid usernames.
 */
function classifyLdapError(error: unknown): InvalidCredentialsError | LdapUnavailableError {
  const code = (error as { code?: string } | undefined)?.code;
  const networkCodes = new Set([
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EHOSTUNREACH",
    "ECONNRESET",
    "EAI_AGAIN",
  ]);
  if (code && networkCodes.has(code)) {
    return new LdapUnavailableError("LDAP connection failed");
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("connect") ||
    message.includes("unreachable") ||
    message.includes("socket")
  ) {
    return new LdapUnavailableError("LDAP connection failed");
  }
  return new InvalidCredentialsError("LDAP bind rejected");
}

async function searchGroupCns(client: Client, memberDn: string): Promise<string[]> {
  const { searchEntries } = await client.search(`ou=groups,${getLdapBaseDn()}`, {
    scope: "sub",
    filter: `(&(objectClass=groupOfNames)(member=${escapeFilterValue(memberDn)}))`,
    attributes: ["cn"],
  });
  return searchEntries.flatMap((entry) => toStringList(entry.cn));
}

async function fetchDisplayProfile(
  client: Client,
  dn: string,
  fallbackDisplayName: string
): Promise<{ displayName: string; email?: string }> {
  try {
    const { searchEntries } = await client.search(dn, {
      scope: "base",
      filter: "(objectClass=*)",
      attributes: ["cn", "mail"],
    });
    const entry = searchEntries[0];
    const cn = entry ? toStringList(entry.cn)[0] : undefined;
    const mail = entry ? toStringList(entry.mail)[0] : undefined;
    return { displayName: cn ?? fallbackDisplayName, email: mail };
  } catch {
    // Cosmetic only — role membership is already confirmed by this point.
    return { displayName: fallbackDisplayName };
  }
}

export interface AuthenticatedLdapUser {
  userId: string;
  displayName: string;
  email?: string;
  roles: UserRole[];
}

export async function authenticateWithLdap(
  username: string,
  password: string
): Promise<AuthenticatedLdapUser> {
  if (!password) {
    // An empty-password bind is treated by some LDAP servers as anonymous and
    // can spuriously succeed — reject before any client is even created.
    throw new InvalidCredentialsError("Empty password");
  }

  const dn = resolveUserDN(username);
  const client = new Client({ url: getLdapUrl(), connectTimeout: CONNECT_TIMEOUT_MS });

  try {
    try {
      await client.bind(dn, password);
    } catch (error) {
      throw classifyLdapError(error);
    }

    const groupCns = await searchGroupCns(client, dn);
    const roles = mapGroupsToRoles(groupCns);
    if (roles.length === 0) {
      throw new InvalidCredentialsError("No recognized role group");
    }

    const { displayName, email } = await fetchDisplayProfile(client, dn, username);

    return { userId: username, displayName, email, roles };
  } finally {
    await client.unbind().catch(() => {});
  }
}

/**
 * Periodic revalidation — no password is ever stored, so this uses an
 * anonymous bind to re-check group membership. Any failure (network down,
 * anonymous read denied by ACL) and a successful-but-empty result both mean
 * "cannot confirm this user still has a role" and must be treated the same
 * way by the caller: destroy the session.
 */
export async function revalidateRoles(userId: string): Promise<UserRole[]> {
  const dn = resolveUserDN(userId);
  const client = new Client({ url: getLdapUrl(), connectTimeout: CONNECT_TIMEOUT_MS });
  try {
    await client.bind("", "");
    const groupCns = await searchGroupCns(client, dn);
    return mapGroupsToRoles(groupCns);
  } finally {
    await client.unbind().catch(() => {});
  }
}
