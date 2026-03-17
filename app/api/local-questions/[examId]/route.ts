export const runtime = "edge";

import { NextResponse } from "next/server";

// This route is for local development only.
// On Cloudflare Pages, filesystem access is unavailable — returns empty array.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;
    const { getQuestions } = await import("@/lib/csv");
    const questions = await getQuestions(examId);
    return NextResponse.json(questions);
  } catch {
    return NextResponse.json([]);
  }
}
