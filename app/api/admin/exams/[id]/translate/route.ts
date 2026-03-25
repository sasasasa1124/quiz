export const runtime = "edge";

import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getDB, getQuestions, getSetting } from "@/lib/db";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { requireAdmin } from "@/lib/auth";
import type { Choice } from "@/lib/types";

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

interface TranslatedQuestion {
  num: number;
  question: string;
  choices: Choice[];
  explanation: string;
  category: string | null;
}

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = getRequestContext() as any;
  const apiKey = ctx.env?.GEMINI_API_KEY as string | undefined;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), { status: 500 });
  }

  const db = getDB();
  if (!db) {
    return new Response(JSON.stringify({ error: "DB not available" }), { status: 503 });
  }

  const questions = await getQuestions(examId);
  if (questions.length === 0) {
    return new Response(JSON.stringify({ error: "No questions found" }), { status: 404 });
  }

  // Get source exam info
  const examRow = await db
    .prepare("SELECT name, lang FROM exams WHERE id = ?")
    .bind(examId)
    .first<{ name: string; lang: string }>();
  if (!examRow) {
    return new Response(JSON.stringify({ error: "Exam not found" }), { status: 404 });
  }

  const newExamId = `${examId}_${targetLanguage}`;
  const targetLangName = LANG_NAMES[targetLanguage] ?? targetLanguage;
  const sourceLangName = LANG_NAMES[examRow.lang] ?? examRow.lang;

  const ai = new GoogleGenAI({ apiKey });
  const model = (await getSetting("gemini_model")) ?? "gemini-3-flash-preview";

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
        const nameResp = await ai.models.generateContent({
          model,
          contents: `Translate this Salesforce certification exam name from ${sourceLangName} to ${targetLangName}. Return ONLY the translated name, nothing else.\n\n${examRow.name}`,
        });
        const translatedName = nameResp.text?.trim() ?? examRow.name;

        // Create new exam record
        await db
          .prepare("INSERT OR REPLACE INTO exams (id, name, lang) VALUES (?, ?, ?)")
          .bind(newExamId, translatedName, targetLanguage)
          .run();

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

          const prompt = `You are a Salesforce/MuleSoft certification exam translator.

Translate the following exam questions from ${sourceLangName} to ${targetLangName}.

${SALESFORCE_NOTE}

Return a JSON array (no markdown, no code blocks) with the same structure, translating only: "question", each choice "text", "explanation", and "category". Keep "num", choice "id" values unchanged.

Input JSON:
${batchJson}`;

          let retries = 2;
          let translated: TranslatedQuestion[] | null = null;

          while (retries >= 0 && translated === null) {
            try {
              const resp = await ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                  tools: [{ googleSearch: {} }],
                },
              });
              const text = (resp.text ?? "").trim()
                .replace(/^```json\s*/i, "").replace(/\s*```$/, "");
              translated = JSON.parse(text) as TranslatedQuestion[];
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
          await db
            .prepare(
              `INSERT OR REPLACE INTO questions
               (id, exam_id, num, question_text, options, answers, explanation, source, explanation_sources, category, created_at, added_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
            )
            .bind(
              qId,
              newExamId,
              idx + 1,
              tq.question,
              JSON.stringify(tq.choices),
              // Preserve original answers from source questions
              JSON.stringify(questions[idx]?.answers ?? []),
              tq.explanation,
              questions[idx]?.source ?? "",
              JSON.stringify(questions[idx]?.explanationSources ?? []),
              tq.category ?? null,
            )
            .run();
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
