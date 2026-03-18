import { NextResponse } from "next/server";

// Node.js runtime. wrangler.jsonc has nodejs_compat so CF Pages handles this.
// In production DEPLOY_TARGET is unset → returns [] immediately, never touches fs.
// Locally (next dev), Node.js runtime allows direct lib/csv import.
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
