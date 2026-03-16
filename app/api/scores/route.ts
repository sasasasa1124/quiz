import { NextRequest, NextResponse } from "next/server";
import { getScores, saveScore } from "@/lib/db";
import { getUserEmail } from "@/lib/user";


export async function GET(req: NextRequest) {
  const examId = req.nextUrl.searchParams.get("examId");
  if (!examId) return NextResponse.json({ error: "examId required" }, { status: 400 });

  const userEmail = await getUserEmail();
  const stats = await getScores(userEmail, examId);
  return NextResponse.json(stats);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { examId: string; questionId: number; correct: boolean };
  if (!body.examId || body.questionId == null || body.correct == null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const userEmail = await getUserEmail();
  await saveScore(userEmail, body.examId, body.questionId, body.correct);
  return NextResponse.json({ ok: true });
}
