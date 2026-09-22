import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { parentPort } from "node:worker_threads";
import sharp from "sharp";

/**
 * Worker Thread entry for CPU-heavy sharp enhancement (ADR-0002 / NFR B2).
 * Message protocol:
 *   in:  { inputPath, outputTmpPath, config }
 *   out: { ok: true, contentHash } | { ok: false, errorCode, errorMessage }
 */

/** @typedef {{ contrast: number, normalize: boolean, denoise: boolean, sharpen: number, grayscale: boolean }} EnhancementConfig */

/**
 * @param {string} inputPath
 * @param {string} outputTmpPath
 * @param {EnhancementConfig} config
 */
async function enhance(inputPath, outputTmpPath, config) {
  let pipeline = sharp(inputPath, { failOn: "error" });

  if (config.grayscale) {
    pipeline = pipeline.grayscale();
  }
  if (config.normalize) {
    pipeline = pipeline.normalize();
  }
  // contrast: 1.0 = identity; >1 boosts. Map to linear(a,b) with midpoint 128.
  if (typeof config.contrast === "number" && config.contrast !== 1) {
    const a = config.contrast;
    const b = 128 * (1 - a);
    pipeline = pipeline.linear(a, b);
  }
  if (config.denoise) {
    pipeline = pipeline.median(3);
  }
  if (typeof config.sharpen === "number" && config.sharpen > 0) {
    pipeline = pipeline.sharpen({ sigma: config.sharpen });
  }

  await pipeline.webp({ quality: 90 }).toFile(outputTmpPath);

  const bytes = await fs.readFile(outputTmpPath);
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  return contentHash;
}

if (!parentPort) {
  throw new Error("enhance.worker.mjs must run as a Worker Thread");
}

parentPort.on("message", async (msg) => {
  try {
    const { inputPath, outputTmpPath, config } = msg;
    if (!inputPath || !outputTmpPath || !config) {
      parentPort.postMessage({
        ok: false,
        errorCode: "ENHANCE_INVALID_MESSAGE",
        errorMessage: "Mensagem de melhoria inválida.",
      });
      return;
    }
    const contentHash = await enhance(inputPath, outputTmpPath, config);
    parentPort.postMessage({ ok: true, contentHash });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha na melhoria da imagem.";
    // Never leak filesystem paths or stack traces to callers that persist errorMessage.
    parentPort.postMessage({
      ok: false,
      errorCode: "ENHANCEMENT_FAILED",
      errorMessage: "Falha na melhoria da imagem.",
      // Internal only — main thread may log, must not persist.
      detail: message.slice(0, 200),
    });
  }
});
