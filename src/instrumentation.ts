export async function register(): Promise<void> {

  if (process.env.NEXT_RUNTIME === "edge") return;



  const { startPipelinePollers, stopPipelinePollers } = await import(

    "@/lib/pipeline/poller"

  );



  startPipelinePollers();



  const shutdown = () => {

    void stopPipelinePollers();

  };

  process.once("SIGTERM", shutdown);

  process.once("SIGINT", shutdown);

}

