import path from "node:path";

import { extensionForMime, type SniffedImageMime } from "@/lib/upload/magic-bytes";

/**
 * Sanitize an upload filename for storage under original/.
 * Basename only; reject path traversal; replace disallowed chars with `_`.
 */
export function sanitizeOriginalFileName(
  originalName: string,
  sniffedMime: SniffedImageMime,
): string {
  const base = path.basename(originalName.replace(/\\/g, "/"));
  if (!base || base === "." || base === ".." || base.includes("..")) {
    return `original${extensionForMime(sniffedMime)}`;
  }

  const sanitized = base.replace(/[^A-Za-z0-9._-]/g, "_");
  if (!sanitized || sanitized === "." || sanitized === ".." || sanitized.includes("..")) {
    return `original${extensionForMime(sniffedMime)}`;
  }

  return sanitized;
}
