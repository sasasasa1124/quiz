import { NextRequest, NextResponse } from "next/server";
import { updateQuestion, getQuestionById, deleteQuestion, setDuplicate } from "@/lib/db";
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
    source: string;
    explanation_sources: string[];
    change_reason: string;
  };

  if (!body.question_text || !body.options || !body.answers || !body.change_reason?.trim()) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const userEmail = await getUserEmail();
  await updateQuestion(
    id,
    {
      ...body,
      source: body.source ?? "",
      explanation_sources: body.explanation_sources ?? [],
      change_reason: body.change_reason ?? "manual edit",
    },
    userEmail
  );

  const updated = await getQuestionById(id);
  return NextResponse.json(updated);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { is_duplicate } = await req.json() as { is_duplicate: boolean };
  await setDuplicate(id, is_duplicate);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteQuestion(id);
  return NextResponse.json({ ok: true });
}
