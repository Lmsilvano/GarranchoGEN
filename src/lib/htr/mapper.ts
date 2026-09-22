import { randomUUID } from "node:crypto";

import type { HtrModelResponse, MetadataEntity, Transcription, UncertainSpan } from "@/types";

export interface MapHtrOptions {
  documentId: string;
  version: number;
  createdBy: string;
}

/**
 * Maps validated wire JSON to a Transcription-shaped payload (without Mongo id/createdAt).
 */
export function mapHtrToTranscription(
  response: HtrModelResponse,
  opts: MapHtrOptions,
): Omit<Transcription, "id" | "createdAt"> {
  const structuredMetadata: MetadataEntity[] = response.structuredMetadata.map((entity) => ({
    id: randomUUID(),
    type: entity.type,
    label: entity.label,
    value: entity.value,
    normalizedValue: entity.normalizedValue ?? null,
    uncertain: entity.uncertain,
  }));

  const uncertainSpans: UncertainSpan[] = response.uncertainSpans.map((span) => ({
    field: span.field,
    start: span.start,
    end: span.end,
    reason: span.reason,
    source: "model" as const,
  }));

  return {
    documentId: opts.documentId,
    version: opts.version,
    literalTranscription: response.literalTranscription,
    modernizedTranscription: response.modernizedTranscription,
    structuredMetadata,
    uncertainSpans,
    detectedLanguage: response.detectedLanguage,
    createdBy: opts.createdBy,
    source: "htr",
  };
}
