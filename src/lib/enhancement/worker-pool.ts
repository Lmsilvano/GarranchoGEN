import { randomUUID } from "node:crypto";
import path from "node:path";
import { Worker } from "node:worker_threads";

import type { EnhancementConfig } from "@/types";

export interface EnhanceJobInput {
  inputPath: string;
  outputTmpPath: string;
  config: EnhancementConfig;
}

export type EnhanceJobResult =
  | { ok: true; contentHash: string }
  | { ok: false; errorCode: string; errorMessage: string; detail?: string };

interface PendingJob {
  resolve: (result: EnhanceJobResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function resolveWorkerPath(): string {
  // Absolute path so Worker Threads resolve correctly under next dev/start/standalone.
  return path.join(process.cwd(), "src/lib/enhancement/enhance.worker.mjs");
}

/**
 * Tiny Worker pool (size 1–2) for sharp enhancement.
 * Main thread only posts messages / awaits results — never runs sharp itself.
 */
export class EnhancementWorkerPool {
  private readonly size: number;
  private readonly timeoutMs: number;
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly pending = new Map<Worker, PendingJob>();
  private readonly waitQueue: Array<{
    input: EnhanceJobInput;
    resolve: (result: EnhanceJobResult) => void;
    reject: (error: Error) => void;
  }> = [];
  private shutDown = false;

  constructor(size: number, timeoutMs: number) {
    if (size < 1 || size > 2) {
      throw new Error("EnhancementWorkerPool size must be 1 or 2");
    }
    this.size = size;
    this.timeoutMs = timeoutMs;
  }

  private spawn(): Worker {
    const worker = new Worker(resolveWorkerPath());
    worker.on("message", (msg: EnhanceJobResult) => {
      this.finishJob(worker, msg);
    });
    worker.on("error", (err) => {
      this.failJob(worker, err);
    });
    worker.on("exit", (code) => {
      if (this.shutDown) return;
      // Unexpected exit mid-job
      const pending = this.pending.get(worker);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(worker);
        pending.resolve({
          ok: false,
          errorCode: "ENHANCE_WORKER_EXIT",
          errorMessage: "Falha na melhoria da imagem.",
          detail: `Worker exited with code ${code}`,
        });
      }
      this.removeWorker(worker);
      if (!this.shutDown && this.workers.length < this.size) {
        const replacement = this.spawn();
        this.workers.push(replacement);
        this.idle.push(replacement);
        this.drain();
      }
    });
    return worker;
  }

  private removeWorker(worker: Worker): void {
    const wi = this.workers.indexOf(worker);
    if (wi >= 0) this.workers.splice(wi, 1);
    const ii = this.idle.indexOf(worker);
    if (ii >= 0) this.idle.splice(ii, 1);
  }

  private finishJob(worker: Worker, result: EnhanceJobResult): void {
    const pending = this.pending.get(worker);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(worker);
    pending.resolve(result);
    if (!this.shutDown) {
      this.idle.push(worker);
      this.drain();
    }
  }

  private failJob(worker: Worker, err: Error): void {
    const pending = this.pending.get(worker);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(worker);
      pending.resolve({
        ok: false,
        errorCode: "ENHANCE_WORKER_ERROR",
        errorMessage: "Falha na melhoria da imagem.",
        detail: err.message.slice(0, 200),
      });
    }
    this.removeWorker(worker);
    try {
      void worker.terminate();
    } catch {
      // ignore
    }
    if (!this.shutDown && this.workers.length < this.size) {
      const replacement = this.spawn();
      this.workers.push(replacement);
      this.idle.push(replacement);
      this.drain();
    }
  }

  private assign(worker: Worker, input: EnhanceJobInput, resolve: (r: EnhanceJobResult) => void, reject: (e: Error) => void): void {
    const timer = setTimeout(() => {
      const pending = this.pending.get(worker);
      if (!pending) return;
      this.pending.delete(worker);
      void worker.terminate();
      this.removeWorker(worker);
      pending.resolve({
        ok: false,
        errorCode: "ENHANCE_TIMEOUT",
        errorMessage: "Tempo esgotado na melhoria da imagem.",
      });
      if (!this.shutDown && this.workers.length < this.size) {
        const replacement = this.spawn();
        this.workers.push(replacement);
        this.idle.push(replacement);
        this.drain();
      }
    }, this.timeoutMs);

    this.pending.set(worker, { resolve, reject, timer });
    worker.postMessage(input);
  }

  private drain(): void {
    while (this.idle.length > 0 && this.waitQueue.length > 0) {
      const worker = this.idle.shift()!;
      const next = this.waitQueue.shift()!;
      this.assign(worker, next.input, next.resolve, next.reject);
    }
  }

  /** Ensure pool workers exist (lazy start). */
  ensureStarted(): void {
    if (this.shutDown) throw new Error("EnhancementWorkerPool is shut down");
    while (this.workers.length < this.size) {
      const w = this.spawn();
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  runEnhancement(input: EnhanceJobInput): Promise<EnhanceJobResult> {
    if (this.shutDown) {
      return Promise.resolve({
        ok: false,
        errorCode: "ENHANCE_SHUTDOWN",
        errorMessage: "Serviço de melhoria indisponível.",
      });
    }
    this.ensureStarted();
    return new Promise((resolve, reject) => {
      const worker = this.idle.shift();
      if (worker) {
        this.assign(worker, input, resolve, reject);
      } else {
        this.waitQueue.push({ input, resolve, reject });
      }
    });
  }

  get activeCount(): number {
    return this.pending.size;
  }

  get idleCount(): number {
    return this.idle.length;
  }

  async shutdown(): Promise<void> {
    this.shutDown = true;
    for (const item of this.waitQueue.splice(0)) {
      item.resolve({
        ok: false,
        errorCode: "ENHANCE_SHUTDOWN",
        errorMessage: "Serviço de melhoria indisponível.",
      });
    }
    for (const [worker, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve({
        ok: false,
        errorCode: "ENHANCE_SHUTDOWN",
        errorMessage: "Serviço de melhoria indisponível.",
      });
      this.pending.delete(worker);
    }
    await Promise.all(
      this.workers.splice(0).map(async (w) => {
        try {
          await w.terminate();
        } catch {
          // ignore
        }
      }),
    );
    this.idle.length = 0;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __garranchogenEnhancePool: EnhancementWorkerPool | undefined;
}

export function getEnhancementPool(size: number, timeoutMs: number): EnhancementWorkerPool {
  if (!global.__garranchogenEnhancePool) {
    global.__garranchogenEnhancePool = new EnhancementWorkerPool(size, timeoutMs);
  }
  return global.__garranchogenEnhancePool;
}

export async function resetEnhancementPoolForTests(): Promise<void> {
  const existing = global.__garranchogenEnhancePool;
  global.__garranchogenEnhancePool = undefined;
  if (existing) {
    await existing.shutdown().catch(() => undefined);
  }
}

/** Stable instance id for lockedBy across process lifetime. */
export function getPipelineInstanceId(): string {
  if (!global.__garranchogenPipelineInstanceId) {
    global.__garranchogenPipelineInstanceId = randomUUID();
  }
  return global.__garranchogenPipelineInstanceId;
}

declare global {
  // eslint-disable-next-line no-var
  var __garranchogenPipelineInstanceId: string | undefined;
}
