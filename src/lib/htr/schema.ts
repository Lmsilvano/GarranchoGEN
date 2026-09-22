import { z } from "zod";

import type { HtrModelResponse } from "@/types";

const metadataEntityTypeSchema = z.enum([
  "person",
  "date",
  "place",
  "event",
  "kinship",
  "other",
]);

const uncertainSpanFieldSchema = z.enum([
  "literalTranscription",
  "modernizedTranscription",
]);

/** Model reasons only — reviewerFlag is never produced by HTR. */
const modelUncertainReasonSchema = z.enum(["illegible", "ambiguous", "damaged"]);

const detectedLanguageSchema = z.enum(["pt", "la", "es", "other", "unknown"]);

export const htrModelResponseSchema = z.object({
  literalTranscription: z.string(),
  modernizedTranscription: z.string(),
  structuredMetadata: z.array(
    z.object({
      type: metadataEntityTypeSchema,
      label: z.string(),
      value: z.string(),
      normalizedValue: z.string().nullable().optional(),
      uncertain: z.boolean().optional(),
    }),
  ),
  uncertainSpans: z.array(
    z.object({
      field: uncertainSpanFieldSchema,
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
      reason: modelUncertainReasonSchema,
    }),
  ),
  detectedLanguage: detectedLanguageSchema.optional(),
});

export type ParsedHtrModelResponse = z.infer<typeof htrModelResponseSchema>;

export function parseHtrModelResponse(raw: unknown): HtrModelResponse {
  return htrModelResponseSchema.parse(raw) as HtrModelResponse;
}

/** JSON Schema for Gemini structured output (aligned to HtrModelResponse). */
export const HTR_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    literalTranscription: { type: "string" },
    modernizedTranscription: { type: "string" },
    structuredMetadata: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["person", "date", "place", "event", "kinship", "other"],
          },
          label: { type: "string" },
          value: { type: "string" },
          normalizedValue: { type: ["string", "null"] },
          uncertain: { type: "boolean" },
        },
        required: ["type", "label", "value"],
      },
    },
    uncertainSpans: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: {
            type: "string",
            enum: ["literalTranscription", "modernizedTranscription"],
          },
          start: { type: "integer", minimum: 0 },
          end: { type: "integer", minimum: 0 },
          reason: {
            type: "string",
            enum: ["illegible", "ambiguous", "damaged"],
          },
        },
        required: ["field", "start", "end", "reason"],
      },
    },
    detectedLanguage: {
      type: "string",
      enum: ["pt", "la", "es", "other", "unknown"],
    },
  },
  required: [
    "literalTranscription",
    "modernizedTranscription",
    "structuredMetadata",
    "uncertainSpans",
  ],
} as const;
