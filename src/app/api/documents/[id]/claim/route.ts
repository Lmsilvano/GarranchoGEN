import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/auth/errors";
import { requireSession } from "@/lib/auth/require-session";
import { connectToDatabase } from "@/lib/db/connection";
import { assertTransition } from "@/lib/pipeline/state-machine";
import { DOCUMENT_NOT_READY_FOR_REVIEW_MESSAGE } from "@/lib/review/errors";
import { toContractDocument } from "@/lib/review/serialize";
import { assertDocumentId } from "@/lib/storage/paths";
import { DOCUMENT_NOT_FOUND_MESSAGE, INVALID_DOCUMENT_ID_MESSAGE } from "@/lib/upload/errors";
import { DocumentModel } from "@/models/Document";
import type { ClaimDocumentResponse } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Claim idempotente: readyForReview -> inReview (abrir a workspace "pode definir
 * inReview" conforme docs/specs/01-pipeline.md Stage 4). 200 sem efeito se já
 * estiver inReview/approved; 409 para qualquer outro status (ainda em processamento).
 *
 * Não mexe em lockedAt/lockedBy — esses campos ficam reservados para os pollers
 * de enhance/HTR em background. A segurança contra revisores concorrentes vem da
 * concorrência otimista em save/approve, não de um lock pessimista por usuário aqui.
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

  await connectToDatabase();
  const doc = await DocumentModel.findById(id).exec();
  if (!doc) {
    return jsonError(404, "DOCUMENT_NOT_FOUND", DOCUMENT_NOT_FOUND_MESSAGE);
  }

  if (doc.status === "inReview" || doc.status === "approved") {
    const body: ClaimDocumentResponse = { document: toContractDocument(doc) };
    const response = NextResponse.json(body);
    auth.applyCookies(response);
    return response;
  }

  if (doc.status !== "readyForReview") {
    return jsonError(409, "DOCUMENT_NOT_READY_FOR_REVIEW", DOCUMENT_NOT_READY_FOR_REVIEW_MESSAGE);
  }

  assertTransition("readyForReview", "inReview");
  const claimed = await DocumentModel.findOneAndUpdate(
    { _id: id, status: "readyForReview" },
    { $set: { status: "inReview" } },
    { new: true },
  ).exec();

  if (!claimed) {
    // Perdeu uma corrida com outro claim/approve entre a leitura acima e agora.
    const fresh = await DocumentModel.findById(id).exec();
    if (fresh && (fresh.status === "inReview" || fresh.status === "approved")) {
      const body: ClaimDocumentResponse = { document: toContractDocument(fresh) };
      const response = NextResponse.json(body);
      auth.applyCookies(response);
      return response;
    }
    return jsonError(409, "DOCUMENT_NOT_READY_FOR_REVIEW", DOCUMENT_NOT_READY_FOR_REVIEW_MESSAGE);
  }

  const body: ClaimDocumentResponse = { document: toContractDocument(claimed) };
  const response = NextResponse.json(body);
  auth.applyCookies(response);
  return response;
}
