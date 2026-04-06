import { NextRequest } from "next/server";
import { getDB, getQuestions } from "@/lib/db";
import { DEFAULT_REFINE_PROMPT } from "@/lib/types";
import type { Choice } from "@/lib/types";
import { requireAdmin } from "@/lib/auth";
import { parseAiJsonAs } from "@/lib/ai-json";
import { AiRefineResponseSchema } from "@/lib/ai-schemas";
import { aiGenerate } from "@/lib/ai-client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { id: examId } = await params;
  let userPrompt: string | undefined;
  try {
    const body = await req.json() as { userPrompt?: string };
    userPrompt = body.userPrompt;
  } catch { /* no body is fine */ }

  const pg = getDB();
  if (!pg) {
    return new Response(JSON.stringify({ error: "DB not available" }), { status: 503 });
  }

  const questions = await getQuestions(examId);
  const candidates = questions.filter((q) => q.question.trim().length > 0);
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
        send({ done: 0, total: 0, refined: 0, failed: 0 });
        clearInterval(heartbeat);
        controller.close();
        return;
      }

      send({ done: 0, total, failed: 0 });

      let done = 0;
      let refined = 0;
      let failed = 0;

      try {
        for (const q of candidates) {
          try {
            const choicesText = q.choices.map((c: Choice) => `${c.label}. ${c.text}`).join("\n");
            const answersText = q.answers.join(", ");
            const template = userPrompt || DEFAULT_REFINE_PROMPT;
            const prompt = template
              .replace("{question}", q.question)
              .replace("{choices}", choicesText)
              .replace("{answers}", answersText);

            const { text: raw } = await aiGenerate(prompt, { jsonMode: true, useSearch: true });
            const { data: result, error: parseError } = parseAiJsonAs(raw, AiRefineResponseSchema);
            if (parseError || !result) throw new Error(parseError ?? "parse failed");

            const questionChanged = result.question !== q.question;
            const choicesChanged = result.choices.some((c: Choice) => {
              const orig = q.choices.find((o: Choice) => o.label === c.label);
              return orig ? orig.text !== c.text : false;
            });

            if (questionChanged || choicesChanged) {
              await pg`UPDATE questions SET question_text = ${result.question}, options = ${JSON.stringify(result.choices)}, version = version + 1, updated_at = NOW() WHERE id = ${q.dbId}`;
              refined++;
            }
          } catch { failed++; }

          done++;
          send({ done, total, refined, failed });
        }

        send({ done: total, total, refined, failed });
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
