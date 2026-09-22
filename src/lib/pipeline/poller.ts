import {

  getEnhancementWorkerPoolSize,

  getGeminiApiKey,

  getGeminiMaxConcurrent,

  getJobLockTtlMs,

  getJobPollIntervalMs,

} from "@/config/env";

import {

  getEnhancementPool,

  getPipelineInstanceId,

} from "@/lib/enhancement/worker-pool";

import { connectToDatabase } from "@/lib/db/connection";

import { claimNextEnhanceJob } from "./enhance-claim";

import { runEnhancementForDocument } from "./enhance-runner";

import { getGeminiInFlight } from "./gemini-gate";

import { claimNextHtrJob } from "./htr-claim";

import { runHtrForDocument } from "./htr-runner";

import { pipelineLog } from "./log";



declare global {

  // eslint-disable-next-line no-var

  var __garranchogenEnhancePoller:

    | {

        timer: ReturnType<typeof setInterval> | null;

        inFlight: number;

        stopping: boolean;

      }

    | undefined;

  // eslint-disable-next-line no-var

  var __garranchogenHtrPoller:

    | {

        timer: ReturnType<typeof setInterval> | null;

        inFlight: number;

        stopping: boolean;

      }

    | undefined;

}



function getEnhanceState() {

  if (!global.__garranchogenEnhancePoller) {

    global.__garranchogenEnhancePoller = {

      timer: null,

      inFlight: 0,

      stopping: false,

    };

  }

  return global.__garranchogenEnhancePoller;

}



function getHtrState() {

  if (!global.__garranchogenHtrPoller) {

    global.__garranchogenHtrPoller = {

      timer: null,

      inFlight: 0,

      stopping: false,

    };

  }

  return global.__garranchogenHtrPoller;

}



async function tickEnhanceClaimBounded(): Promise<void> {

  const state = getEnhanceState();

  if (state.stopping) return;



  let poolSize: number;

  try {

    poolSize = getEnhancementWorkerPoolSize();

  } catch {

    return;

  }



  try {

    await connectToDatabase();

  } catch {

    return;

  }



  const instanceId = getPipelineInstanceId();



  while (!state.stopping && state.inFlight < poolSize) {

    let claimed;

    try {

      claimed = await claimNextEnhanceJob(instanceId);

    } catch (error: unknown) {

      pipelineLog({

        event: "pipeline.stage.fail",

        stage: "enhance",

        errorCode: "POLLER_CLAIM_ERROR",

        detail:

          error instanceof Error ? error.message.slice(0, 200) : String(error),

      });

      break;

    }



    if (!claimed) break;



    state.inFlight += 1;

    void runEnhancementForDocument(claimed)

      .catch((error: unknown) => {

        pipelineLog({

          event: "pipeline.stage.fail",

          stage: "enhance",

          documentId: String(claimed._id),

          errorCode: "POLLER_RUN_ERROR",

          detail:

            error instanceof Error ? error.message.slice(0, 200) : String(error),

        });

      })

      .finally(() => {

        state.inFlight = Math.max(0, state.inFlight - 1);

      });

  }

}



async function tickHtrClaimBounded(): Promise<void> {

  const state = getHtrState();

  if (state.stopping) return;



  let maxConcurrent: number;

  try {

    getGeminiApiKey();

    maxConcurrent = getGeminiMaxConcurrent();

  } catch {

    return;

  }



  try {

    await connectToDatabase();

  } catch {

    return;

  }



  const instanceId = getPipelineInstanceId();



  while (

    !state.stopping &&

    state.inFlight < maxConcurrent &&

    getGeminiInFlight() < maxConcurrent

  ) {

    let claimed;

    try {

      claimed = await claimNextHtrJob(instanceId);

    } catch (error: unknown) {

      pipelineLog({

        event: "pipeline.stage.fail",

        stage: "htr",

        errorCode: "POLLER_CLAIM_ERROR",

        detail:

          error instanceof Error ? error.message.slice(0, 200) : String(error),

      });

      break;

    }



    if (!claimed) break;



    state.inFlight += 1;

    void runHtrForDocument(claimed)

      .catch((error: unknown) => {

        pipelineLog({

          event: "pipeline.stage.fail",

          stage: "htr",

          documentId: String(claimed._id),

          errorCode: "POLLER_RUN_ERROR",

          detail:

            error instanceof Error ? error.message.slice(0, 200) : String(error),

        });

      })

      .finally(() => {

        state.inFlight = Math.max(0, state.inFlight - 1);

      });

  }

}



export function startEnhancementPoller(): void {

  const state = getEnhanceState();

  if (state.timer) return;

  state.stopping = false;



  try {

    getEnhancementPool(getEnhancementWorkerPoolSize(), getJobLockTtlMs()).ensureStarted();

    getPipelineInstanceId();

  } catch {

    // Env may be incomplete during build.

  }



  let intervalMs: number;

  try {

    intervalMs = getJobPollIntervalMs();

  } catch {

    console.warn(

      JSON.stringify({

        ts: new Date().toISOString(),

        event: "pipeline.poller.skip",

        reason: "JOB_POLL_INTERVAL_MS not set",

      }),

    );

    return;

  }



  state.timer = setInterval(() => {

    void tickEnhanceClaimBounded();

  }, intervalMs);

  if (typeof state.timer.unref === "function") {

    state.timer.unref();

  }



  pipelineLog({

    event: "pipeline.stage.start",

    stage: "enhance",

    status: "poller_started",

    intervalMs,

  });

}



export function startHtrPoller(): void {

  const state = getHtrState();

  if (state.timer) return;

  state.stopping = false;



  let intervalMs: number;

  try {

    intervalMs = getJobPollIntervalMs();

  } catch {

    console.warn(

      JSON.stringify({

        ts: new Date().toISOString(),

        event: "pipeline.poller.skip",

        stage: "htr",

        reason: "JOB_POLL_INTERVAL_MS not set",

      }),

    );

    return;

  }



  state.timer = setInterval(() => {

    void tickHtrClaimBounded();

  }, intervalMs);

  if (typeof state.timer.unref === "function") {

    state.timer.unref();

  }



  pipelineLog({

    event: "pipeline.stage.start",

    stage: "htr",

    status: "poller_started",

    intervalMs,

  });

}



export async function stopEnhancementPoller(): Promise<void> {

  const state = getEnhanceState();

  state.stopping = true;

  if (state.timer) {

    clearInterval(state.timer);

    state.timer = null;

  }

  try {

    const pool = getEnhancementPool(getEnhancementWorkerPoolSize(), getJobLockTtlMs());

    await pool.shutdown();

  } catch {

    // ignore config/shutdown race

  }

}



export async function stopHtrPoller(): Promise<void> {

  const state = getHtrState();

  state.stopping = true;

  if (state.timer) {

    clearInterval(state.timer);

    state.timer = null;

  }

}



/** @internal — tests */

export function resetEnhancementPollerForTests(): void {

  const state = getEnhanceState();

  if (state.timer) clearInterval(state.timer);

  global.__garranchogenEnhancePoller = {

    timer: null,

    inFlight: 0,

    stopping: false,

  };

}



/** @internal — tests */

export function resetHtrPollerForTests(): void {

  const state = getHtrState();

  if (state.timer) clearInterval(state.timer);

  global.__garranchogenHtrPoller = {

    timer: null,

    inFlight: 0,

    stopping: false,

  };

}



/** Start both pipeline pollers (enhance + HTR). */

export function startPipelinePollers(): void {

  startEnhancementPoller();

  startHtrPoller();

}



export async function stopPipelinePollers(): Promise<void> {

  await stopHtrPoller();

  await stopEnhancementPoller();

}


