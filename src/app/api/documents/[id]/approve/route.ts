import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/auth/errors";
import { requireSession } from "@/lib/auth/require-session";
import { connectToDatabase } from "@/lib/db/connection";
import { assertTransition } from "@/lib/pipeline/state-machine";
import {
  INVALID_APPROVE_BODY_MESSAGE,
  NOTHING_TO_APPROVE_MESSAGE,
  REVIEW_CONFLICT_MESSAGE,
} from "@/lib/review/errors";
import { toContractDocument } from "@/lib/review/serialize";
import { assertDocumentId } from "@/lib/storage/paths";
import { DOCUMENT_NOT_FOUND_MESSAGE, INVALID_DOCUMENT_ID_MESSAGE } from "@/lib/upload/errors";
import { DocumentModel } from "@/models/Document";
import type { ApproveDocumentResponse } from "@/types";

export const dynamic = "force-dynamic";

function parseExpectedVersion(rawBody: unknown): { ok: true; expectedVersion: number | null } | { ok: false } {
  if (!rawBody || typeof rawBody !== "object" || !("expectedVersion" in rawBody)) {
    return { ok: false };
  }
  const { expectedVersion } = rawBody as { expectedVersion: unknown };
  if (expectedVersion !== null && typeof expectedVersion !== "number") {
    return { ok: false };
  }
  return { ok: true, expectedVersion };
}

/**
 * Approve só define status "approved" a partir de "inReview" (ver state-machine.ts —
 * "approved" é terminal, então esta rota nunca mexe num documento já aprovado).
 * Mesma forma de concorrência otimista do save: o `expectedVersion` do cliente precisa
 * bater com o currentTranscriptionVersion do documento, aplicado atomicamente via
 * findOneAndUpdate.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  try {
    assertDocumentId(id);
  } catch {
    return jsonError(400, "INVALID_DOCUMENT_ID", INVALID_DOCUMENT_ID_MESSAGE);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError(400, "INVALID_APPROVE_BODY", INVALID_APPROVE_BODY_MESSAGE);
  }
  const parsedBody = parseExpectedVersion(rawBody);
  if (!parsedBody.ok) {
    return jsonError(400, "INVALID_APPROVE_BODY", INVALID_APPROVE_BODY_MESSAGE);
  }

  await connectToDatabase();
  const doc = await DocumentModel.findById(id).exec();
  if (!doc) {
    return jsonError(404, "DOCUMENT_NOT_FOUND", DOCUMENT_NOT_FOUND_MESSAGE);
  }

  if (doc.currentTranscriptionVersion == null) {
    return jsonError(409, "NOTHING_TO_APPROVE", NOTHING_TO_APPROVE_MESSAGE);
  }
  if (doc.status !== "inReview") {
    return jsonError(409, "REVIEW_CONFLICT", REVIEW_CONFLICT_MESSAGE);
  }
  if (parsedBody.expectedVersion !== doc.currentTranscriptionVersion) {
    return jsonError(409, "REVIEW_CONFLICT", REVIEW_CONFLICT_MESSAGE);
  }

  assertTransition("inReview", "approved");

  const updated = await DocumentModel.findOneAndUpdate(
    { _id: id, status: "inReview", currentTranscriptionVersion: doc.currentTranscriptionVersion },
    { $set: { status: "approved" } },
    { new: true },
  ).exec();

  if (!updated) {
    return jsonError(409, "REVIEW_CONFLICT", REVIEW_CONFLICT_MESSAGE);
  }

  const body: ApproveDocumentResponse = { document: toContractDocument(updated) };
  const response = NextResponse.json(body);
  auth.applyCookies(response);
  return response;
}
