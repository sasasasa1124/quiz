import { NextResponse } from "next/server";

// Node.js runtime — allows fs/CSV import in local dev.
// build:cf uses postbuild hook to remove this from .vercel/output before
// @cloudflare/next-on-pages processes it, so CF Pages build passes.
// In production DEPLOY_TARGET is unset → returns [] immediately.
export const runtime = "nodejs";

export async function GET() {
  if (process.env.DEPLOY_TARGET !== "local") {
    return NextResponse.json([]);
  }
  try {
    const { getExamList } = await import("@/lib/csv");
    const exams = await getExamList();
    return NextResponse.json(exams);
  } catch {
    return NextResponse.json([]);
  }
}
