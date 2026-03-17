export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { createQuestion } from "@/lib/db";
import { getUserEmail } from "@/lib/user";
import type { Choice } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    exam_id: string;
    question_text: string;
    options: Choice[];
    answers: string[];
    explanation: string;
    source: string;
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
  }, userEmail);

  return NextResponse.json(created, { status: 201 });
}
