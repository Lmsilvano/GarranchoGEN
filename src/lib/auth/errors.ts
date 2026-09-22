import { NextResponse } from "next/server";

import type { ApiErrorBody } from "@/types";

/** Never reveal whether the uid exists, or distinguish bad-format vs bad-password. */
export class InvalidCredentialsError extends Error {
  constructor(message = "Invalid credentials") {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

export class LdapUnavailableError extends Error {
  constructor(message = "LDAP unavailable") {
    super(message);
    this.name = "LdapUnavailableError";
  }
}

/** Server misconfiguration (missing/invalid env var). Never client-facing verbatim. */
export class SessionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionConfigError";
  }
}

// Exact strings asserted by tests (docs/specs/05-auth-ldap.md failure table).
export const INVALID_CREDENTIALS_MESSAGE = "Credenciais inválidas.";
export const LDAP_UNAVAILABLE_MESSAGE = "Serviço de autenticação indisponível.";
// Not pinned by the spec (covers "no session"/"session destroyed" cases distinct
// from a rejected login attempt), chosen for semantic accuracy.
export const UNAUTHENTICATED_MESSAGE = "Não autenticado.";
export const INVALID_LOGIN_BODY_MESSAGE = "Dados de login inválidos.";

export function jsonError(
  status: number,
  code: string,
  message: string
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status });
}
