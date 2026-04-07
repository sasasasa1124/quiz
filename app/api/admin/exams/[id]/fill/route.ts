export const runtime = 'edge';
import { NextRequest } from "next/server";
import { getDB, getNow } from "@/lib/db";
import { aiGenerate } from "@/lib/ai-client";
import { DEFAULT_EXPLAIN_PROMPT } from "@/lib/types";
import type { Choice } from "@/lib/types";
import { requireAdmin } from "@/lib/auth";
import { parseAiJsonAs } from "@/lib/ai-json";
import { FillFromExplainSchema } from "@/lib/ai-schemas";

interface QuestionRow {
  id: string;
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

  const { id: examId } = await params;
  let userPrompt: string | undefined;
  let forceRefill = false;
  try {
    const body = await req.json() as { userPrompt?: string; forceRefill?: boolean };
    userPrompt = body.userPrompt;
    forceRefill = body.forceRefill ?? false;
  } catch { /* no body is fine */ }

  const pg = getDB();
  if (!pg) {
    return new Response(JSON.stringify({ error: "DB not available" }), { status: 503 });
  }
  const now = getNow(pg);

  const allQuestions = await pg<QuestionRow[]>`SELECT id, question_text, options, answers, explanation, category, filled_at FROM questions WHERE exam_id = ${examId} ORDER BY num ASC`;

  // Determine which questions need filling
  const candidates = allQuestions.filter((q) => {
    if (!q.question_text.trim()) return false;
    // If forceRefill, process everything; otherwise skip already-filled
    if (!forceRefill && q.filled_at) return false;
    // Still check if any field is actually missing (even on force recheck)
    const answers = JSON.parse(q.answers ?? "[]") as string[];
    const hasMissing = answers.length === 0 || !q.explanation || !q.category;
    return forceRefill ? true : hasMissing;
  });

  const skipped = allQuestions.length - candidates.length;
  const total = candidates.length;

  // Fetch or generate canonical category list for this exam
  const [examRow] = await pg<{ name: string }[]>`SELECT name FROM exams WHERE id = ${examId}`;
  const examName = examRow?.name ?? examId;
  const existingCategoryRows = await pg<{ category: string }[]>`
    SELECT DISTINCT category FROM questions
    WHERE exam_id = ${examId} AND category IS NOT NULL AND category != ''`;
  let canonicalCategories: string[] = existingCategoryRows.map((r) => r.category);

  if (canonicalCategories.length < 3 && candidates.some((q) => !q.category)) {
    // Generate canonical category list via LLM + Google Search
    try {
      const categoryListPrompt = `You are an expert on Salesforce/MuleSoft certification exams.
Use Google Search to find the official exam guide for "${examName}".
Return a JSON array of the official topic areas / domains for this exam (6-12 items, concise English labels).
Return ONLY a JSON array of strings, no markdown, no extra text.
Example: ["Core Mule Concepts", "DataWeave", "Anypoint Platform"]`;
      const { text: rawCats } = await aiGenerate(categoryListPrompt, { useSearch: true });
      const rawCatsClean = rawCats.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(rawCatsClean) as string[];
      if (Array.isArray(parsed) && parsed.length >= 3) {
        canonicalCategories = parsed;
      }
    } catch { /* fall through — no category constraint */ }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: object) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // ignore — client disconnected; DB writes must continue
        }
      };

      if (total === 0) {
        send({ done: 0, total: 0, filled: 0, skipped, failed: 0 });
        controller.close();
        return;
      }

      send({ done: 0, total, skipped, failed: 0 });

      let done = 0;
      let filled = 0;
      let failed = 0;

      try {
        for (const q of candidates) {
          try {
            const choices = JSON.parse(q.options) as Choice[];
            const answers = JSON.parse(q.answers ?? "[]") as string[];
            const missing: string[] = [];
            if (answers.length === 0) missing.push("answers");
            if (!q.explanation) missing.push("explanation");
            if (!q.category) missing.push("category");

            if (missing.length === 0 && !forceRefill) {
              // Nothing missing — just stamp filled_at and move on
              await pg`UPDATE questions SET filled_at = ${now} WHERE id = ${q.id}`;
              done++;
              send({ done, total, filled, skipped, failed });
              continue;
            }

            // Use the same explain prompt (aiPrompt) for fill — ensures identical quality
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

            if (result) {
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
                  WHERE id = ${q.id}`;
                filled++;
              } else {
                // No fields changed but processed — stamp filled_at
                await pg`UPDATE questions SET filled_at = ${now} WHERE id = ${q.id}`;
              }
            }
          } catch { failed++; }

          done++;
          send({ done, total, filled, skipped, failed });
        }

        send({ done: total, total, filled, skipped, failed });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        send({ error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
