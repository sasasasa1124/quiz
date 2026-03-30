export const runtime = 'edge';
/**
 * POST /api/admin/import/[examId]/feedback
 *
 * Accept a free-text feedback message about an already-imported exam.
 * Fetches current questions from PostgreSQL, passes them to Gemini with codeExecution,
 * and applies the resulting fix list back to the DB.
 *
 * Streams progress as Server-Sent Events:
 *   data: { step: "analyzing" | "fixing" | "done" | "error", ...fields }
 */

import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { Content, GenerateContentResponse } from "@google/genai";
import { getDB, getSetting } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseAiJsonAs } from "@/lib/ai-json";
import { FeedbackFixesSchema } from "@/lib/ai-schemas";
import type { FeedbackFix } from "@/lib/ai-schemas";

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_TURNS = 4;
const FIXES_START = "===FIXES_START===";
const FIXES_END = "===FIXES_END===";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "X-Accel-Buffering": "no",
};

// ── System instruction ───────────────────────────────────────────────────────

const FEEDBACK_SYSTEM_INSTRUCTION = `You are reviewing already-imported exam questions and applying user corrections.

You will receive the current question data as JSON and a user feedback message describing what needs to be fixed.

## Your task

Analyze the patterns described in the feedback, identify all affected questions,
and output a fix list between these markers:
${FIXES_START}
[{"id":"examId__1","field":"question_text","value":"Fixed question text"},...]
${FIXES_END}

## Fix format

Each fix is a JSON object:
- id: the question ID in the form "examId__N"
- field: one of "question_text", "options", "answers", "explanation", "source"
- value: the new value as a string
  - For "options": a JSON string of [{label:"A",text:"..."}, ...] — e.g. '[{"label":"A","text":"Option A"},{"label":"B","text":"Option B"}]'
  - For "answers": a JSON string of uppercase letters — e.g. '["A","C"]'
  - For all others: plain text

## Important
- Apply the fix to ALL affected questions, not just the sample shown
- Use codeExecution to iterate through the full list and generate the fix array
- Output the fix array between ${FIXES_START} and ${FIXES_END} markers in a code execution block`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractFixesFromResponse(response: GenerateContentResponse): unknown {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const text = part.codeExecutionResult?.output ?? part.text ?? "";
    if (!text) continue;
    const s = text.indexOf(FIXES_START);
    const e = text.indexOf(FIXES_END);
    if (s !== -1 && e !== -1 && e > s) {
      try {
        return JSON.parse(text.slice(s + FIXES_START.length, e).trim());
      } catch {
        // continue scanning
      }
    }
  }
  return null;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { examId } = await params;
  const { message } = await req.json() as { message: string };

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "message is required" }), { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), { status: 500 });
  }

  const pg = getDB();
  if (!pg) {
    return new Response(JSON.stringify({ error: "DB not available" }), { status: 503 });
  }

  // Fetch current questions from DB
  const rows = await pg<{
    id: string;
    num: number;
    question_text: string;
    options: string;
    answers: string;
    explanation: string;
    source: string;
  }[]>`SELECT id, num, question_text, options, answers, explanation, source FROM questions WHERE exam_id = ${examId} ORDER BY num ASC`;

  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ error: `No questions found for exam: ${examId}` }), { status: 404 });
  }

  type QuestionRow = { id: string; num: number; question_text: string; options: string; answers: string; explanation: string; source: string };

  // Sample for context (first 30 + total count to avoid huge prompts)
  const sample = rows.slice(0, 30).map((r: QuestionRow) => ({
    id: r.id,
    num: r.num,
    question: r.question_text,
    choices: (() => { try { return JSON.parse(r.options) as { label: string; text: string }[]; } catch { return []; } })(),
    answers: (() => { try { return JSON.parse(r.answers) as string[]; } catch { return []; } })(),
    explanation: r.explanation,
    source: r.source,
  }));

  const contextText = `Exam: ${examId}
Total questions: ${rows.length}
${rows.length > 30 ? `(Showing first 30 as sample — apply fixes to all ${rows.length} questions)` : ""}

Current questions (JSON):
${JSON.stringify(sample, null, 2)}

All question IDs: ${rows.map((r: QuestionRow) => r.id).join(", ")}`;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: object) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* client disconnected */ }
      };

      try {
        send({ step: "analyzing", message: "Analyzing feedback..." });

        const ai = new GoogleGenAI({ apiKey });
        const model = (await getSetting("gemini_model")) ?? "gemini-2.5-flash-preview-05-20";

        const contents: Content[] = [
          {
            role: "user",
            parts: [
              {
                text: `${contextText}

User feedback: ${message}

Please analyze the issues described in the feedback, identify all affected questions,
and output the complete fix list between ${FIXES_START} and ${FIXES_END} markers.
Use codeExecution to iterate through all questions and generate the fixes.`,
              },
            ],
          },
        ];

        let fixes: FeedbackFix[] = [];

        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: FEEDBACK_SYSTEM_INSTRUCTION,
              tools: [{ codeExecution: {} }],
            },
          });

          const modelContent = response.candidates?.[0]?.content;
          if (modelContent) contents.push(modelContent);

          const rawFixes = extractFixesFromResponse(response);
          if (rawFixes !== null) {
            const { data, error } = parseAiJsonAs(JSON.stringify(rawFixes), FeedbackFixesSchema);
            if (data) {
              fixes = data;
              break;
            }
            // Schema validation failed — tell the agent to fix the format
            contents.push({
              role: "user",
              parts: [{ text: `The fix format is incorrect: ${error}. Please re-output with the correct format between the markers.` }],
            });
          } else {
            // No fixes found yet — nudge
            contents.push({
              role: "user",
              parts: [{ text: `Please output the fix list between ${FIXES_START} and ${FIXES_END} markers in a code execution block.` }],
            });
          }
        }

        if (fixes.length === 0) {
          send({ step: "done", fixed: 0, message: "No fixes were generated." });
          return controller.close();
        }

        // Apply fixes to DB
        send({ step: "fixing", total: fixes.length, done: 0 });
        let fixed = 0;

        for (const fix of fixes) {
          try {
            // Validate the question ID belongs to this exam
            if (!fix.id.startsWith(`${examId}__`)) continue;

            // postgres.js doesn't allow dynamic column names in template literals,
            // so we branch per field name
            if (fix.field === "question_text") {
              await pg`UPDATE questions SET question_text = ${fix.value}, updated_at = datetime('now') WHERE id = ${fix.id}`;
            } else if (fix.field === "options") {
              await pg`UPDATE questions SET options = ${fix.value}, updated_at = datetime('now') WHERE id = ${fix.id}`;
            } else if (fix.field === "answers") {
              await pg`UPDATE questions SET answers = ${fix.value}, updated_at = datetime('now') WHERE id = ${fix.id}`;
            } else if (fix.field === "explanation") {
              await pg`UPDATE questions SET explanation = ${fix.value}, updated_at = datetime('now') WHERE id = ${fix.id}`;
            } else if (fix.field === "source") {
              await pg`UPDATE questions SET source = ${fix.value}, updated_at = datetime('now') WHERE id = ${fix.id}`;
            }

            fixed++;
            if (fixed % 10 === 0 || fixed === fixes.length) {
              send({ step: "fixing", done: fixed, total: fixes.length });
            }
          } catch {
            // skip individual failures
          }
        }

        send({ step: "done", fixed });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        send({ step: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
