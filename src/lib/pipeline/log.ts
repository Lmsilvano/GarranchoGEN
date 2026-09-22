type PipelineEvent =
  | "pipeline.stage.start"
  | "pipeline.stage.end"
  | "pipeline.stage.fail"
  | "pipeline.job.claim"
  | "pipeline.quota.wait";
interface PipelineLogFields {
  event: PipelineEvent;
  stage?: "enhance" | "htr";
  documentId?: string;
  status?: string;
  errorCode?: string;
  [key: string]: unknown;
}

/** Minimal structured logger — replaced by src/lib/obs/* in Phase 8. */
export function pipelineLog(fields: PipelineLogFields): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      ...fields,
    }),
  );
}
