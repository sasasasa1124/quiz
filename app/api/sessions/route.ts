export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { createSession, getSessionsByExam } from "@/lib/db";
import { getUserEmail } from "@/lib/user";


export async function POST(req: NextRequest) {
  const body = await req.json() as {
    sessionId: string;
    examId: string;
    mode: "quiz" | "review";
    filter: "all" | "wrong";
    questionCount: number;
  };
  if (!body.sessionId || !body.examId || !body.mode || !body.filter || body.questionCount == null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const userEmail = await getUserEmail();
  await createSession(userEmail, body.examId, body.mode, body.filter, body.questionCount, body.sessionId);
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const examId = req.nextUrl.searchParams.get("examId");
  if (!examId) return NextResponse.json({ error: "examId required" }, { status: 400 });
  const userEmail = await getUserEmail();
  const sessions = await getSessionsByExam(userEmail, examId);
  return NextResponse.json(sessions);
}
