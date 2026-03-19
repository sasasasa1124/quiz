export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { createQuestion, getQuestions, getUserInvalidatedIds } from "@/lib/db";
import { getUserEmail } from "@/lib/user";
import type { Choice } from "@/lib/types";

export async function GET(req: NextRequest) {
  const examId = req.nextUrl.searchParams.get("examId");
  if (!examId) return NextResponse.json({ error: "examId required" }, { status: 400 });

  const userEmail = await getUserEmail();
  const [questions, invalidatedIds] = await Promise.all([
    getQuestions(examId),
    userEmail ? getUserInvalidatedIds(userEmail, examId) : Promise.resolve([]),
  ]);
  const invalidatedSet = new Set(invalidatedIds);
  const result = questions.map((q) => ({ ...q, invalidated: invalidatedSet.has(q.dbId) }));
  return NextResponse.json({ questions: result });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    exam_id: string;
    question_text: string;
    options: Choice[];
    answers: string[];
    explanation: string;
    source: string;
    explanation_sources: string[];
  };

  if (!body.exam_id || !body.question_text || !body.options?.length || !body.answers?.length) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const userEmail = await getUserEmail();
  const created = await createQuestion(body.exam_id, {
    question_text: body.question_text,
    options: body.options,
    answers: body.answers,
    explanation: body.explanation ?? "",
    source: body.source ?? "",
    explanation_sources: body.explanation_sources ?? [],
  }, userEmail);

  return NextResponse.json(created, { status: 201 });
}
