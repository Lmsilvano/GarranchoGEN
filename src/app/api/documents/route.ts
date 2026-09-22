import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { getMaxUploadBytes } from "@/config/env";
import { jsonError } from "@/lib/auth/errors";
import { requireSession } from "@/lib/auth/require-session";
import { connectToDatabase } from "@/lib/db/connection";
import { writeFileAtomic } from "@/lib/storage/atomic-write";
import { getOriginalDir } from "@/lib/storage/paths";
import { sanitizeOriginalFileName } from "@/lib/storage/sanitize-filename";
import {
  INVALID_UPLOAD_MESSAGE,
  PAYLOAD_TOO_LARGE_MESSAGE,
  STORAGE_FULL_MESSAGE,
  UNSUPPORTED_MEDIA_TYPE_MESSAGE,
} from "@/lib/upload/errors";
import { sniffImageMime } from "@/lib/upload/magic-bytes";
import { DocumentModel } from "@/models/Document";
import { DEFAULT_ENHANCEMENT_CONFIG, type Document as DocumentContract } from "@/types";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

interface ListCursor {
  createdAt: string;
  id: string;
}

function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(raw: string): ListCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as ListCursor;
    if (
      typeof parsed?.createdAt !== "string" ||
      typeof parsed?.id !== "string" ||
      Number.isNaN(Date.parse(parsed.createdAt))
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function titleFromFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/\.[^.]+$/, "");
  return base || "Documento";
}

function toContractDocument(doc: { toJSON: () => DocumentContract }): DocumentContract {
  return doc.toJSON();
}

export async function GET(request: NextRequest) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;

  await connectToDatabase();

  const { searchParams } = request.nextUrl;
  const limitRaw = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limitRaw)))
    : DEFAULT_LIMIT;

  const cursorRaw = searchParams.get("cursor");
  const filter: Record<string, unknown> = {};
  if (cursorRaw) {
    const cursor = decodeCursor(cursorRaw);
    if (!cursor) {
      return jsonError(400, "INVALID_CURSOR", "Cursor de paginação inválido.");
    }
    const cursorDate = new Date(cursor.createdAt);
    filter.$or = [
      { createdAt: { $lt: cursorDate } },
      { createdAt: cursorDate, _id: { $lt: cursor.id } },
    ];
  }

  const rows = await DocumentModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .exec();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map((row) => toContractDocument(row));

  let nextCursor: string | undefined;
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1]!;
    const rawCreatedAt: unknown = last.get("createdAt");
    const createdAt =
      rawCreatedAt instanceof Date
        ? rawCreatedAt.toISOString()
        : new Date(String(rawCreatedAt)).toISOString();
    nextCursor = encodeCursor({
      createdAt,
      id: String(last._id),
    });
  }

  const response = NextResponse.json({ items, ...(nextCursor ? { nextCursor } : {}) });
  auth.applyCookies(response);
  return response;
}

export async function POST(request: NextRequest) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;

  let maxBytes: number;
  try {
    maxBytes = getMaxUploadBytes();
  } catch {
    return jsonError(500, "CONFIG_ERROR", "Configuração de upload indisponível.");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, "INVALID_UPLOAD", INVALID_UPLOAD_MESSAGE);
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return jsonError(400, "INVALID_UPLOAD", INVALID_UPLOAD_MESSAGE);
  }

  if (fileEntry.size > maxBytes) {
    return jsonError(413, "PAYLOAD_TOO_LARGE", PAYLOAD_TOO_LARGE_MESSAGE);
  }

  const titleEntry = formData.get("title");
  const title =
    typeof titleEntry === "string" && titleEntry.trim()
      ? titleEntry.trim()
      : titleFromFileName(fileEntry.name);

  const buffer = Buffer.from(await fileEntry.arrayBuffer());
  const sniffed = sniffImageMime(buffer);
  if (!sniffed) {
    return jsonError(415, "UNSUPPORTED_MEDIA_TYPE", UNSUPPORTED_MEDIA_TYPE_MESSAGE);
  }

  const documentId = randomUUID();
  const sanitizedName = sanitizeOriginalFileName(fileEntry.name, sniffed);
  const absolutePath = path.join(getOriginalDir(documentId), sanitizedName);
  const relativePath = `documents/${documentId}/original/${sanitizedName}`;

  try {
    await writeFileAtomic(documentId, absolutePath, buffer);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOSPC") {
      return jsonError(507, "STORAGE_FULL", STORAGE_FULL_MESSAGE);
    }
    throw error;
  }

  await connectToDatabase();

  try {
    const created = await DocumentModel.create({
      _id: documentId,
      title,
      originalFileName: sanitizedName,
      mimeType: sniffed,
      status: "uploaded",
      originalPath: relativePath,
      enhancementConfig: { ...DEFAULT_ENHANCEMENT_CONFIG },
      createdBy: auth.session.userId,
    });

    const response = NextResponse.json(
      { document: toContractDocument(created) },
      { status: 201 },
    );
    auth.applyCookies(response);
    return response;
  } catch (error) {
    await fs.unlink(absolutePath).catch(() => undefined);
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOSPC") {
      return jsonError(507, "STORAGE_FULL", STORAGE_FULL_MESSAGE);
    }
    throw error;
  }
}
