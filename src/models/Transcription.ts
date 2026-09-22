import mongoose, { Schema } from "mongoose";
import type {
  MetadataEntityType,
  Transcription as TranscriptionContract,
  UncertainReason,
  UncertainSpanField,
} from "@/types";

const METADATA_ENTITY_TYPES: MetadataEntityType[] = ["person", "date", "place", "event", "kinship", "other"];
const UNCERTAIN_SPAN_FIELDS: UncertainSpanField[] = ["literalTranscription", "modernizedTranscription"];
const UNCERTAIN_REASONS: UncertainReason[] = ["illegible", "ambiguous", "damaged", "reviewerFlag"];

/** Mongo-only hash for HTR idempotency — stripped from toJSON (not in public Transcription contract). */
export type TranscriptionRecord = Omit<TranscriptionContract, "id"> & {
  enhancedContentHash?: string | null;
};

const metadataEntitySchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true, enum: METADATA_ENTITY_TYPES },
    label: { type: String, required: true },
    value: { type: String, required: true },
    normalizedValue: { type: String, default: null },
    uncertain: { type: Boolean, default: false },
  },
  { _id: false },
);

const uncertainSpanSchema = new Schema(
  {
    field: { type: String, required: true, enum: UNCERTAIN_SPAN_FIELDS },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    reason: { type: String, required: true, enum: UNCERTAIN_REASONS },
    source: { type: String, required: true, enum: ["model", "reviewer"] },
  },
  { _id: false },
);

const transcriptionSchema = new Schema<TranscriptionRecord>(
  {
    documentId: { type: String, required: true },
    version: { type: Number, required: true },
    literalTranscription: { type: String, required: true },
    modernizedTranscription: { type: String, required: true },
    structuredMetadata: { type: [metadataEntitySchema], default: [] },
    uncertainSpans: { type: [uncertainSpanSchema], default: [] },
    detectedLanguage: {
      type: String,
      enum: ["pt", "la", "es", "other", "unknown"],
      required: false,
    },
    createdBy: { type: String, required: true },
    source: { type: String, required: true, enum: ["htr", "human"] },
    // Mongo-only: HTR idempotency key (documentId + enhanced hash). Not in public contract.
    enhancedContentHash: { type: String, default: null },
  },
  {
    collection: "transcriptions",
    timestamps: { createdAt: true, updatedAt: false }, // versions are immutable, no updatedAt in the contract
  },
);

transcriptionSchema.index({ documentId: 1, version: -1 }, { unique: true });
transcriptionSchema.index({ documentId: 1, createdAt: -1 });
transcriptionSchema.index({ documentId: 1, enhancedContentHash: 1, source: 1 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose's generated transform type can't be narrowed to a plain record.
function toContractShape(_doc: unknown, ret: any) {
  ret.id = String(ret._id);
  delete ret._id;
  delete ret.__v;
  delete ret.enhancedContentHash;
  if (ret.createdAt instanceof Date) {
    ret.createdAt = (ret.createdAt as Date).toISOString();
  }
  return ret;
}

transcriptionSchema.set("toJSON", { virtuals: true, transform: toContractShape });
transcriptionSchema.set("toObject", { virtuals: true, transform: toContractShape });

export const TranscriptionModel =
  (mongoose.models.Transcription as mongoose.Model<TranscriptionRecord>) ||
  mongoose.model<TranscriptionRecord>("Transcription", transcriptionSchema);
