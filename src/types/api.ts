import type { Document, ProcessingStatus } from "./document";
import type { MetadataEntity, Transcription, UncertainSpan } from "./transcription";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string; // pt-BR for user-facing routes
  };
}

/** GET /api/documents/:id/status */
export interface DocumentStatusResponse {
  status: ProcessingStatus;
  labelPtBr: string;
  updatedAt: string;
}

/** POST /api/documents/:id/claim — idempotent readyForReview -> inReview. */
export interface ClaimDocumentResponse {
  document: Document;
}

/** GET /api/documents/:id/transcriptions */
export interface TranscriptionListResponse {
  transcriptions: Transcription[];
}

/**
 * PUT /api/documents/:id/transcriptions/current — request body.
 * `expectedVersion` is the optimistic-concurrency token: the
 * `currentTranscriptionVersion` the client last loaded (null when the
 * document has no transcription yet).
 */
export interface SaveTranscriptionRequest {
  literalTranscription: string;
  modernizedTranscription: string;
  structuredMetadata: MetadataEntity[];
  uncertainSpans: UncertainSpan[];
  expectedVersion: number | null;
}

export interface SaveTranscriptionResponse {
  transcription: Transcription;
  document: Document;
}

/** POST /api/documents/:id/approve — request body. */
export interface ApproveDocumentRequest {
  expectedVersion: number | null;
}

export interface ApproveDocumentResponse {
  document: Document;
}
