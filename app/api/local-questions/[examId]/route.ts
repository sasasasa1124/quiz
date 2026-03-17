import { NextResponse } from "next/server";
import { getQuestions } from "@/lib/csv";

// Node.js runtime — reads CSV files for local dev fallback
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;
  const questions = getQuestions(examId);
  return NextResponse.json(questions);
}
