import { NextRequest, NextResponse } from "next/server";
import { getScores, getAllScores, getRichScores, saveScore, addSessionAnswer } from "@/lib/db";
import { getUserEmail } from "@/lib/user";

export const runtime = "edge";


export async function GET(req: NextRequest) {
  const examId = req.nextUrl.searchParams.get("examId");
  const rich = req.nextUrl.searchParams.get("rich") === "1";
  const userEmail = await getUserEmail();

  if (!examId) {
    // Return all exams' scores grouped by examId
    const statsMap = await getAllScores(userEmail);
    return NextResponse.json({ statsMap });
  }

  if (rich) {
    const stats = await getRichScores(userEmail, examId);
    return NextResponse.json(stats);
  }

  const stats = await getScores(userEmail, examId);
  return NextResponse.json(stats);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    examId: string;
    questionId: number;
    correct: boolean;
    sessionId?: string;
    questionDbId?: string;
  };
  if (!body.examId || body.questionId == null || body.correct == null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const userEmail = await getUserEmail();
  await saveScore(userEmail, body.examId, body.questionId, body.correct);

  if (body.sessionId && body.questionDbId) {
    await addSessionAnswer(body.sessionId, body.questionDbId, body.correct);
  }

  return NextResponse.json({ ok: true });
}
