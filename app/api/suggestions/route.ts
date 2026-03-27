export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { getSuggestions, getSuggestionCount, createSuggestion } from "@/lib/db";
import { getUserEmail } from "@/lib/user";


export async function GET(req: NextRequest) {
  const questionId = req.nextUrl.searchParams.get("questionId");
  if (!questionId) return NextResponse.json({ error: "questionId required" }, { status: 400 });

  if (req.nextUrl.searchParams.get("count") === "1") {
    const count = await getSuggestionCount(questionId);
    return NextResponse.json({ count });
  }

  const suggestions = await getSuggestions(questionId);
  return NextResponse.json(suggestions);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    questionId: string;
    type: "ai" | "manual";
    suggestedAnswers?: string[] | null;
    suggestedExplanation?: string | null;
    aiModel?: string | null;
    comment?: string | null;
  };

  if (!body.questionId || !body.type) {
    return NextResponse.json({ error: "questionId and type are required" }, { status: 400 });
  }
  if (body.type === "manual" && !body.suggestedAnswers?.length && !body.suggestedExplanation) {
    return NextResponse.json(
      { error: "manual suggestion requires suggestedAnswers or suggestedExplanation" },
      { status: 400 }
    );
  }

  const userEmail = await getUserEmail();
  const suggestion = await createSuggestion(
    body.questionId,
    {
      type: body.type,
      suggestedAnswers: body.suggestedAnswers ?? null,
      suggestedExplanation: body.suggestedExplanation ?? null,
      aiModel: body.aiModel ?? null,
      comment: body.comment ?? null,
    },
    userEmail
  );
  return NextResponse.json({ ok: true, suggestion });
}
