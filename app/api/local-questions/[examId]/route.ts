import { NextResponse } from "next/server";

// Node.js runtime — allows fs/CSV import in local dev.
// build:cf uses postbuild hook to remove this from .vercel/output before
// @cloudflare/next-on-pages processes it, so CF Pages build passes.
// In production DEPLOY_TARGET is unset → returns [] immediately.
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  if (process.env.DEPLOY_TARGET !== "local") {
    return NextResponse.json([]);
  }
  try {
    const { examId } = await params;
    const { getQuestions } = await import("@/lib/csv");
    const questions = await getQuestions(examId);
    return NextResponse.json(questions);
  } catch {
    return NextResponse.json([]);
  }
}
