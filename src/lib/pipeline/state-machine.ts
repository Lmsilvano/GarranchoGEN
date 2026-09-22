import type { ProcessingStatus } from "@/types";

/**
 * Allowed transitions from docs/specs/01-pipeline.md (normative).
 * Illegal transitions must be rejected by assertTransition (unit-tested).
 */
const ALLOWED: Record<ProcessingStatus, readonly ProcessingStatus[]> = {
  uploaded: ["enhancing"],
  enhancing: ["enhancementFailed", "awaitingQuota", "transcribing"],
  enhancementFailed: ["uploaded", "enhancing"],
  awaitingQuota: ["transcribing", "awaitingQuota"],
  transcribing: ["readyForReview", "awaitingQuota", "transcriptionFailed"],
  transcriptionFailed: ["awaitingQuota", "transcribing"],
  readyForReview: ["inReview"],
  inReview: ["approved", "readyForReview"],
  approved: [],
  rejected: [],
};

export function isValidTransition(from: ProcessingStatus, to: ProcessingStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: ProcessingStatus, to: ProcessingStatus): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`Illegal status transition: ${from} → ${to}`);
  }
}

export function getAllowedTransitions(from: ProcessingStatus): readonly ProcessingStatus[] {
  return ALLOWED[from];
}
