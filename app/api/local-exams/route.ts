import { NextResponse } from "next/server";
import { getExamList } from "@/lib/csv";

export const runtime = "edge";

// Node.js compat (nodejs_compat flag) — reads CSV files for local dev fallback
export async function GET() {
  const exams = getExamList();
  return NextResponse.json(exams);
}
