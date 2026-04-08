import { NextRequest, NextResponse } from "next/server";
import { getDB, getNow } from "@/lib/db";
import { aiGenerate } from "@/lib/ai-client";
import { DEFAULT_EXPLAIN_PROMPT } from "@/lib/types";
import type { Choice } from "@/lib/types";
import { requireAdmin } from "@/lib/auth";
import { parseAiJsonAs } from "@/lib/ai-json";
import { FillFromExplainSchema } from "@/lib/ai-schemas";

interface QuestionRow {
  id: string;
  exam_id: string;
  question_text: string;
  options: string;
  answers: string;
  explanation: string;
  category: string | null;
  filled_at: string | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { id } = await params;
  let userPrompt: string | undefined;
  let forceRefill = false;
  try {
    const body = await req.json() as { userPrompt?: string; forceRefill?: boolean };
    userPrompt = body.userPrompt;
    forceRefill = body.forceRefill ?? false;
  } catch { /* no body is fine */ }

  const pg = getDB();
  if (!pg) return NextResponse.json({ error: "DB not available" }, { status: 503 });
  const now = getNow(pg);


  const rows = await pg<QuestionRow[]>`SELECT id, exam_id, question_text, options, answers, explanation, category, filled_at FROM questions WHERE id = ${id}`;
  const q = rows[0];
  if (!q) return NextResponse.json({ error: "Question not found" }, { status: 404 });

  const choices = JSON.parse(q.options) as Choice[];
  const answers = JSON.parse(q.answers ?? "[]") as string[];
  const missing: string[] = [];
  if (answers.length === 0) missing.push("answers");
  if (!q.explanation) missing.push("explanation");
  if (!q.category) missing.push("category");

  if (missing.length === 0 && !forceRefill) {
    await pg`UPDATE questions SET filled_at = ${now} WHERE id = ${id}`;
    return NextResponse.json({ filled: false, skipped: true });
  }

  // Build canonical category list for this exam
  let canonicalCategories: string[] = [];
  if (missing.includes("category")) {
    const existingCategoryRows = await pg<{ category: string }[]>`
      SELECT DISTINCT category FROM questions
      WHERE exam_id = ${q.exam_id} AND category IS NOT NULL AND category != ''`;
    canonicalCategories = existingCategoryRows.map((r) => r.category);

    if (canonicalCategories.length < 3) {
      const [examRow] = await pg<{ name: string }[]>`SELECT name FROM exams WHERE id = ${q.exam_id}`;
      const examName = examRow?.name ?? q.exam_id;
      try {
        const categoryListPrompt = `You are an expert on Salesforce/MuleSoft certification exams.
Use Google Search to find the official exam guide for "${examName}".
Return a JSON array of the official topic areas / domains for this exam (6-12 items, concise English labels).
Return ONLY a JSON array of strings, no markdown, no extra text.
Example: ["Core Mule Concepts", "DataWeave", "Anypoint Platform"]`;
        const { text: rawCats } = await aiGenerate(categoryListPrompt, { useSearch: true });
        const rawCatsClean = rawCats.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(rawCatsClean) as string[];
        if (Array.isArray(parsed) && parsed.length >= 3) canonicalCategories = parsed;
      } catch { /* fall through */ }
    }
  }

  const choicesText = choices.map((c: Choice) => `${c.label}. ${c.text}`).join("\n");
  const answersText = answers.length > 0 ? answers.join(", ") : "(unknown — determine the correct answer from the question and choices)";
  const explanationLine = q.explanation ? `Current explanation on record: ${q.explanation}` : "";
  const categoryConstraint = missing.includes("category")
    ? `\n\nADDITIONAL FIELD: Also include a "category" field in your JSON response: a short topic/domain label${canonicalCategories.length >= 3 ? `. Use exactly one of: ${canonicalCategories.map((c) => `"${c}"`).join(", ")}` : ' (e.g. "Data Management", "Security Model", "Automation", "Reporting").'}`
    : "";

  const template = userPrompt || DEFAULT_EXPLAIN_PROMPT;
  const prompt = template
    .replace("{question}", q.question_text)
    .replace("{choices}", choicesText)
    .replace("{answers}", answersText)
    .replace("{explanation}", explanationLine)
    + categoryConstraint;

  let result: { answers?: string[]; explanation?: string; category?: string } | null = null;
  let retries = 2;
  while (retries >= 0 && result === null) {
    try {
      const { text } = await aiGenerate(prompt, { jsonMode: true, useSearch: true });
      const { data, error } = parseAiJsonAs(text, FillFromExplainSchema);
      if (data) result = data;
      else if (error) retries--;
    } catch {
      retries--;
    }
  }

  if (!result) {
    return NextResponse.json({ error: "AI failed after retries" }, { status: 502 });
  }

  const newAnswers = missing.includes("answers") && Array.isArray(result.answers) && result.answers.length > 0 ? JSON.stringify(result.answers) : null;
  const newExplanation = missing.includes("explanation") && result.explanation ? result.explanation : null;
  const newCategory = missing.includes("category") && result.category ? result.category : null;

  if (newAnswers !== null || newExplanation !== null || newCategory !== null) {
    await pg`
      UPDATE questions SET
        answers = COALESCE(${newAnswers}, answers),
        explanation = COALESCE(${newExplanation}, explanation),
        category = COALESCE(${newCategory}, category),
        filled_at = ${now}, updated_at = ${now}
      WHERE id = ${id}`;
    return NextResponse.json({ filled: true });
  }

  await pg`UPDATE questions SET filled_at = ${now} WHERE id = ${id}`;
  return NextResponse.json({ filled: false, skipped: true });
}
