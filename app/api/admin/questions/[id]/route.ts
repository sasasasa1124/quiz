import { NextRequest, NextResponse } from "next/server";
import { updateQuestion, getQuestionById } from "@/lib/db";
import { getUserEmail } from "@/lib/user";
import type { Choice } from "@/lib/types";

export const runtime = "edge";


export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json() as {
    question_text: string;
    options: Choice[];
    answers: string[];
    explanation: string;
    change_reason: string;
  };

  if (!body.question_text || !body.options || !body.answers || !body.change_reason?.trim()) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const userEmail = await getUserEmail();
  await updateQuestion(id, body, userEmail);

  const updated = await getQuestionById(id);
  return NextResponse.json(updated);
}
