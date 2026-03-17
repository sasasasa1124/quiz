import { NextResponse } from "next/server";
import { getExamList } from "@/lib/csv";

// Node.js runtime — reads CSV files for local dev fallback
export async function GET() {
  const exams = getExamList();
  return NextResponse.json(exams);
}
