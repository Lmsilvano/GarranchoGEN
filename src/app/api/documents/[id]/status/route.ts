import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/auth/errors";
import { requireSession } from "@/lib/auth/require-session";
import { connectToDatabase } from "@/lib/db/connection";
import { assertDocumentId } from "@/lib/storage/paths";
import {
  DOCUMENT_NOT_FOUND_MESSAGE,
  INVALID_DOCUMENT_ID_MESSAGE,
} from "@/lib/upload/errors";
import { DocumentModel } from "@/models/Document";
import {
  PROCESSING_STATUS_LABELS_PT_BR,
  type DocumentStatusResponse,
  type ProcessingStatus,
} from "@/types";

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
  const doc = await DocumentModel.findById(id).exec();
  if (!doc) {
    return jsonError(404, "DOCUMENT_NOT_FOUND", DOCUMENT_NOT_FOUND_MESSAGE);
  }

  const status = doc.status as ProcessingStatus;
  const rawUpdated = doc.get("updatedAt") as Date | string;
  const updatedAt =
    rawUpdated instanceof Date
      ? rawUpdated.toISOString()
      : String(rawUpdated);

  const body: DocumentStatusResponse = {
    status,
    labelPtBr: PROCESSING_STATUS_LABELS_PT_BR[status],
    updatedAt,
  };

  const response = NextResponse.json(body);
  auth.applyCookies(response);
  return response;
}
