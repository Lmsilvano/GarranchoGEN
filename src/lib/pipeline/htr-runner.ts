import fs from "node:fs/promises";
import path from "node:path";

import {
  getDataDir,
  getGeminiMaxAttempts,
  getGeminiMaxConcurrent,
  getGeminiRetryBaseMs,
  getGeminiRetryMaxMs,
} from "@/config/env";
import { getPipelineInstanceId } from "@/lib/enhancement/worker-pool";
import { transcribePage } from "@/lib/htr/client";
import {
  HTR_ERROR_CODES,
  HtrClientError,
  userMessageForHtrError,
  type HtrErrorCode,
} from "@/lib/htr/errors";
import { mapHtrToTranscription } from "@/lib/htr/mapper";
import { assertDocumentId } from "@/lib/storage/paths";
import { DocumentModel, type DocumentRecord } from "@/models/Document";
import { TranscriptionModel } from "@/models/Transcription";
import type { ProcessingStatus } from "@/types";

import {
  getGeminiInFlight,
  releaseGeminiSlot,
  tryAcquireGeminiSlot,
} from "./gemini-gate";
import { claimNextHtrJob } from "./htr-claim";
import { pipelineLog } from "./log";
import { assertTransition } from "./state-machine";

function resolveUnderDataDir(relativePath: string): string {
  if (relativePath.includes("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid relative path");
  }
  const root = path.resolve(getDataDir());
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Resolved path escapes DATA_DIR");
  }
  return resolved;
}

export function computeHtrBackoffMs(attempts: number): number {
  const base = getGeminiRetryBaseMs();
  const max = getGeminiRetryMaxMs();
  const exp = Math.min(max, base * 2 ** Math.max(0, attempts - 1));
  const jitter = Math.floor(Math.random() * Math.min(1000, base));
  return Math.min(max, exp + jitter);
}

async function markAwaitingQuota(
  documentId: string,
  errorCode: HtrErrorCode | string,
  errorMessage: string,
  attempts: number,
): Promise<void> {
  assertTransition("transcribing", "awaitingQuota");
  const delayMs = computeHtrBackoffMs(attempts);
  const nextAttemptAt = new Date(Date.now() + delayMs);

  pipelineLog({
    event: "pipeline.quota.wait",
    stage: "htr",
    documentId,
    errorCode,
    nextAttemptAt: nextAttemptAt.toISOString(),
    attempts,
  });

  await DocumentModel.updateOne(
    { _id: documentId, status: "transcribing" },
    {
      $set: {
        status: "awaitingQuota" satisfies ProcessingStatus,
        errorCode,
        errorMessage,
        lockedAt: null,
        lockedBy: null,
        nextAttemptAt,
      },
    },
  ).exec();
}

async function markTranscriptionFailed(
  documentId: string,
  errorCode: HtrErrorCode,
  errorMessage: string,
): Promise<void> {
  assertTransition("transcribing", "transcriptionFailed");
  await DocumentModel.updateOne(
    { _id: documentId, status: "transcribing" },
    {
      $set: {
        status: "transcriptionFailed" satisfies ProcessingStatus,
        errorCode,
        errorMessage,
        lockedAt: null,
        lockedBy: null,
        nextAttemptAt: null,
      },
    },
  ).exec();
}

async function markReadyForReview(
  documentId: string,
  transcriptionId: string,
  version: number,
): Promise<void> {
  assertTransition("transcribing", "readyForReview");
  await DocumentModel.updateOne(
    { _id: documentId, status: "transcribing" },
    {
      $set: {
        status: "readyForReview" satisfies ProcessingStatus,
        currentTranscriptionId: transcriptionId,
        currentTranscriptionVersion: version,
        errorCode: null,
        errorMessage: null,
        lockedAt: null,
        lockedBy: null,
        nextAttemptAt: null,
      },
    },
  ).exec();
}

async function findExistingHtrForHash(
  documentId: string,
  enhancedContentHash: string,
) {
  return TranscriptionModel.findOne({
    documentId,
    enhancedContentHash,
    source: "htr",
  })
    .sort({ version: -1 })
    .exec();
}

async function nextTranscriptionVersion(documentId: string): Promise<number> {
  const latest = await TranscriptionModel.findOne({ documentId })
    .sort({ version: -1 })
    .select({ version: 1 })
    .lean()
    .exec();
  return (latest?.version ?? 0) + 1;
}

/**
 * Re-queue when local gate is full. Does not burn GEMINI_MAX_ATTEMPTS.
 */
async function requeueGateFull(documentId: string): Promise<void> {
  assertTransition("transcribing", "awaitingQuota");
  const nextAttemptAt = new Date(Date.now() + 500);
  pipelineLog({
    event: "pipeline.quota.wait",
    stage: "htr",
    documentId,
    errorCode: "GATE_FULL",
    nextAttemptAt: nextAttemptAt.toISOString(),
  });
  await DocumentModel.updateOne(
    { _id: documentId, status: "transcribing" },
    {
      $set: {
        status: "awaitingQuota" satisfies ProcessingStatus,
        lockedAt: null,
        lockedBy: null,
        nextAttemptAt,
      },
      $inc: { attempts: -1 },
    },
  ).exec();
}

export async function runHtrForDocument(doc: DocumentRecord): Promise<void> {
  const documentId = assertDocumentId(String(doc._id));
  const enhancedHash = doc.enhancedContentHash;
  const enhancedPath = doc.enhancedPath;
  const attempts = doc.attempts ?? 1;
  const maxAttempts = getGeminiMaxAttempts();

  pipelineLog({
    event: "pipeline.stage.start",
    stage: "htr",
    documentId,
  });

  if (!enhancedHash || !enhancedPath) {
    await markTranscriptionFailed(
      documentId,
      HTR_ERROR_CODES.ENHANCED_MISSING,
      userMessageForHtrError(HTR_ERROR_CODES.ENHANCED_MISSING),
    );
    pipelineLog({
      event: "pipeline.stage.fail",
      stage: "htr",
      documentId,
      errorCode: HTR_ERROR_CODES.ENHANCED_MISSING,
    });
    return;
  }

  const existing = await findExistingHtrForHash(documentId, enhancedHash);
  if (existing) {
    const tid = String(existing._id);
    await markReadyForReview(documentId, tid, existing.version);
    pipelineLog({
      event: "pipeline.stage.end",
      stage: "htr",
      documentId,
      status: "readyForReview",
      detail: "idempotent_skip",
    });
    return;
  }

  let absoluteEnhanced: string;
  try {
    absoluteEnhanced = resolveUnderDataDir(enhancedPath);
    await fs.access(absoluteEnhanced);
  } catch {
    await markTranscriptionFailed(
      documentId,
      HTR_ERROR_CODES.ENHANCED_MISSING,
      userMessageForHtrError(HTR_ERROR_CODES.ENHANCED_MISSING),
    );
    pipelineLog({
      event: "pipeline.stage.fail",
      stage: "htr",
      documentId,
      errorCode: HTR_ERROR_CODES.ENHANCED_MISSING,
    });
    return;
  }

  const maxConcurrent = getGeminiMaxConcurrent();
  if (!tryAcquireGeminiSlot(maxConcurrent)) {
    await requeueGateFull(documentId);
    return;
  }

  try {
    const imageBytes = await fs.readFile(absoluteEnhanced);
    const response = await transcribePage({
      imageBytes,
      mimeType: "image/webp",
    });

    const version = await nextTranscriptionVersion(documentId);
    const mapped = mapHtrToTranscription(response, {
      documentId,
      version,
      createdBy: doc.createdBy,
    });

    const created = await TranscriptionModel.create({
      ...mapped,
      enhancedContentHash: enhancedHash,
    });

    await markReadyForReview(documentId, String(created._id), version);
    pipelineLog({
      event: "pipeline.stage.end",
      stage: "htr",
      documentId,
      status: "readyForReview",
    });
  } catch (error: unknown) {
    const htrError =
      error instanceof HtrClientError
        ? error
        : new HtrClientError(
            "unknown",
            HTR_ERROR_CODES.UNKNOWN,
            error instanceof Error
              ? error.message.slice(0, 200)
              : "Unknown HTR error",
          );

    const message = userMessageForHtrError(htrError.code);

    if (htrError.kind === "quota") {
      await markAwaitingQuota(documentId, htrError.code, message, attempts);
      pipelineLog({
        event: "pipeline.stage.fail",
        stage: "htr",
        documentId,
        errorCode: htrError.code,
        status: "awaitingQuota",
      });
      return;
    }

    if (htrError.kind === "upstream4xx") {
      await markTranscriptionFailed(documentId, htrError.code, message);
      pipelineLog({
        event: "pipeline.stage.fail",
        stage: "htr",
        documentId,
        errorCode: htrError.code,
        status: "transcriptionFailed",
      });
      return;
    }

    if (attempts < maxAttempts) {
      await markAwaitingQuota(documentId, htrError.code, message, attempts);
      pipelineLog({
        event: "pipeline.stage.fail",
        stage: "htr",
        documentId,
        errorCode: htrError.code,
        status: "awaitingQuota",
      });
      return;
    }

    await markTranscriptionFailed(documentId, htrError.code, message);
    pipelineLog({
      event: "pipeline.stage.fail",
      stage: "htr",
      documentId,
      errorCode: htrError.code,
      status: "transcriptionFailed",
    });
  } finally {
    releaseGeminiSlot();
  }
}

/** Claim one HTR job when a gate slot is free and run it. Returns true if claimed. */
export async function processNextHtrJob(): Promise<boolean> {
  const maxConcurrent = getGeminiMaxConcurrent();
  if (getGeminiInFlight() >= maxConcurrent) {
    return false;
  }

  const instanceId = getPipelineInstanceId();
  const claimed = await claimNextHtrJob(instanceId);
  if (!claimed) return false;
  await runHtrForDocument(claimed);
  return true;
}
