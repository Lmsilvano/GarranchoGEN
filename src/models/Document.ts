import mongoose, { Schema } from "mongoose";
import { DEFAULT_ENHANCEMENT_CONFIG, type Document as DocumentContract, type ProcessingStatus } from "@/types";

const PROCESSING_STATUS_VALUES: ProcessingStatus[] = [
  "uploaded",
  "enhancing",
  "enhancementFailed",
  "awaitingQuota",
  "transcribing",
  "transcriptionFailed",
  "readyForReview",
  "inReview",
  "approved",
  "rejected",
];

/** `_id` carries the documentId string, so the contract's `id` field is derived, not stored. */
export interface DocumentRecord extends Omit<DocumentContract, "id"> {
  _id: string;
}

const enhancementConfigSchema = new Schema(
  {
    contrast: { type: Number, required: true, default: DEFAULT_ENHANCEMENT_CONFIG.contrast },
    normalize: { type: Boolean, required: true, default: DEFAULT_ENHANCEMENT_CONFIG.normalize },
    denoise: { type: Boolean, required: true, default: DEFAULT_ENHANCEMENT_CONFIG.denoise },
    sharpen: { type: Number, required: true, default: DEFAULT_ENHANCEMENT_CONFIG.sharpen },
    grayscale: { type: Boolean, required: true, default: DEFAULT_ENHANCEMENT_CONFIG.grayscale },
  },
  { _id: false },
);

// lockedAt/nextAttemptAt are stored as Date (needed for correct range queries by the poller)
// and serialized to ISO strings in toJSON/toObject to match the Document contract.
const documentSchema = new Schema<DocumentRecord>(
  {
    _id: { type: String }, // documentId — makes `{ id: 1 }` unique implicit via Mongo's _id index
    title: { type: String, required: true },
    originalFileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: PROCESSING_STATUS_VALUES,
      default: "uploaded",
    },
    originalPath: { type: String, required: true },
    enhancedPath: { type: String, default: null },
    enhancedContentHash: { type: String, default: null },
    enhancementConfig: {
      type: enhancementConfigSchema,
      required: true,
      default: () => ({ ...DEFAULT_ENHANCEMENT_CONFIG }),
    },
    currentTranscriptionId: { type: String, default: null },
    currentTranscriptionVersion: { type: Number, default: null },
    errorCode: { type: String, default: null },
    errorMessage: { type: String, default: null },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null },
    nextAttemptAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    createdBy: { type: String, required: true },
  },
  {
    collection: "documents",
    timestamps: true, // manages createdAt/updatedAt as Date; serialized to ISO strings below
  },
);

documentSchema.index({ status: 1, nextAttemptAt: 1 });
documentSchema.index({ status: 1, lockedAt: 1 });
documentSchema.index({ createdBy: 1, createdAt: -1 });
documentSchema.index({ updatedAt: -1 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose's generated transform type can't be narrowed to a plain record.
function toContractShape(_doc: unknown, ret: any) {
  ret.id = ret._id;
  delete ret._id;
  delete ret.__v;
  for (const key of ["createdAt", "updatedAt", "lockedAt", "nextAttemptAt"]) {
    if (ret[key] instanceof Date) {
      ret[key] = (ret[key] as Date).toISOString();
    }
  }
  return ret;
}

documentSchema.set("toJSON", { virtuals: true, transform: toContractShape });
documentSchema.set("toObject", { virtuals: true, transform: toContractShape });

export const DocumentModel =
  (mongoose.models.Document as mongoose.Model<DocumentRecord>) ||
  mongoose.model<DocumentRecord>("Document", documentSchema);
