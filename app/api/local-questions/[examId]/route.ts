import { NextResponse } from "next/server";

// Edge runtime required for Cloudflare Pages (@cloudflare/next-on-pages).
// In production (Cloudflare), DEPLOY_TARGET is unset so returns [] immediately.
// In local dev (Next.js edge simulation), dynamic import is caught and returns [].
// With `wrangler dev` (nodejs_compat), the import succeeds and returns CSV data.
export const runtime = "edge";

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
