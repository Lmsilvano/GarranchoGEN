import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  getDataDir,
  getEnhancementWorkerPoolSize,
  getJobLockTtlMs,
} from "@/config/env";
import {
  getEnhancementPool,
  getPipelineInstanceId,
} from "@/lib/enhancement/worker-pool";
import { moveIntoPlace } from "@/lib/storage/atomic-write";
import { assertDocumentId, getEnhancedDir, getTmpDir } from "@/lib/storage/paths";
import { DocumentModel, type DocumentRecord } from "@/models/Document";
import {
  DEFAULT_ENHANCEMENT_CONFIG,
  type EnhancementConfig,
  type ProcessingStatus,
} from "@/types";
import { claimNextEnhanceJob } from "./enhance-claim";
import { pipelineLog } from "./log";
import { assertTransition } from "./state-machine";

function enhancedRelativePath(documentId: string): string {
  return `documents/${documentId}/enhanced/enhanced.webp`;
}

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

async function markEnhancementFailed(
  documentId: string,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  assertTransition("enhancing", "enhancementFailed");
  await DocumentModel.updateOne(
    { _id: documentId, status: "enhancing" },
    {
      $set: {
        status: "enhancementFailed" satisfies ProcessingStatus,
        errorCode,
        errorMessage,
        lockedAt: null,
        lockedBy: null,
      },
    },
  ).exec();
}

async function markEnhancementSuccess(
  documentId: string,
  enhancedPath: string,
  enhancedContentHash: string,
): Promise<void> {
  // Phase 5 handoff: no Gemini yet → awaitingQuota for Phase 6 HTR poller.
  assertTransition("enhancing", "awaitingQuota");
  await DocumentModel.updateOne(
    { _id: documentId, status: "enhancing" },
    {
      $set: {
        status: "awaitingQuota" satisfies ProcessingStatus,
        enhancedPath,
        enhancedContentHash,
        errorCode: null,
        errorMessage: null,
        lockedAt: null,
        lockedBy: null,
        // Reset attempt counter for HTR stage (Phase 6).
        attempts: 0,
        nextAttemptAt: null,
        // Invalidate prior HTR when enhanced hash changes (idempotency rule 2).
        currentTranscriptionId: null,
        currentTranscriptionVersion: null,
      },
    },
  ).exec();
}

export async function runEnhancementForDocument(doc: DocumentRecord): Promise<void> {
  const documentId = assertDocumentId(String(doc._id));
  const config: EnhancementConfig = {
    ...DEFAULT_ENHANCEMENT_CONFIG,
    ...(doc.enhancementConfig ?? {}),
  };

  pipelineLog({
    event: "pipeline.stage.start",
    stage: "enhance",
    documentId,
  });

  let inputPath: string;
  try {
    inputPath = resolveUnderDataDir(doc.originalPath);
  } catch {
    await markEnhancementFailed(
      documentId,
      "ENHANCE_ORIGINAL_MISSING",
      "Arquivo original indisponível.",
    );
    pipelineLog({
      event: "pipeline.stage.fail",
      stage: "enhance",
      documentId,
      errorCode: "ENHANCE_ORIGINAL_MISSING",
    });
    return;
  }

  try {
    await fs.access(inputPath);
  } catch {
    await markEnhancementFailed(
      documentId,
      "ENHANCE_ORIGINAL_MISSING",
      "Arquivo original indisponível.",
    );
    pipelineLog({
      event: "pipeline.stage.fail",
      stage: "enhance",
      documentId,
      errorCode: "ENHANCE_ORIGINAL_MISSING",
    });
    return;
  }

  const tmpDir = getTmpDir(documentId);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(getEnhancedDir(documentId), { recursive: true });

  const outputTmpPath = path.join(tmpDir, `${randomUUID()}.webp`);
  const finalPath = path.join(getEnhancedDir(documentId), "enhanced.webp");
  const relativeEnhanced = enhancedRelativePath(documentId);

  const pool = getEnhancementPool(getEnhancementWorkerPoolSize(), getJobLockTtlMs());
  const result = await pool.runEnhancement({
    inputPath,
    outputTmpPath,
    config,
  });

  if (!result.ok) {
    await fs.unlink(outputTmpPath).catch(() => undefined);
    await markEnhancementFailed(documentId, result.errorCode, result.errorMessage);
    pipelineLog({
      event: "pipeline.stage.fail",
      stage: "enhance",
      documentId,
      errorCode: result.errorCode,
      detail: result.detail,
    });
    return;
  }

  try {
    await moveIntoPlace(documentId, outputTmpPath, finalPath);
  } catch (error) {
    await fs.unlink(outputTmpPath).catch(() => undefined);
    const code = (error as NodeJS.ErrnoException)?.code;
    await markEnhancementFailed(
      documentId,
      code === "ENOSPC" ? "STORAGE_FULL" : "ENHANCE_WRITE_FAILED",
      code === "ENOSPC"
        ? "Armazenamento indisponível. Tente novamente mais tarde."
        : "Falha ao gravar a imagem melhorada.",
    );
    pipelineLog({
      event: "pipeline.stage.fail",
      stage: "enhance",
      documentId,
      errorCode: code === "ENOSPC" ? "STORAGE_FULL" : "ENHANCE_WRITE_FAILED",
    });
    return;
  }

  await markEnhancementSuccess(documentId, relativeEnhanced, result.contentHash);
  pipelineLog({
    event: "pipeline.stage.end",
    stage: "enhance",
    documentId,
    status: "awaitingQuota",
  });
}

/** Claim one job (if any) and run enhancement. Returns true if a job was claimed. */
export async function processNextEnhanceJob(): Promise<boolean> {
  const instanceId = getPipelineInstanceId();
  const claimed = await claimNextEnhanceJob(instanceId);
  if (!claimed) return false;
  await runEnhancementForDocument(claimed);
  return true;
}
