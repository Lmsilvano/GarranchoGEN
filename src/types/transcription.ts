import type { DocumentId } from "./document";

export type MetadataEntityType = "person" | "date" | "place" | "event" | "kinship" | "other";

export type UncertainSpanField = "literalTranscription" | "modernizedTranscription";

export type UncertainReason = "illegible" | "ambiguous" | "damaged" | "reviewerFlag";

export interface UncertainSpan {
  field: UncertainSpanField;
  start: number; // inclusive UTF-16 index in field string
  end: number; // exclusive
  reason: UncertainReason;
  source: "model" | "reviewer";
}

export interface MetadataEntity {
  id: string;
  type: MetadataEntityType;
  label: string;
  value: string;
  normalizedValue?: string | null;
  uncertain?: boolean;
}

export interface Transcription {
  id: string;
  documentId: DocumentId;
  version: number; // monotonic per document, starting at 1
  literalTranscription: string;
  modernizedTranscription: string;
  structuredMetadata: MetadataEntity[];
  uncertainSpans: UncertainSpan[];
  detectedLanguage?: "pt" | "la" | "es" | "other" | "unknown";
  createdAt: string; // ISO-8601
  createdBy: string; // LDAP uid or dn
  source: "htr" | "human";
}
