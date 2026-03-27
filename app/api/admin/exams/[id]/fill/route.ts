export const runtime = 'edge';
import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getDB, getSetting } from "@/lib/db";
import { DEFAULT_FILL_PROMPT } from "@/lib/types";
import type { Choice } from "@/lib/types";
import { requireAdmin } from "@/lib/auth";
import { parseAiJsonAs } from "@/lib/ai-json";
import { AdminFillResultsSchema } from "@/lib/ai-schemas";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), { status: 500 });
  }

  const pg = getDB();
  if (!pg) {
    return new Response(JSON.stringify({ error: "DB not available" }), { status: 503 });
  }

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

  const ai = new GoogleGenAI({ apiKey });
  const model = (await getSetting("gemini_model")) ?? "gemini-3-flash-preview";

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
              await pg`UPDATE questions SET filled_at = NOW() WHERE id = ${q.id}`;
              done++;
              send({ done, total, filled, skipped, failed });
              continue;
            }

            const singleJson = JSON.stringify([{
              id: q.id,
              question: q.question_text,
              choices,
              missing,
            }]);

            const template = userPrompt || DEFAULT_FILL_PROMPT;
            const prompt = template.replace("{questions}", singleJson);

            let results: { id: string; answers?: string[]; explanation?: string; category?: string }[] | null = null;
            let retries = 2;
            while (retries >= 0 && results === null) {
              try {
                const resp = await ai.models.generateContent({
                  model,
                  contents: prompt,
                  config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" },
                });
                const text = (resp.text ?? "").trim()
                  .replace(/^```json\s*/i, "").replace(/\s*```$/, "");
                const { data, error } = parseAiJsonAs(text, AdminFillResultsSchema);
                if (data) results = data;
                else if (error) retries--;
              } catch {
                retries--;
              }
            }

            if (results && results.length > 0) {
              const result = results[0];
              const newAnswers = missing.includes("answers") && Array.isArray(result.answers) && result.answers.length > 0 ? JSON.stringify(result.answers) : null;
              const newExplanation = missing.includes("explanation") && result.explanation ? result.explanation : null;
              const newCategory = missing.includes("category") && result.category ? result.category : null;

              if (newAnswers !== null || newExplanation !== null || newCategory !== null) {
                await pg`
                  UPDATE questions SET
                    answers = COALESCE(${newAnswers}, answers),
                    explanation = COALESCE(${newExplanation}, explanation),
                    category = COALESCE(${newCategory}, category),
                    filled_at = NOW(), updated_at = NOW()
                  WHERE id = ${q.id}`;
                filled++;
              } else {
                // No fields changed but processed — stamp filled_at
                await pg`UPDATE questions SET filled_at = NOW() WHERE id = ${q.id}`;
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
