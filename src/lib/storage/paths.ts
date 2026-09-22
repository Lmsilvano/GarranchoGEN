import path from "node:path";
import { getDataDir } from "@/config/env";

// Matches docs/specs/00-overview.md exactly.
const DOCUMENT_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * The regex alone would accept a bare ".." (both chars are in its allowed set), so we also
 * reject any id containing ".." explicitly — docs/specs/09-security.md calls this out as a
 * separate rule from the regex check.
 */
export function assertDocumentId(id: string): string {
  if (!DOCUMENT_ID_RE.test(id) || id.includes("..")) {
    throw new Error("Invalid documentId");
  }
  return id;
}

/** Belt-and-suspenders check per docs/specs/09-security.md: resolved path must stay under DATA_DIR. */
function ensureWithinDataDir(absolutePath: string): string {
  const root = path.resolve(getDataDir());
  const resolved = path.resolve(absolutePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Resolved path escapes DATA_DIR");
  }
  return resolved;
}

export function getDocumentDir(documentId: string): string {
  assertDocumentId(documentId);
  return ensureWithinDataDir(path.join(getDataDir(), "documents", documentId));
}

export function getOriginalDir(documentId: string): string {
  return ensureWithinDataDir(path.join(getDocumentDir(documentId), "original"));
}

export function getEnhancedDir(documentId: string): string {
  return ensureWithinDataDir(path.join(getDocumentDir(documentId), "enhanced"));
}

export function getTmpDir(documentId: string): string {
  return ensureWithinDataDir(path.join(getDocumentDir(documentId), ".tmp"));
}
