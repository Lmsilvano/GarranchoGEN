import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/auth/errors";
import { requireSession } from "@/lib/auth/require-session";
import { connectToDatabase } from "@/lib/db/connection";
import {
  DOCUMENT_NOT_EDITABLE_MESSAGE,
  INVALID_TRANSCRIPTION_BODY_MESSAGE,
  REVIEW_CONFLICT_MESSAGE,
} from "@/lib/review/errors";
import { toContractDocument, toContractTranscription } from "@/lib/review/serialize";
import { parseSaveTranscriptionBody } from "@/lib/review/validate-transcription-body";
import { assertDocumentId } from "@/lib/storage/paths";
import { DOCUMENT_NOT_FOUND_MESSAGE, INVALID_DOCUMENT_ID_MESSAGE } from "@/lib/upload/errors";
import { DocumentModel } from "@/models/Document";
import { TranscriptionModel } from "@/models/Transcription";
import type { ProcessingStatus, SaveTranscriptionResponse } from "@/types";

export const dynamic = "force-dynamic";

const EDITABLE_STATUSES: ReadonlySet<ProcessingStatus> = new Set(["readyForReview", "inReview"]);

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000,
  );
}

/**
 * Salvar cria uma nova versão de transcrição monotônica (source: "human") — isso não
 * altera o status do documento por si só (o endpoint de claim, ao abrir a workspace,
 * já cuidou de readyForReview -> inReview; approve é o único que define "approved").
 *
 * Concorrência otimista: o cliente envia `expectedVersion` (o
 * currentTranscriptionVersion que ele carregou por último). Checagem em duas etapas
 * sem transação do Mongo — ver docs/specs/06-data-model.md e a decisão #4 do plano:
 * 1. Checagem rápida: expectedVersion precisa ser igual à versão recém-lida do documento.
 * 2. Insere a nova versão; o índice único {documentId, version} rejeita uma corrida
 *    perdida (E11000) com 409.
 * 3. Atualiza condicionalmente o ponteiro "current" do Document; a ausência de
 *    correspondência (documento mudou entre leitura e escrita) também é um 409 — a
 *    transcrição recém-inserida permanece no histórico, o que é inofensivo (o
 *    histórico nunca é apagado).
 */
export async function PUT(
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
    return jsonError(400, "INVALID_TRANSCRIPTION_BODY", INVALID_TRANSCRIPTION_BODY_MESSAGE);
  }
  const parsed = parseSaveTranscriptionBody(rawBody);
  if (!parsed) {
    return jsonError(400, "INVALID_TRANSCRIPTION_BODY", INVALID_TRANSCRIPTION_BODY_MESSAGE);
  }

  await connectToDatabase();
  const doc = await DocumentModel.findById(id).exec();
  if (!doc) {
    return jsonError(404, "DOCUMENT_NOT_FOUND", DOCUMENT_NOT_FOUND_MESSAGE);
  }
  if (!EDITABLE_STATUSES.has(doc.status)) {
    return jsonError(409, "DOCUMENT_NOT_EDITABLE", DOCUMENT_NOT_EDITABLE_MESSAGE);
  }

  const currentVersion = doc.currentTranscriptionVersion ?? null;
  if (parsed.expectedVersion !== currentVersion) {
    return jsonError(409, "REVIEW_CONFLICT", REVIEW_CONFLICT_MESSAGE);
  }

  const nextVersion = (currentVersion ?? 0) + 1;

  let transcription;
  try {
    transcription = await TranscriptionModel.create({
      documentId: id,
      version: nextVersion,
      literalTranscription: parsed.literalTranscription,
      modernizedTranscription: parsed.modernizedTranscription,
      structuredMetadata: parsed.structuredMetadata,
      uncertainSpans: parsed.uncertainSpans,
      createdBy: auth.session.userId,
      source: "human",
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return jsonError(409, "REVIEW_CONFLICT", REVIEW_CONFLICT_MESSAGE);
    }
    throw error;
  }

  const updatedDoc = await DocumentModel.findOneAndUpdate(
    { _id: id, currentTranscriptionVersion: currentVersion },
    {
      $set: {
        currentTranscriptionId: String(transcription._id),
        currentTranscriptionVersion: nextVersion,
      },
    },
    { new: true },
  ).exec();

  if (!updatedDoc) {
    return jsonError(409, "REVIEW_CONFLICT", REVIEW_CONFLICT_MESSAGE);
  }

  const body: SaveTranscriptionResponse = {
    transcription: toContractTranscription(transcription),
    document: toContractDocument(updatedDoc),
  };
  const response = NextResponse.json(body);
  auth.applyCookies(response);
  return response;
}
