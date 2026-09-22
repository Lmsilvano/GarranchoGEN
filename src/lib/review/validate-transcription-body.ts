import type {
  MetadataEntity,
  MetadataEntityType,
  SaveTranscriptionRequest,
  UncertainReason,
  UncertainSpan,
  UncertainSpanField,
} from "@/types";

const METADATA_ENTITY_TYPES: MetadataEntityType[] = ["person", "date", "place", "event", "kinship", "other"];
const UNCERTAIN_SPAN_FIELDS: UncertainSpanField[] = ["literalTranscription", "modernizedTranscription"];
const UNCERTAIN_REASONS: UncertainReason[] = ["illegible", "ambiguous", "damaged", "reviewerFlag"];
const UNCERTAIN_SOURCES = ["model", "reviewer"] as const;

function isMetadataEntity(value: unknown): value is MetadataEntity {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.label !== "string" || typeof v.value !== "string") return false;
  if (!METADATA_ENTITY_TYPES.includes(v.type as MetadataEntityType)) return false;
  if (v.normalizedValue !== undefined && v.normalizedValue !== null && typeof v.normalizedValue !== "string") {
    return false;
  }
  if (v.uncertain !== undefined && typeof v.uncertain !== "boolean") return false;
  return true;
}

function isUncertainSpan(value: unknown): value is UncertainSpan {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.start !== "number" || typeof v.end !== "number") return false;
  if (!UNCERTAIN_SPAN_FIELDS.includes(v.field as UncertainSpanField)) return false;
  if (!UNCERTAIN_REASONS.includes(v.reason as UncertainReason)) return false;
  if (!UNCERTAIN_SOURCES.includes(v.source as (typeof UNCERTAIN_SOURCES)[number])) return false;
  return true;
}

/** Checagem manual de tipo, seguindo o estilo de validação sem zod já usado no projeto (ver rota auth/login). */
export function parseSaveTranscriptionBody(body: unknown): SaveTranscriptionRequest | null {
  if (!body || typeof body !== "object") return null;
  const v = body as Record<string, unknown>;

  if (typeof v.literalTranscription !== "string" || typeof v.modernizedTranscription !== "string") {
    return null;
  }
  if (!Array.isArray(v.structuredMetadata) || !v.structuredMetadata.every(isMetadataEntity)) {
    return null;
  }
  if (!Array.isArray(v.uncertainSpans) || !v.uncertainSpans.every(isUncertainSpan)) {
    return null;
  }
  if (v.expectedVersion !== null && typeof v.expectedVersion !== "number") {
    return null;
  }

  return {
    literalTranscription: v.literalTranscription,
    modernizedTranscription: v.modernizedTranscription,
    structuredMetadata: v.structuredMetadata as MetadataEntity[],
    uncertainSpans: v.uncertainSpans as UncertainSpan[],
    expectedVersion: v.expectedVersion as number | null,
  };
}
