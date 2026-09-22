import { getJobLockTtlMs } from "@/config/env";
import { DocumentModel, type DocumentRecord } from "@/models/Document";
import { pipelineLog } from "./log";

/**
 * Atomically claim the next HTR job.
 * Covers `awaitingQuota` (due) and stale-lock reclaim (`transcribing` with expired lockedAt).
 * Sets status to `transcribing`.
 */
export async function claimNextHtrJob(
  instanceId: string,
): Promise<DocumentRecord | null> {
  const ttlMs = getJobLockTtlMs();
  const now = new Date();
  const expiredBefore = new Date(now.getTime() - ttlMs);

  const claimed = await DocumentModel.findOneAndUpdate(
    {
      enhancedPath: { $nin: [null, ""] },
      enhancedContentHash: { $nin: [null, ""] },
      $or: [
        {
          status: "awaitingQuota",
          $and: [
            {
              $or: [
                { nextAttemptAt: null },
                { nextAttemptAt: { $lte: now } },
              ],
            },
            {
              $or: [{ lockedAt: null }, { lockedAt: { $lt: expiredBefore } }],
            },
          ],
        },
        {
          status: "transcribing",
          lockedAt: { $lt: expiredBefore },
        },
      ],
    } as Record<string, unknown>,
    {
      $set: {
        status: "transcribing",
        lockedAt: now,
        lockedBy: instanceId,
      },
      $inc: { attempts: 1 },
    },
    {
      sort: { nextAttemptAt: 1, createdAt: 1 },
      returnDocument: "after",
      lean: true,
    },
  ).exec();

  if (!claimed) return null;

  const record = claimed as unknown as DocumentRecord;

  pipelineLog({
    event: "pipeline.job.claim",
    stage: "htr",
    documentId: String(record._id),
    status: "transcribing",
    lockedBy: instanceId,
  });

  return record;
}
