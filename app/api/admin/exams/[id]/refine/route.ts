export const runtime = "edge";

import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getDB, getQuestions, getSetting } from "@/lib/db";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { DEFAULT_REFINE_PROMPT } from "@/lib/types";
import type { Choice } from "@/lib/types";
import { requireAdmin } from "@/lib/auth";

interface RefineResult {
  question: string;
  choices: Choice[];
  changesSummary: string;
}

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
  const candidates = questions.filter((q) => q.question.trim().length > 0);
  const total = candidates.length;

  const ai = new GoogleGenAI({ apiKey });
  const model = (await getSetting("gemini_model")) ?? "gemini-2.0-flash-preview";

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
        send({ done: 0, total: 0, refined: 0, failed: 0 });
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
            const result = JSON.parse(raw) as RefineResult;

            const questionChanged = result.question !== q.question;
            const choicesChanged = result.choices.some((c: Choice) => {
              const orig = q.choices.find((o: Choice) => o.label === c.label);
              return orig ? orig.text !== c.text : false;
            });

            if (questionChanged || choicesChanged) {
              await db
                .prepare(
                  "UPDATE questions SET question_text = ?, options = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?"
                )
                .bind(result.question, JSON.stringify(result.choices), q.dbId)
                .run();
              refined++;
            }
          } catch { failed++; }

          done++;
          send({ done, total, failed });
        }

        send({ done: total, total, refined, failed });
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
