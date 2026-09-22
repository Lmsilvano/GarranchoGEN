export const HTR_ERROR_CODES = {
  QUOTA: "HTR_QUOTA",
  TIMEOUT: "HTR_TIMEOUT",
  SCHEMA: "HTR_SCHEMA",
  UPSTREAM_4XX: "HTR_UPSTREAM_4XX",
  UPSTREAM_5XX: "HTR_UPSTREAM_5XX",
  ENHANCED_MISSING: "HTR_ENHANCED_MISSING",
  UNKNOWN: "HTR_UNKNOWN",
} as const;

export type HtrErrorCode = (typeof HTR_ERROR_CODES)[keyof typeof HTR_ERROR_CODES];

export type HtrOutcomeKind =
  | "success"
  | "quota"
  | "timeout"
  | "schema"
  | "upstream4xx"
  | "upstream5xx"
  | "unknown";

export class HtrClientError extends Error {
  readonly kind: HtrOutcomeKind;
  readonly code: HtrErrorCode;
  readonly httpStatus?: number;

  constructor(
    kind: HtrOutcomeKind,
    code: HtrErrorCode,
    message: string,
    httpStatus?: number,
  ) {
    super(message);
    this.name = "HtrClientError";
    this.kind = kind;
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function userMessageForHtrError(code: HtrErrorCode): string {
  switch (code) {
    case HTR_ERROR_CODES.QUOTA:
      return "Cota de processamento temporariamente indisponível. Tentaremos novamente em breve.";
    case HTR_ERROR_CODES.TIMEOUT:
      return "Tempo esgotado na transcrição. Tentaremos novamente.";
    case HTR_ERROR_CODES.SCHEMA:
      return "Resposta da transcrição inválida.";
    case HTR_ERROR_CODES.UPSTREAM_4XX:
      return "Falha na configuração do serviço de transcrição.";
    case HTR_ERROR_CODES.UPSTREAM_5XX:
      return "Serviço de transcrição temporariamente indisponível.";
    case HTR_ERROR_CODES.ENHANCED_MISSING:
      return "Imagem melhorada indisponível.";
    default:
      return "Falha na transcrição.";
  }
}
