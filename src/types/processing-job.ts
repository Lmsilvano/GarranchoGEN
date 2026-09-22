import type { DocumentId } from "./document";

/**
 * Type only — v1 uses the document-based queue (Document.status/lockedAt/lockedBy/
 * nextAttemptAt/attempts). The `processing_jobs` collection is deferred (docs/specs/06-data-model.md).
 */
export interface ProcessingJob {
  id: string;
  documentId: DocumentId;
  stage: "enhance" | "htr";
  status: "pending" | "running" | "succeeded" | "failed" | "waitingQuota";
  attempts: number;
  nextAttemptAt?: string | null;
  lastErrorCode?: string | null;
  createdAt: string;
  updatedAt: string;
}
