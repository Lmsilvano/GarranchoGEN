import { GoogleGenAI } from "@google/genai";

import { getGeminiApiKey, getGeminiModel, getGeminiTimeoutMs } from "@/config/env";
import type { HtrModelResponse } from "@/types";

import { HTR_ERROR_CODES, HtrClientError } from "./errors";
import {
  buildRepairPrompt,
  buildSystemPrompt,
  buildUserPrompt,
} from "./prompts";
import { HTR_RESPONSE_JSON_SCHEMA, parseHtrModelResponse } from "./schema";

export interface TranscribePageInput {
  imageBytes: Buffer;
  mimeType?: string;
}

type GenerateContentFn = (args: {
  model: string;
  contents: unknown;
  config: Record<string, unknown>;
}) => Promise<{ text?: string | null }>;

let generateContentOverride: GenerateContentFn | null = null;

/** @internal — tests inject a mock without loading the real SDK path. */
export function setGenerateContentForTests(fn: GenerateContentFn | null): void {
  generateContentOverride = fn;
}

function classifySdkError(error: unknown): HtrClientError {
  if (error instanceof HtrClientError) return error;

  const message =
    error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
      ? (error as { status: number }).status
      : undefined;
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "number"
      ? (error as { code: number }).code
      : undefined;
  const statusStr =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "string"
      ? (error as { status: string }).status
      : "";

  const httpStatus = status ?? code;
  const blob = `${message} ${statusStr}`.toUpperCase();

  if (
    httpStatus === 429 ||
    blob.includes("RESOURCE_EXHAUSTED") ||
    blob.includes("TOO_MANY_REQUESTS")
  ) {
    return new HtrClientError("quota", HTR_ERROR_CODES.QUOTA, message, 429);
  }

  if (
    httpStatus === 408 ||
    (error instanceof Error && error.name === "AbortError") ||
    blob.includes("TIMEOUT") ||
    blob.includes("ABORTED")
  ) {
    return new HtrClientError("timeout", HTR_ERROR_CODES.TIMEOUT, message, 408);
  }

  if (httpStatus !== undefined && httpStatus >= 500) {
    return new HtrClientError("upstream5xx", HTR_ERROR_CODES.UPSTREAM_5XX, message, httpStatus);
  }

  if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500) {
    return new HtrClientError("upstream4xx", HTR_ERROR_CODES.UPSTREAM_4XX, message, httpStatus);
  }

  return new HtrClientError("unknown", HTR_ERROR_CODES.UNKNOWN, message, httpStatus);
}

function defaultGenerateContent(): GenerateContentFn {
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  return async (args) => {
    const response = await ai.models.generateContent({
      model: args.model,
      contents: args.contents as never,
      config: args.config as never,
    });
    return { text: response.text };
  };
}

async function callOnce(
  generate: GenerateContentFn,
  model: string,
  imageBytes: Buffer,
  mimeType: string,
  userText: string,
  timeoutMs: number,
): Promise<HtrModelResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await generate({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: userText },
            {
              inlineData: {
                mimeType,
                data: imageBytes.toString("base64"),
              },
            },
          ],
        },
      ],
      config: {
        systemInstruction: buildSystemPrompt(),
        responseMimeType: "application/json",
        responseJsonSchema: HTR_RESPONSE_JSON_SCHEMA,
        abortSignal: controller.signal,
      },
    });

    const text = response.text;
    if (!text) {
      throw new HtrClientError(
        "schema",
        HTR_ERROR_CODES.SCHEMA,
        "Empty model response",
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new HtrClientError(
        "schema",
        HTR_ERROR_CODES.SCHEMA,
        "Model response is not JSON",
      );
    }

    try {
      return parseHtrModelResponse(parsed);
    } catch (err) {
      throw new HtrClientError(
        "schema",
        HTR_ERROR_CODES.SCHEMA,
        err instanceof Error ? err.message.slice(0, 200) : "Schema validation failed",
      );
    }
  } catch (error) {
    throw classifySdkError(error);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One page → one generateContent. On schema failure: one repair retry, then fail.
 */
export async function transcribePage(
  input: TranscribePageInput,
): Promise<HtrModelResponse> {
  const model = getGeminiModel();
  const timeoutMs = getGeminiTimeoutMs();
  const mimeType = input.mimeType ?? "image/webp";
  const generate = generateContentOverride ?? defaultGenerateContent();

  try {
    return await callOnce(
      generate,
      model,
      input.imageBytes,
      mimeType,
      buildUserPrompt(),
      timeoutMs,
    );
  } catch (first) {
    const err = classifySdkError(first);
    if (err.kind !== "schema") throw err;

    try {
      return await callOnce(
        generate,
        model,
        input.imageBytes,
        mimeType,
        buildRepairPrompt(),
        timeoutMs,
      );
    } catch (second) {
      throw classifySdkError(second);
    }
  }
}
