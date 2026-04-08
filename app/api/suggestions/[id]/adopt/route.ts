export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { getSuggestionById, getQuestionById, updateQuestion } from "@/lib/db";
import { getUserEmail } from "@/lib/user";


export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const suggestion = await getSuggestionById(Number(id));
  if (!suggestion) {
    return NextResponse.json({ error: "suggestion not found" }, { status: 404 });
  }

  const question = await getQuestionById(suggestion.questionId);
  if (!question) {
    return NextResponse.json({ error: "question not found" }, { status: 404 });
  }

  const userEmail = await getUserEmail();
  await updateQuestion(
    suggestion.questionId,
    {
      question_text: question.question,
      options: question.choices,
      answers: suggestion.suggestedAnswers ?? question.answers,
      explanation: suggestion.suggestedExplanation ?? question.explanation,
      source: question.source,
      explanation_sources: question.explanationSources,
      change_reason: `Adopted from suggestion #${id}`,
    },
    userEmail
  );

  return NextResponse.json({ ok: true });
}
