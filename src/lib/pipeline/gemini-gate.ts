/**
 * In-process semaphore for Gemini calls (GEMINI_MAX_CONCURRENT).
 * Does not encode remote RPM/RPD limits — only local concurrency.
 */

declare global {
  // eslint-disable-next-line no-var
  var __garranchogenGeminiGate:
    | {
        inFlight: number;
        max: number;
      }
    | undefined;
}

function getState(max: number) {
  if (!global.__garranchogenGeminiGate) {
    global.__garranchogenGeminiGate = { inFlight: 0, max };
  } else {
    global.__garranchogenGeminiGate.max = max;
  }
  return global.__garranchogenGeminiGate;
}

export function tryAcquireGeminiSlot(maxConcurrent: number): boolean {
  const state = getState(maxConcurrent);
  if (state.inFlight >= state.max) return false;
  state.inFlight += 1;
  return true;
}

export function releaseGeminiSlot(): void {
  const state = global.__garranchogenGeminiGate;
  if (!state) return;
  state.inFlight = Math.max(0, state.inFlight - 1);
}

export function getGeminiInFlight(): number {
  return global.__garranchogenGeminiGate?.inFlight ?? 0;
}

/** @internal — tests */
export function resetGeminiGateForTests(): void {
  global.__garranchogenGeminiGate = { inFlight: 0, max: 1 };
}
