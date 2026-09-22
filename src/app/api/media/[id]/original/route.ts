import fs from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { getDataDir } from "@/config/env";
import { jsonError } from "@/lib/auth/errors";
import { requireSession } from "@/lib/auth/require-session";
import { connectToDatabase } from "@/lib/db/connection";
import { assertDocumentId } from "@/lib/storage/paths";
import {
  DOCUMENT_NOT_FOUND_MESSAGE,
  INVALID_DOCUMENT_ID_MESSAGE,
} from "@/lib/upload/errors";
import { DocumentModel } from "@/models/Document";

export const dynamic = "force-dynamic";

function resolveUnderDataDir(relativePath: string): string | null {
  if (relativePath.includes("..") || path.isAbsolute(relativePath)) {
    return null;
  }
  const root = path.resolve(getDataDir());
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
}

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
  const doc = await DocumentModel.findById(id).lean().exec();
  if (!doc?.originalPath) {
    return jsonError(404, "DOCUMENT_NOT_FOUND", DOCUMENT_NOT_FOUND_MESSAGE);
  }

  let absolutePath: string | null;
  try {
    absolutePath = resolveUnderDataDir(doc.originalPath);
  } catch {
    return jsonError(404, "DOCUMENT_NOT_FOUND", DOCUMENT_NOT_FOUND_MESSAGE);
  }
  if (!absolutePath) {
    return jsonError(404, "DOCUMENT_NOT_FOUND", DOCUMENT_NOT_FOUND_MESSAGE);
  }

  if (!fs.existsSync(absolutePath)) {
    return jsonError(404, "DOCUMENT_NOT_FOUND", DOCUMENT_NOT_FOUND_MESSAGE);
  }

  const nodeStream = fs.createReadStream(absolutePath);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  const response = new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": doc.mimeType,
      "Cache-Control": "private, no-store",
    },
  });
  auth.applyCookies(response);
  return response;
}
