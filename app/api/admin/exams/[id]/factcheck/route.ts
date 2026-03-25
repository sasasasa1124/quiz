export const runtime = "edge";

import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getDB, getSetting } from "@/lib/db";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { DEFAULT_FACTCHECK_PROMPT } from "@/lib/types";
import type { Choice } from "@/lib/types";
import { requireAdmin } from "@/lib/auth";

interface FactCheckResult {
  isCorrect: boolean;
  correctAnswers: string[];
  confidence: "high" | "medium" | "low";
  issues: string[];
  explanation: string;
  sources: string[];
}

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

  const { id: examId } = await params;
  let userPrompt: string | undefined;
  let forceRecheck = false;
  try {
    const body = await req.json() as { userPrompt?: string; forceRecheck?: boolean };
    userPrompt = body.userPrompt;
    forceRecheck = body.forceRecheck ?? false;
  } catch { /* no body is fine */ }

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

  let allRows: QuestionRow[] | undefined;
  let hasFactCheckedAtCol = true;
  try {
    const res = await db
      .prepare("SELECT id, question_text, options, answers, fact_checked_at FROM questions WHERE exam_id = ? ORDER BY num ASC")
      .bind(examId)
      .all<QuestionRow>();
    allRows = res.results;
  } catch {
    // fact_checked_at column doesn't exist yet — fall back without it
    hasFactCheckedAtCol = false;
    const res = await db
      .prepare("SELECT id, question_text, options, answers FROM questions WHERE exam_id = ? ORDER BY num ASC")
      .bind(examId)
      .all<Omit<QuestionRow, "fact_checked_at">>();
    allRows = (res.results ?? []).map((r) => ({ ...r, fact_checked_at: null }));
  }

  const allQuestions = allRows ?? [];
  // Skip already fact-checked unless force recheck
  const candidates = allQuestions.filter((q) => {
    if (!q.question_text.trim()) return false;
    const answers = JSON.parse(q.answers) as string[];
    if (!answers.length) return false;
    if (!forceRecheck && q.fact_checked_at) return false;
    return true;
  });
  const skippedCount = allQuestions.length - candidates.length;
  const total = candidates.length;

  const ai = new GoogleGenAI({ apiKey });
  const model = (await getSetting("gemini_model")) ?? "gemini-2.5-flash-preview";

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: object) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      if (total === 0) {
        send({ done: 0, total: 0, fixed: 0, skipped: skippedCount, failed: 0 });
        controller.close();
        return;
      }

      send({ done: 0, total, skipped: skippedCount, failed: 0 });

      let done = 0;
      let fixed = 0;
      let failed = 0;

      try {
        for (const q of candidates) {
          try {
            const choices = JSON.parse(q.options) as Choice[];
            const answers = JSON.parse(q.answers) as string[];
            const choicesText = choices.map((c) => `${c.label}. ${c.text}`).join("\n");
            const answersText = answers.join(", ");
            const template = userPrompt || DEFAULT_FACTCHECK_PROMPT;
            const prompt = template
              .replace("{question}", q.question_text)
              .replace("{choices}", choicesText)
              .replace("{answers}", answersText);

            const resp = await ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                tools: [{ googleSearch: {} }],
                responseMimeType: "application/json",
              },
            });

            const raw = (resp.text ?? "").trim()
              .replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
            const result = JSON.parse(raw) as FactCheckResult;

            if (!result.isCorrect && result.correctAnswers && result.correctAnswers.length > 0) {
              const factCheckedClause = hasFactCheckedAtCol ? ", fact_checked_at = datetime('now')" : "";
              await db
                .prepare(
                  `UPDATE questions SET answers = ?, explanation = CASE WHEN ? != '' THEN ? ELSE explanation END${factCheckedClause}, version = version + 1, updated_at = datetime('now') WHERE id = ?`
                )
                .bind(
                  JSON.stringify(result.correctAnswers),
                  result.explanation,
                  result.explanation,
                  q.id
                )
                .run();
              fixed++;
            } else if (hasFactCheckedAtCol) {
              await db
                .prepare("UPDATE questions SET fact_checked_at = datetime('now') WHERE id = ?")
                .bind(q.id)
                .run();
            }
          } catch { failed++; }

          done++;
          send({ done, total, failed });
        }

        send({ done: total, total, fixed, skipped: skippedCount, failed });
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
