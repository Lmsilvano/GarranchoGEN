import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getDocumentDir, getTmpDir } from "./paths";

function assertInsideDocumentDir(documentId: string, targetPath: string): string {
  const documentDir = getDocumentDir(documentId);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedTarget !== documentDir && !resolvedTarget.startsWith(documentDir + path.sep)) {
    throw new Error("targetPath must be inside the document's directory");
  }
  return resolvedTarget;
}

/** Writes under the document's `.tmp/` dir, then renames into place — never a partial file at `targetPath`. */
export async function writeFileAtomic(
  documentId: string,
  targetPath: string,
  data: Buffer | Uint8Array | string,
): Promise<void> {
  const resolvedTarget = assertInsideDocumentDir(documentId, targetPath);

  const tmpDir = getTmpDir(documentId);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(path.dirname(resolvedTarget), { recursive: true });

  const tmpPath = path.join(tmpDir, `${randomUUID()}.tmp`);
  await fs.writeFile(tmpPath, data);
  await fs.rename(tmpPath, resolvedTarget);
}

/**
 * Renames a file already written under the document's `.tmp/` into its final path.
 * Used when a Worker Thread streams output directly to tmp (avoid buffering full image in main).
 */
export async function moveIntoPlace(
  documentId: string,
  tmpPath: string,
  targetPath: string,
): Promise<void> {
  const documentDir = getDocumentDir(documentId);
  const resolvedTmp = path.resolve(tmpPath);
  const resolvedTarget = assertInsideDocumentDir(documentId, targetPath);

  if (resolvedTmp !== documentDir && !resolvedTmp.startsWith(documentDir + path.sep)) {
    throw new Error("tmpPath must be inside the document's directory");
  }

  await fs.mkdir(path.dirname(resolvedTarget), { recursive: true });
  await fs.rename(resolvedTmp, resolvedTarget);
}
