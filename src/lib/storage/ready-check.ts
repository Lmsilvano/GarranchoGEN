import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "@/config/env";

/**
 * DATA_DIR must already exist (it's not created here) — a missing directory usually means the
 * volume didn't mount, and auto-creating a local one would mask that from the readiness probe.
 */
export async function isDataDirWritable(): Promise<boolean> {
  let dataDir: string;
  try {
    dataDir = getDataDir();
  } catch {
    return false;
  }

  try {
    const stat = await fs.stat(dataDir);
    if (!stat.isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }

  const probePath = path.join(dataDir, `.ready-probe-${randomUUID()}`);
  try {
    await fs.writeFile(probePath, "ok");
    await fs.unlink(probePath);
    return true;
  } catch {
    return false;
  }
}
