export const runtime = 'edge';
import { NextRequest } from "next/server";
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

  const { id: examId } = await params;
  let userPrompt: string | undefined;
  let forceRecheck = false;
  try {
    const body = await req.json() as { userPrompt?: string; forceRecheck?: boolean };
    userPrompt = body.userPrompt;
    forceRecheck = body.forceRecheck ?? false;
  } catch { /* no body is fine */ }

  const pg = getDB();
  if (!pg) {
    return new Response(JSON.stringify({ error: "DB not available" }), { status: 503 });
  }
  const now = getNow(pg);

  let allRows: QuestionRow[] | undefined;
  let hasFactCheckedAtCol = true;
  try {
    allRows = await pg<QuestionRow[]>`SELECT id, question_text, options, answers, fact_checked_at FROM questions WHERE exam_id = ${examId} ORDER BY num ASC`;
  } catch {
    // fact_checked_at column doesn't exist yet — fall back without it
    hasFactCheckedAtCol = false;
    const rows = await pg<Omit<QuestionRow, "fact_checked_at">[]>`SELECT id, question_text, options, answers FROM questions WHERE exam_id = ${examId} ORDER BY num ASC`;
    allRows = rows.map((r) => ({ ...r, fact_checked_at: null }));
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
      const ping = () => {
        try { controller.enqueue(enc.encode(": ping\n\n")); } catch { /* disconnected */ }
      };
      // Heartbeat every 20s to prevent App Runner ALB from dropping idle SSE connections
      const heartbeat = setInterval(ping, 20_000);

      if (total === 0) {
        send({ done: 0, total: 0, fixed: 0, skipped: skippedCount, failed: 0 });
        clearInterval(heartbeat);
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

            const { text: raw } = await aiGenerate(prompt, { jsonMode: true, useSearch: true });
            const { data: result, error: parseError } = parseAiJsonAs(raw, AiFactCheckResponseSchema);
            if (parseError || !result) throw new Error(parseError ?? "parse failed");

            if (!result.isCorrect && result.correctAnswers && result.correctAnswers.length > 0) {
              if (hasFactCheckedAtCol) {
                await pg`UPDATE questions SET answers = ${JSON.stringify(result.correctAnswers)}, explanation = CASE WHEN ${result.explanation} != '' THEN ${result.explanation} ELSE explanation END, fact_checked_at = ${now}, version = version + 1, updated_at = ${now} WHERE id = ${q.id}`;
              } else {
                await pg`UPDATE questions SET answers = ${JSON.stringify(result.correctAnswers)}, explanation = CASE WHEN ${result.explanation} != '' THEN ${result.explanation} ELSE explanation END, version = version + 1, updated_at = ${now} WHERE id = ${q.id}`;
              }
              fixed++;
            } else if (hasFactCheckedAtCol) {
              await pg`UPDATE questions SET fact_checked_at = ${now} WHERE id = ${q.id}`;
            }
          } catch { failed++; }

          done++;
          send({ done, total, fixed, failed });
        }

        send({ done: total, total, fixed, skipped: skippedCount, failed });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        send({ error: msg });
      } finally {
        clearInterval(heartbeat);
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
