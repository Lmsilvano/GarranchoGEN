/** JPEG canvas quality — OQ-06 does not pin a value; 0.82 is a reasonable default. */
export const JPEG_QUALITY = 0.82;

export function computeTargetSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || maxEdge <= 0) {
    return { width, height };
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width, height };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function isTiff(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/tiff" || type === "image/tif") return true;
  const name = file.name.toLowerCase();
  return name.endsWith(".tif") || name.endsWith(".tiff");
}

function outputMimeType(file: File): string {
  const type = file.type.toLowerCase();
  if (type === "image/png" || type === "image/webp" || type === "image/jpeg") {
    return type;
  }
  return "image/jpeg";
}

function readMaxEdgePx(): number | null {
  const raw = process.env.NEXT_PUBLIC_MAX_UPLOAD_EDGE_PX;
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

/**
 * Browser-side resize/compress before FormData upload (B1).
 * TIFF is returned unchanged (A-MIME) — the server still enforces size + magic bytes.
 */
export async function compressImage(file: File): Promise<File> {
  if (isTiff(file)) {
    return file;
  }

  const maxEdge = readMaxEdgePx();
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const target = maxEdge
      ? computeTargetSize(bitmap.width, bitmap.height, maxEdge)
      : { width: bitmap.width, height: bitmap.height };

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);

    const mime = outputMimeType(file);
    const quality = mime === "image/jpeg" ? JPEG_QUALITY : undefined;

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mime, quality);
    });

    if (!blob || blob.size >= file.size) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    const ext =
      mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
    return new File([blob], `${baseName}${ext}`, { type: mime, lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
