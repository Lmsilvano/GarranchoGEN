/** Validated before any path join — see src/lib/storage/paths.ts#assertDocumentId */
export type DocumentId = string; // /^[A-Za-z0-9._-]{1,128}$/

export type ProcessingStatus =
  | "uploaded"
  | "enhancing"
  | "enhancementFailed"
  | "awaitingQuota"
  | "transcribing"
  | "transcriptionFailed"
  | "readyForReview"
  | "inReview"
  | "approved"
  | "rejected";

export interface EnhancementConfig {
  contrast: number; // default 1.15 — assumption
  normalize: boolean; // default true
  denoise: boolean; // default true
  sharpen: number; // default 0.5 — assumption
  grayscale: boolean; // default false
}

export interface Document {
  id: DocumentId;
  title: string;
  originalFileName: string;
  mimeType: string;
  status: ProcessingStatus;
  originalPath: string; // relative to data root
  enhancedPath?: string | null;
  enhancedContentHash?: string | null;
  enhancementConfig: EnhancementConfig;
  currentTranscriptionId?: string | null;
  currentTranscriptionVersion?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null; // safe, non-sensitive
  lockedAt?: string | null;
  lockedBy?: string | null;
  nextAttemptAt?: string | null;
  attempts?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/** UI label (pt-BR) per docs/specs/04-contracts.md — display layer only, persisted values stay English */
export const PROCESSING_STATUS_LABELS_PT_BR: Record<ProcessingStatus, string> = {
  uploaded: "Enviado",
  enhancing: "Melhorando imagem",
  enhancementFailed: "Falha na melhoria",
  awaitingQuota: "Aguardando cota de processamento...",
  transcribing: "Transcrevendo",
  transcriptionFailed: "Falha na transcrição",
  readyForReview: "Pronto para revisão",
  inReview: "Em revisão",
  approved: "Aprovado",
  rejected: "Rejeitado",
};

export const DEFAULT_ENHANCEMENT_CONFIG: EnhancementConfig = {
  contrast: 1.15,
  normalize: true,
  denoise: true,
  sharpen: 0.5,
  grayscale: false,
};
