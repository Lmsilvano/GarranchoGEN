import { NextResponse } from "next/server";
import { pingDatabase } from "@/lib/db/connection";
import { isDataDirWritable } from "@/lib/storage/ready-check";

export const dynamic = "force-dynamic";

// Response body isn't specified in docs/specs/04-contracts.md (only status codes 200/503 are
// documented) — kept minimal and consistent with /api/health's shape.
export async function GET() {
  const [mongoOk, dataDirOk] = await Promise.all([pingDatabase(), isDataDirWritable()]);
  if (mongoOk && dataDirOk) {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
  return NextResponse.json({ status: "error" }, { status: 503 });
}
