import { NextResponse } from "next/server";

// This route is for local development only.
// On Cloudflare Pages, DEPLOY_TARGET is unset — returns empty array immediately.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  if (process.env.DEPLOY_TARGET !== "local") {
    return NextResponse.json([]);
  }
  const { examId } = await params;
  const { getQuestions } = await import("@/lib/csv");
  const questions = await getQuestions(examId);
  return NextResponse.json(questions);
}
