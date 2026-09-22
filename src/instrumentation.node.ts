import {
  startPipelinePollers,
  stopPipelinePollers,
} from "@/lib/pipeline/poller";

export function registerNodeInstrumentation(): void {
  startPipelinePollers();

  const shutdown = () => {
    void stopPipelinePollers();
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
