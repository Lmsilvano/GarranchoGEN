import { getJobLockTtlMs } from "@/config/env";
import { DocumentModel, type DocumentRecord } from "@/models/Document";
import { pipelineLog } from "./log";

/**
 * Atomically claim the next enhance job.
 * Covers first claim (`uploaded`) and stale-lock reclaim (`enhancing` with expired lockedAt).
 * Sets status to `enhancing`.
 */
export async function claimNextEnhanceJob(
  instanceId: string,
): Promise<DocumentRecord | null> {
  const ttlMs = getJobLockTtlMs();
  const now = new Date();
  const expiredBefore = new Date(now.getTime() - ttlMs);

  // Cast: DocumentRecord types lockedAt as ISO string (contract), but the schema stores Date.
  // lean: true keeps `_id` (toObject transform would rename it to `id`).
  const claimed = await DocumentModel.findOneAndUpdate(
    {
      status: { $in: ["uploaded", "enhancing"] },
      $or: [{ lockedAt: null }, { lockedAt: { $lt: expiredBefore } }],
    } as Record<string, unknown>,
    {
      $set: {
        status: "enhancing",
        lockedAt: now,
        lockedBy: instanceId,
      },
      $inc: { attempts: 1 },
    },
    {
      sort: { createdAt: 1 },
      returnDocument: "after",
      lean: true,
    },
  ).exec();

  if (!claimed) return null;

  const record = claimed as unknown as DocumentRecord;

  pipelineLog({
    event: "pipeline.job.claim",
    stage: "enhance",
    documentId: String(record._id),
    status: "enhancing",
    lockedBy: instanceId,
  });

  return record;
}
