export const runtime = 'edge';
/**
 * POST /api/admin/import
 *
 * Accepts an Excel (.xlsx/.xls) or CSV file, uploads it to the Gemini Files API,
 * runs an agentic codeExecution loop to inspect the structure and convert to a
 * standardised question list, then bulk-inserts into PostgreSQL.
 *
 * Streams progress as Server-Sent Events:
 *   data: { step: "upload" | "inspect" | "convert" | "saving" | "done" | "error", ...fields }
 */

import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { Content, GenerateContentResponse } from "@google/genai";
import { getDB, getSetting } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getUserEmail } from "@/lib/user";
import { parseAiJson } from "@/lib/ai-json";
import { ImportedQuestionsSchema } from "@/lib/ai-schemas";
import type { ImportedQuestion } from "@/lib/ai-schemas";

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_TURNS = 6;
const JSON_START = "===JSON_START===";
const JSON_END = "===JSON_END===";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "X-Accel-Buffering": "no",
};

// ── System instruction ───────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are a data conversion specialist for a Salesforce certification quiz application.
Your task is to convert an arbitrary Excel or CSV file into a standardised list of exam questions.

## Output Format

Output a JSON array between these exact markers:
${JSON_START}
[{"num":1,"question":"...","choices":["A. opt","B. opt","C. opt","D. opt"],"answer":["A"],"explanation":"...","source":""}]
${JSON_END}

Field rules:
- num: integer, 1-based question number
- question: full question text (no choices embedded)
- choices: string array, each starting with a letter and period, e.g. "A. Option text"
- answer: array of uppercase letters, e.g. ["A"] or ["A","C"] for multi-select
- explanation: explanation text (empty string if none)
- source: source URL or reference (empty string if none)

## Workflow

1. In your FIRST response, write code to inspect the file:
   - List available files in the current directory
   - If Excel: print sheet names, column headers of each sheet, and 3 sample rows
   - If CSV: print column headers and 3 sample rows
   - Then describe your column mapping plan in text

2. In your SECOND response (after the user says "proceed"):
   - Write code that reads the file and converts ALL questions to the JSON format above
   - Print the full JSON between ${JSON_START} and ${JSON_END}
   - Do NOT truncate — include every question

## Important notes
- Use codeExecution to inspect and convert the file (pandas and openpyxl are available)
- The uploaded file is accessible in the current working directory by its display name
- Japanese column headers are fine — identify columns by content/position, not just name
- Handle both embedded choices (in the same cell, newline-separated) and separate choice columns
- Normalise answers: extract uppercase letters only
- Skip rows where both question and answer are empty`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function detectMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    csv: "text/csv",
  };
  return map[ext] ?? "application/octet-stream";
}

/** Extract JSON array from code execution output between marker lines. */
function extractJsonFromOutput(text: string): unknown {
  const s = text.indexOf(JSON_START);
  const e = text.indexOf(JSON_END);
  if (s === -1 || e === -1 || e <= s) return null;
  return parseAiJson(text.slice(s + JSON_START.length, e).trim());
}

/** Scan all codeExecutionResult parts in a response for the JSON markers. */
function extractJsonFromResponse(response: GenerateContentResponse): unknown {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.codeExecutionResult?.output) {
      const found = extractJsonFromOutput(part.codeExecutionResult.output);
      if (found !== null) return found;
    }
    // Also check plain text parts (model sometimes embeds JSON in text)
    if (part.text) {
      const found = extractJsonFromOutput(part.text);
      if (found !== null) return found;
    }
  }
  return null;
}

/** Build {label, text} choices from the string array the agent outputs. */
function buildOptions(choices: string[]): { label: string; text: string }[] {
  return choices.map((c, i) => {
    const m = c.match(/^([A-Z])[.)]\s*([\s\S]+)$/);
    if (m) return { label: m[1], text: m[2].trim() };
    return { label: String.fromCharCode(65 + i), text: c.trim() };
  });
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const examId = (formData.get("examId") as string | null)?.trim();
  const examName = (formData.get("examName") as string | null)?.trim() || examId;
  const lang = (formData.get("lang") as string | null) ?? "ja";
  const sheetHint = (formData.get("sheetHint") as string | null)?.trim() || null;

  if (!file || !examId) {
    return new Response(JSON.stringify({ error: "file and examId are required" }), { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), { status: 500 });
  }

  const pg = getDB();
  if (!pg) {
    return new Response(JSON.stringify({ error: "DB not available" }), { status: 503 });
  }

  const userEmail = await getUserEmail();

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

      try {
        // ── 1. Upload file to Gemini Files API ────────────────────────────
        send({ step: "upload", message: "Uploading file to Gemini..." });

        const ai = new GoogleGenAI({ apiKey });
        const model = (await getSetting("gemini_model")) ?? "gemini-2.5-flash-preview-05-20";

        const fileBytes = await file.arrayBuffer();
        const mimeType = detectMimeType(file.name);
        const blob = new Blob([fileBytes], { type: mimeType });

        let fileInfo = await ai.files.upload({
          file: blob,
          config: { mimeType, displayName: file.name },
        });

        // Poll until ACTIVE (binary files may take a few seconds)
        for (let i = 0; i < 15 && fileInfo.state === "PROCESSING"; i++) {
          await sleep(2000);
          fileInfo = await ai.files.get({ name: fileInfo.name! });
        }

        if (fileInfo.state !== "ACTIVE") {
          send({ step: "error", message: `File upload failed (state: ${fileInfo.state})` });
          return controller.close();
        }

        // ── 2. Agentic loop ───────────────────────────────────────────────
        send({ step: "inspect", message: "Analyzing file structure..." });

        const sheetClause = sheetHint
          ? ` Focus on the sheet named "${sheetHint}".`
          : "";

        const contents: Content[] = [
          {
            role: "user",
            parts: [
              {
                text: `Please inspect this exam file and identify its structure.${sheetClause}

First, list the available files in the current directory using os.listdir('.') or similar.
Then open the file, list sheet names (if Excel), print column headers, and show 3–5 sample data rows.
Finally, describe your plan for mapping columns to: num, question, choices, answer, explanation, source.`,
              },
              {
                fileData: {
                  fileUri: fileInfo.uri!,
                  mimeType,
                },
              },
            ],
          },
        ];

        let rawQuestions: unknown = null;

        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              tools: [{ codeExecution: {} }],
            },
          });

          // Accumulate conversation history
          const modelContent = response.candidates?.[0]?.content;
          if (modelContent) contents.push(modelContent);

          // Relay agent log as inspect events (first two turns)
          if (turn < 2 && response.text) {
            send({ step: "inspect", message: response.text.slice(0, 400) });
          }

          // Try to extract JSON from this turn's code execution output
          rawQuestions = extractJsonFromResponse(response);
          if (rawQuestions !== null) {
            send({ step: "convert", message: "Questions extracted, validating..." });
            break;
          }

          // Inject continuation prompt
          if (turn === 0) {
            // After inspection: ask for full conversion
            send({ step: "convert", message: "Converting questions..." });
            contents.push({
              role: "user",
              parts: [
                {
                  text: `Great. Now please convert ALL questions in the file to the JSON format.
Write Python code that reads the file and prints every question between the markers:
${JSON_START}
[...all questions as JSON array...]
${JSON_END}

Include every question — do not truncate. Use the column mapping you just identified.`,
                },
              ],
            });
          } else {
            // Subsequent turns: nudge
            contents.push({
              role: "user",
              parts: [
                {
                  text: `Please output the complete questions JSON between ${JSON_START} and ${JSON_END} markers in a code execution block. Do not truncate.`,
                },
              ],
            });
          }
        }

        if (rawQuestions === null) {
          send({ step: "error", message: "Agent did not produce questions after maximum turns." });
          return controller.close();
        }

        // ── 3. Zod validation ─────────────────────────────────────────────
        const validation = ImportedQuestionsSchema.safeParse(rawQuestions);
        if (!validation.success) {
          send({ step: "error", message: `Schema validation failed: ${validation.error.message}` });
          return controller.close();
        }

        const questions: ImportedQuestion[] = validation.data;
        if (questions.length === 0) {
          send({ step: "error", message: "Agent returned 0 questions." });
          return controller.close();
        }

        // ── 4. Bulk insert ────────────────────────────────────────────────
        send({ step: "saving", message: `Saving ${questions.length} questions...`, done: 0, total: questions.length });

        // Upsert exam record
        await pg`
          INSERT INTO exams (id, name, lang, created_by)
          VALUES (${examId}, ${examName ?? examId}, ${lang}, ${userEmail})
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
              ${q.explanation}, ${q.source}, ${"[]"}, ${userEmail}, datetime('now'), datetime('now')
            )
            ON CONFLICT (id) DO UPDATE SET
              question_text = EXCLUDED.question_text,
              options       = EXCLUDED.options,
              answers       = EXCLUDED.answers,
              explanation   = EXCLUDED.explanation,
              source        = EXCLUDED.source`;

          saved++;
          if (saved % 20 === 0 || saved === questions.length) {
            send({ step: "saving", done: saved, total: questions.length });
          }
        }

        // ── 5. Clean up uploaded file ──────────────────────────────────────
        await ai.files.delete({ name: fileInfo.name! }).catch(() => {/* non-fatal */});

        send({ step: "done", examId, count: saved });
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
