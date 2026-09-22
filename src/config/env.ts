export function getMongoUri(): string {
  const value = process.env.MONGODB_URI;
  if (!value) {
    throw new Error("MONGODB_URI is not set");
  }
  return value;
}

export function getDataDir(): string {
  const value = process.env.DATA_DIR;
  if (!value) {
    throw new Error("DATA_DIR is not set");
  }
  return value;
}

/** Fail loud — same pattern as SESSION_TTL_SECONDS (no silent default). */
export function getMaxUploadBytes(): number {
  const raw = process.env.MAX_UPLOAD_BYTES;
  if (!raw) {
    throw new Error("MAX_UPLOAD_BYTES is not set");
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error("MAX_UPLOAD_BYTES must be a positive integer");
  }
  return value;
}

function requirePositiveIntEnv(name: string): number {
  const raw = process.env[name];
  if (!raw) {
    throw new Error(`${name} is not set`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

/** Fail loud — no silent default (Phase 5 poller). */
export function getJobLockTtlMs(): number {
  return requirePositiveIntEnv("JOB_LOCK_TTL_MS");
}

/** Fail loud — no silent default (Phase 5 poller). */
export function getJobPollIntervalMs(): number {
  return requirePositiveIntEnv("JOB_POLL_INTERVAL_MS");
}

/**
 * Optional; default 2, clamped to 1–2 (NFR B2 / ADR-0002).
 * Empty/unset → 2.
 */
export function getEnhancementWorkerPoolSize(): number {
  const raw = process.env.ENHANCEMENT_WORKER_POOL_SIZE;
  if (!raw) return 2;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error("ENHANCEMENT_WORKER_POOL_SIZE must be an integer");
  }
  if (value < 1 || value > 2) {
    throw new Error("ENHANCEMENT_WORKER_POOL_SIZE must be 1 or 2");
  }
  return value;
}

const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

function optionalPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

/** Required at call time; poller skips HTR when unset (build-safe). */
export function getGeminiApiKey(): string {
  const value = process.env.GEMINI_API_KEY;
  if (!value) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return value;
}

/** Override via GEMINI_MODEL; default gemini-3.6-flash (H-A1). */
export function getGeminiModel(): string {
  const raw = process.env.GEMINI_MODEL;
  if (!raw || !raw.trim()) return DEFAULT_GEMINI_MODEL;
  return raw.trim();
}

/** In-process semaphore size; default 1 (H-A2 / A-07). */
export function getGeminiMaxConcurrent(): number {
  return optionalPositiveIntEnv("GEMINI_MAX_CONCURRENT", 1);
}

/** Backoff base after 429/5xx — assumption, not an SLO. */
export function getGeminiRetryBaseMs(): number {
  return optionalPositiveIntEnv("GEMINI_RETRY_BASE_MS", 5000);
}

/** Backoff cap — assumption, not an SLO. */
export function getGeminiRetryMaxMs(): number {
  return optionalPositiveIntEnv("GEMINI_RETRY_MAX_MS", 300_000);
}

/** Attempts before transcriptionFailed (timeout/5xx/schema); 429 never exhausts. */
export function getGeminiMaxAttempts(): number {
  return optionalPositiveIntEnv("GEMINI_MAX_ATTEMPTS", 5);
}

/** Per-request timeout — assumption, not an SLO. */
export function getGeminiTimeoutMs(): number {
  return optionalPositiveIntEnv("GEMINI_TIMEOUT_MS", 120_000);
}
