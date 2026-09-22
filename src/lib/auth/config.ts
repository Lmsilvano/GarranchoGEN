import { SessionConfigError } from "./errors";

/**
 * Env accessors for Phase 2 auth. Validation is lazy (first real use, not module
 * import) so importing this file never crashes bundling/build. Edge-safe (pure
 * process.env reads, no Node-only APIs) — shared by middleware and Node routes.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new SessionConfigError(`${name} is not set.`);
  }
  return value;
}

function requirePositiveInt(name: string): number {
  const raw = requireEnv(name);
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new SessionConfigError(`${name} must be a positive integer.`);
  }
  return value;
}

/** iron-session requires a seal password of at least 32 characters. */
export function getSessionSecret(): string {
  const value = requireEnv("SESSION_SECRET");
  if (value.length < 32) {
    throw new SessionConfigError("SESSION_SECRET must be at least 32 characters.");
  }
  return value;
}

// docs/specs/05-auth-ldap.md labels 28800 (8h) as an assumption, not a requirement —
// required here with no silent default so a missing .env value fails loudly.
export function getSessionTtlSeconds(): number {
  return requirePositiveInt("SESSION_TTL_SECONDS");
}

// docs/specs/05-auth-ldap.md labels 3600 (1h) as an assumption, not a requirement.
export function getLdapRevalidateSeconds(): number {
  return requirePositiveInt("LDAP_REVALIDATE_SECONDS");
}

export function getLdapUrl(): string {
  return requireEnv("LDAP_URL");
}

export function getLdapBaseDn(): string {
  return requireEnv("LDAP_BASE_DN");
}

export function getLdapUserDnTemplate(): string {
  const template = requireEnv("LDAP_USER_DN_TEMPLATE");
  if (!template.includes("{uid}")) {
    throw new SessionConfigError("LDAP_USER_DN_TEMPLATE must contain a {uid} placeholder.");
  }
  return template;
}
