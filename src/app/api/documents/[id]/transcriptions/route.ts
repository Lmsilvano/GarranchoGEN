import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/auth/errors";
import { requireSession } from "@/lib/auth/require-session";
import { connectToDatabase } from "@/lib/db/connection";
import { toContractTranscription } from "@/lib/review/serialize";
import { assertDocumentId } from "@/lib/storage/paths";
import { DOCUMENT_NOT_FOUND_MESSAGE, INVALID_DOCUMENT_ID_MESSAGE } from "@/lib/upload/errors";
import { DocumentModel } from "@/models/Document";
import { TranscriptionModel } from "@/models/Transcription";
import type { TranscriptionListResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(
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
  const exists = await DocumentModel.exists({ _id: id });
  if (!exists) {
    return jsonError(404, "DOCUMENT_NOT_FOUND", DOCUMENT_NOT_FOUND_MESSAGE);
  }

  const transcriptions = await TranscriptionModel.find({ documentId: id }).sort({ version: -1 }).exec();

  const body: TranscriptionListResponse = {
    transcriptions: transcriptions.map((t) => toContractTranscription(t)),
  };
  const response = NextResponse.json(body);
  auth.applyCookies(response);
  return response;
}
