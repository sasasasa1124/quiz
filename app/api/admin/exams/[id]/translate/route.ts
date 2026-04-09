import { NextRequest } from "next/server";
import { getDB, getQuestions, getNow } from "@/lib/db";
import { aiGenerate } from "@/lib/ai-client";
import { requireAdmin } from "@/lib/auth";
import type { Choice } from "@/lib/types";
import { TranslatedQuestionsSchema } from "@/lib/ai-schemas";
import { parseAiJsonAs } from "@/lib/ai-json";

const LANG_NAMES: Record<string, string> = {
  ja: "Japanese",
  en: "English",
  zh: "Chinese (Simplified)",
  ko: "Korean",
};

const SALESFORCE_NOTE = `Important Salesforce terminology rules:
- Keep Salesforce product names in English: Sales Cloud, Service Cloud, Experience Cloud, Marketing Cloud, Data Cloud, Einstein, Apex, Lightning, Visualforce, SOQL, SOSL, Flow, etc.
- Use the official Salesforce localized terms for the target language where they exist (e.g., Salesforce official documentation in that language).
- Answer option labels (A, B, C, D, E) must remain unchanged.
- Do NOT translate URLs, code snippets, or field API names.
- Preserve HTML tags if any exist in the text.`;

type TranslatedQuestion = {
  num: number;
  question: string;
  choices: Choice[];
  explanation: string;
  category?: string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { id: examId } = await params;
  const { targetLanguage } = await req.json() as { targetLanguage: string };

  if (!["ja", "en", "zh", "ko"].includes(targetLanguage)) {
    return new Response(JSON.stringify({ error: "Invalid target language" }), { status: 400 });
  }

  const pg = getDB();
  if (!pg) {
    return new Response(JSON.stringify({ error: "DB not available" }), { status: 503 });
  }
  const now = getNow(pg);

  const questions = await getQuestions(examId);
  if (questions.length === 0) {
    return new Response(JSON.stringify({ error: "No questions found" }), { status: 404 });
  }

  // Get source exam info
  const [examRow] = await pg<{ name: string; lang: string }[]>`SELECT name, lang FROM exams WHERE id = ${examId}`;
  if (!examRow) {
    return new Response(JSON.stringify({ error: "Exam not found" }), { status: 404 });
  }

  const newExamId = `${examId}_${targetLanguage}`;
  const targetLangName = LANG_NAMES[targetLanguage] ?? targetLanguage;
  const sourceLangName = LANG_NAMES[examRow.lang] ?? examRow.lang;

  // Fetch existing categories from the source exam to use as constraints
  const categoryRows = await pg<{ category: string }[]>`
    SELECT DISTINCT category FROM questions
    WHERE exam_id = ${examId} AND category IS NOT NULL AND category != ''
    ORDER BY category`;
  const sourceCategories = categoryRows.map((r) => r.category);

  const BATCH_SIZE = 15;
  const total = questions.length;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: object) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Translate exam name
        const { text: nameText } = await aiGenerate(
          `Translate this Salesforce certification exam name from ${sourceLangName} to ${targetLangName}. Return ONLY the translated name, nothing else.\n\n${examRow.name}`
        );
        const translatedName = nameText || examRow.name;

        // Create new exam record
        await pg`INSERT INTO exams (id, name, lang) VALUES (${newExamId}, ${translatedName}, ${targetLanguage}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, lang = EXCLUDED.lang`;

        send({ done: 0, total });

        // Process in batches
        let done = 0;
        const allTranslated: TranslatedQuestion[] = [];

        for (let i = 0; i < questions.length; i += BATCH_SIZE) {
          const batch = questions.slice(i, i + BATCH_SIZE);

          const batchJson = JSON.stringify(batch.map((q) => ({
            num: q.id,
            question: q.question,
            choices: q.choices,
            explanation: q.explanation,
            category: q.category,
          })));

          const categoryConstraint = sourceCategories.length > 0
            ? `\n- "category": assign exactly one category from this list (translate the name if needed): ${sourceCategories.map((c) => `"${c}"`).join(", ")}`
            : `\n- "category": short topic/domain label matching official exam topic areas`;

          const prompt = `You are a Salesforce/MuleSoft certification exam translator.

Translate the following exam questions from ${sourceLangName} to ${targetLangName}.

${SALESFORCE_NOTE}

Return a JSON array (no markdown, no code blocks) with the same structure, translating only:
- "question": the question text
- each choice "text": the choice body text
- "explanation": the explanation text${categoryConstraint}

IMPORTANT: Keep "num" and choice "label" values unchanged. Do NOT rename the "label" field to anything else.

Input JSON:
${batchJson}`;

          let retries = 2;
          let translated: TranslatedQuestion[] | null = null;

          while (retries >= 0 && translated === null) {
            try {
              const { text } = await aiGenerate(prompt, { useSearch: true });
              const { data, error } = parseAiJsonAs(text, TranslatedQuestionsSchema);
              if (data) {
                translated = data;
              } else {
                if (error) retries--;
                if (retries < 0) throw new Error(error ?? "parse failed");
              }
            } catch {
              retries--;
              if (retries < 0) {
                // Fall back: use original questions for this batch
                translated = batch.map((q) => ({
                  num: q.id as number,
                  question: q.question,
                  choices: q.choices,
                  explanation: q.explanation,
                  category: q.category,
                }));
              }
            }
          }

          allTranslated.push(...(translated ?? []));
          done += batch.length;
          send({ done, total });
        }

        // Bulk insert translated questions
        for (let idx = 0; idx < allTranslated.length; idx++) {
          const tq = allTranslated[idx];
          const qId = `${newExamId}__${idx + 1}`;
          await pg`
            INSERT INTO questions (id, exam_id, num, question_text, options, answers, explanation, source, explanation_sources, category, created_at, added_at)
            VALUES (${qId}, ${newExamId}, ${idx + 1}, ${tq.question}, ${JSON.stringify(tq.choices)},
                    ${JSON.stringify(questions[idx]?.answers ?? [])}, ${tq.explanation},
                    ${questions[idx]?.source ?? ""}, ${JSON.stringify(questions[idx]?.explanationSources ?? [])},
                    ${tq.category ?? null}, ${now}, ${now})
            ON CONFLICT (id) DO UPDATE SET
              question_text = EXCLUDED.question_text, options = EXCLUDED.options,
              answers = EXCLUDED.answers, explanation = EXCLUDED.explanation,
              category = EXCLUDED.category, updated_at = ${now}`;
        }

        send({ done: total, total, newExamId });
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
