export const runtime = "edge";

import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getDB, getSetting } from "@/lib/db";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { DEFAULT_FILL_PROMPT } from "@/lib/types";
import type { Choice } from "@/lib/types";

interface FillResult {
  id: string;
  answers: string[];
  explanation: string;
  category: string;
}

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
  const { id: examId } = await params;
  let userPrompt: string | undefined;
  let forceRefill = false;
  try {
    const body = await req.json() as { userPrompt?: string; forceRefill?: boolean };
    userPrompt = body.userPrompt;
    forceRefill = body.forceRefill ?? false;
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
  let hasFilledAtCol = true;
  try {
    const res = await db
      .prepare("SELECT id, question_text, options, answers, explanation, category, filled_at FROM questions WHERE exam_id = ? ORDER BY num ASC")
      .bind(examId)
      .all<QuestionRow>();
    allRows = res.results;
  } catch {
    // filled_at column doesn't exist yet — fall back without it
    hasFilledAtCol = false;
    const res = await db
      .prepare("SELECT id, question_text, options, answers, explanation, category FROM questions WHERE exam_id = ? ORDER BY num ASC")
      .bind(examId)
      .all<Omit<QuestionRow, "filled_at">>();
    allRows = (res.results ?? []).map((r) => ({ ...r, filled_at: null }));
  }

  const allQuestions = allRows ?? [];

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
  const model = (await getSetting("gemini_model")) ?? "gemini-2.0-flash-preview";

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: object) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      if (total === 0) {
        send({ done: 0, total: 0, filled: 0, skipped });
        controller.close();
        return;
      }

      send({ done: 0, total, skipped });

      let done = 0;
      let filled = 0;

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
              if (hasFilledAtCol) {
                await db.prepare("UPDATE questions SET filled_at = datetime('now') WHERE id = ?").bind(q.id).run();
              }
              done++;
              send({ done, total });
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

            let results: FillResult[] | null = null;
            let retries = 2;
            while (retries >= 0 && results === null) {
              try {
                const resp = await ai.models.generateContent({
                  model,
                  contents: prompt,
                  config: { tools: [{ googleSearch: {} }] },
                });
                const text = (resp.text ?? "").trim()
                  .replace(/^```json\s*/i, "").replace(/\s*```$/, "");
                results = JSON.parse(text) as FillResult[];
              } catch {
                retries--;
              }
            }

            if (results && results.length > 0) {
              const result = results[0];
              const setClauses: string[] = [];
              const binds: unknown[] = [];

              if (missing.includes("answers") && Array.isArray(result.answers) && result.answers.length > 0) {
                setClauses.push("answers = ?");
                binds.push(JSON.stringify(result.answers));
              }
              if (missing.includes("explanation") && result.explanation) {
                setClauses.push("explanation = ?");
                binds.push(result.explanation);
              }
              if (missing.includes("category") && result.category) {
                setClauses.push("category = ?");
                binds.push(result.category);
              }

              if (setClauses.length > 0) {
                if (hasFilledAtCol) setClauses.push("filled_at = datetime('now')");
                setClauses.push("updated_at = datetime('now')");
                binds.push(q.id);
                await db
                  .prepare(`UPDATE questions SET ${setClauses.join(", ")} WHERE id = ?`)
                  .bind(...binds)
                  .run();
                filled++;
              } else {
                // No fields changed but processed — stamp filled_at
                if (hasFilledAtCol) {
                  await db.prepare("UPDATE questions SET filled_at = datetime('now') WHERE id = ?").bind(q.id).run();
                }
              }
            }
          } catch { /* skip individual failures, move to next */ }

          done++;
          send({ done, total });
        }

        send({ done: total, total, filled, skipped });
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
