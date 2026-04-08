import { NextRequest, NextResponse } from "next/server";
import { getDB, getNow } from "@/lib/db";
import { aiGenerate } from "@/lib/ai-client";
import { DEFAULT_FACTCHECK_PROMPT } from "@/lib/types";
import type { Choice } from "@/lib/types";
import { requireAdmin } from "@/lib/auth";
import { parseAiJsonAs } from "@/lib/ai-json";
import { AiFactCheckResponseSchema } from "@/lib/ai-schemas";

interface QuestionRow {
  id: string;
  question_text: string;
  options: string;
  answers: string;
  fact_checked_at: string | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { id } = await params;
  let userPrompt: string | undefined;
  let forceRecheck = false;
  try {
    const body = await req.json() as { userPrompt?: string; forceRecheck?: boolean };
    userPrompt = body.userPrompt;
    forceRecheck = body.forceRecheck ?? false;
  } catch { /* no body is fine */ }

  const pg = getDB();
  if (!pg) return NextResponse.json({ error: "DB not available" }, { status: 503 });
  const now = getNow(pg);

  let row: QuestionRow | undefined;
  let hasFactCheckedAtCol = true;
  try {
    const rows = await pg<QuestionRow[]>`SELECT id, question_text, options, answers, fact_checked_at FROM questions WHERE id = ${id}`;
    row = rows[0];
  } catch {
    hasFactCheckedAtCol = false;
    const rows = await pg<Omit<QuestionRow, "fact_checked_at">[]>`SELECT id, question_text, options, answers FROM questions WHERE id = ${id}`;
    row = rows[0] ? { ...rows[0], fact_checked_at: null } : undefined;
  }

  if (!row) return NextResponse.json({ error: "Question not found" }, { status: 404 });

  // Skip already fact-checked questions unless forced
  const answers = JSON.parse(row.answers) as string[];
  if (!forceRecheck && row.fact_checked_at) {
    return NextResponse.json({ skipped: true });
  }
  if (!row.question_text.trim() || !answers.length) {
    return NextResponse.json({ skipped: true });
  }

  const choices = JSON.parse(row.options) as Choice[];
  const choicesText = choices.map((c) => `${c.label}. ${c.text}`).join("\n");
  const answersText = answers.join(", ");
  const template = userPrompt || DEFAULT_FACTCHECK_PROMPT;
  const prompt = template
    .replace("{question}", row.question_text)
    .replace("{choices}", choicesText)
    .replace("{answers}", answersText);

  const { text: raw } = await aiGenerate(prompt, { jsonMode: true, useSearch: true });
  const { data: result, error: parseError } = parseAiJsonAs(raw, AiFactCheckResponseSchema);
  if (parseError || !result) {
    return NextResponse.json({ error: parseError ?? "parse failed", raw }, { status: 502 });
  }

  let fixed = false;
  if (!result.isCorrect && result.correctAnswers && result.correctAnswers.length > 0) {
    if (hasFactCheckedAtCol) {
      await pg`UPDATE questions SET answers = ${JSON.stringify(result.correctAnswers)}, explanation = CASE WHEN ${result.explanation} != '' THEN ${result.explanation} ELSE explanation END, fact_checked_at = ${now}, version = version + 1, updated_at = ${now} WHERE id = ${id}`;
    } else {
      await pg`UPDATE questions SET answers = ${JSON.stringify(result.correctAnswers)}, explanation = CASE WHEN ${result.explanation} != '' THEN ${result.explanation} ELSE explanation END, version = version + 1, updated_at = ${now} WHERE id = ${id}`;
    }
    fixed = true;
  } else if (hasFactCheckedAtCol) {
    await pg`UPDATE questions SET fact_checked_at = ${now} WHERE id = ${id}`;
  }

  return NextResponse.json({ fixed, isCorrect: result.isCorrect, correctAnswers: result.correctAnswers });
}
