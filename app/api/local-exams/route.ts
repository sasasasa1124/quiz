export const runtime = "edge";

import { NextResponse } from "next/server";

// This route is for local development only.
// On Cloudflare Pages, DEPLOY_TARGET is unset — returns empty array immediately.
export async function GET() {
  if (process.env.DEPLOY_TARGET !== "local") {
    return NextResponse.json([]);
  }
  const { getExamList } = await import("@/lib/csv");
  const exams = await getExamList();
  return NextResponse.json(exams);
}
