/**
 * POST /api/admin/import/confirm
 *
 * Accepts previewed questions and saves them to the database.
 * Called after the user reviews the AI-converted preview.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDB, getNow } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getUserEmail } from "@/lib/user";
import { ImportedQuestionsSchema } from "@/lib/ai-schemas";
import type { ImportedQuestion } from "@/lib/ai-schemas";

function buildOptions(choices: string[]): { label: string; text: string }[] {
  return choices.map((c, i) => {
    const m = c.match(/^([A-Z])[.)]\s*([\s\S]+)$/);
    if (m) return { label: m[1], text: m[2].trim() };
    return { label: String.fromCharCode(65 + i), text: c.trim() };
  });
}

interface ConfirmBody {
  examId: string;
  examName: string;
  lang: string;
  questions: ImportedQuestion[];
}

export async function POST(req: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const body = (await req.json()) as ConfirmBody;
  const { examId, examName, lang, questions: rawQuestions } = body;

  if (!examId || !rawQuestions?.length) {
    return NextResponse.json({ error: "examId and questions are required" }, { status: 400 });
  }

  const parsed = ImportedQuestionsSchema.safeParse(rawQuestions);
  if (!parsed.success) {
    return NextResponse.json({ error: `Invalid questions: ${parsed.error.message}` }, { status: 400 });
  }
  const questions = parsed.data;

  const pg = getDB();
  if (!pg) {
    return NextResponse.json({ error: "DB not available" }, { status: 503 });
  }

  const now = getNow(pg);
  const userEmail = await getUserEmail();

  await pg`
    INSERT INTO exams (id, name, lang, created_by)
    VALUES (${examId}, ${examName || examId}, ${lang}, ${userEmail})
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, lang = EXCLUDED.lang`;

  let saved = 0;
  for (const q of questions) {
    const qId = `${examId}__${q.num}`;
    const options = buildOptions(q.choices);

    await pg`
      INSERT INTO questions
        (id, exam_id, num, question_text, options, answers, explanation, source,
         explanation_sources, created_by, created_at, added_at)
      VALUES (
        ${qId}, ${examId}, ${q.num}, ${q.question},
        ${JSON.stringify(options)}, ${JSON.stringify(q.answer)},
        ${q.explanation}, ${q.source}, ${"[]"}, ${userEmail}, ${now}, ${now}
      )
      ON CONFLICT (id) DO UPDATE SET
        question_text = EXCLUDED.question_text,
        options       = EXCLUDED.options,
        answers       = EXCLUDED.answers,
        explanation   = EXCLUDED.explanation,
        source        = EXCLUDED.source`;

    saved++;
  }

  return NextResponse.json({ examId, count: saved });
}
