import { NextResponse } from "next/server";

// Node.js runtime. wrangler.jsonc has nodejs_compat so CF Pages handles this.
// In production DEPLOY_TARGET is unset → returns [] immediately, never touches fs.
// Locally (next dev), Node.js runtime allows direct lib/csv import.
// build:cf strips this route from Vercel output so @cloudflare/next-on-pages ignores it.
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
