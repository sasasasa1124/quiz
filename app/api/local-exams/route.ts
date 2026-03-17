export const runtime = "edge";

import { NextResponse } from "next/server";

// This route is for local development only.
// On Cloudflare Pages, filesystem access is unavailable — returns empty array.
export async function GET() {
  try {
    const { getExamList } = await import("@/lib/csv");
    const exams = await getExamList();
    return NextResponse.json(exams);
  } catch {
    return NextResponse.json([]);
  }
}
