import { NextRequest, NextResponse } from "next/server";
import { getDB, getNow } from "@/lib/db";
import { DEFAULT_REFINE_PROMPT } from "@/lib/types";
import type { Choice } from "@/lib/types";
import { requireAdmin } from "@/lib/auth";
import { parseAiJsonAs } from "@/lib/ai-json";
import { AiRefineResponseSchema } from "@/lib/ai-schemas";
import { aiGenerate } from "@/lib/ai-client";

interface QuestionRow {
  id: string;
  question_text: string;
  options: string;
  answers: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { id } = await params;
  let userPrompt: string | undefined;
  try {
    const body = await req.json() as { userPrompt?: string };
    userPrompt = body.userPrompt;
  } catch { /* no body is fine */ }

  const pg = getDB();
  if (!pg) return NextResponse.json({ error: "DB not available" }, { status: 503 });
  const now = getNow(pg);


  const rows = await pg<QuestionRow[]>`SELECT id, question_text, options, answers FROM questions WHERE id = ${id}`;
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Question not found" }, { status: 404 });

  const choices = JSON.parse(row.options) as Choice[];
  const answers = JSON.parse(row.answers) as string[];
  const choicesText = choices.map((c) => `${c.label}. ${c.text}`).join("\n");
  const answersText = answers.join(", ");
  const template = userPrompt || DEFAULT_REFINE_PROMPT;
  const prompt = template
    .replace("{question}", row.question_text)
    .replace("{choices}", choicesText)
    .replace("{answers}", answersText);

  const { text: raw } = await aiGenerate(prompt, { jsonMode: true, useSearch: true });
  const { data: result, error: parseError } = parseAiJsonAs(raw, AiRefineResponseSchema);
  if (parseError || !result) {
    return NextResponse.json({ error: parseError ?? "parse failed", raw }, { status: 502 });
  }

  const questionChanged = result.question !== row.question_text;
  const choicesChanged = result.choices.some((c: Choice) => {
    const orig = choices.find((o) => o.label === c.label);
    return orig ? orig.text !== c.text : false;
  });

  let refined = false;
  if (questionChanged || choicesChanged) {
    await pg`UPDATE questions SET question_text = ${result.question}, options = ${JSON.stringify(result.choices)}, version = version + 1, updated_at = ${now} WHERE id = ${id}`;
    refined = true;
  }

  return NextResponse.json({ refined, changesSummary: result.changesSummary ?? "" });
}
