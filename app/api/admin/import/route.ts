/**
 * POST /api/admin/import
 *
 * Accepts an Excel (.xlsx/.xls) or CSV file, uses AI code execution
 * (Gemini codeExecution sandbox with pandas/openpyxl) to parse and
 * convert the data into standardised exam questions, then bulk-inserts
 * into the DB.
 *
 * The AI writes Python code to process the file — it does NOT read
 * every row via LLM tokens. One AI call handles any file size.
 *
 * Streams progress as Server-Sent Events.
 */

import { NextRequest } from "next/server";
import { aiGenerate, isAWS } from "@/lib/ai-client";
import { getDB, getNow } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getUserEmail } from "@/lib/user";
import { parseAiJsonAs } from "@/lib/ai-json";
import { ImportedQuestionsSchema } from "@/lib/ai-schemas";
import type { ImportedQuestion } from "@/lib/ai-schemas";
import { parseUploadedFile } from "@/lib/file-parser";

// ── Constants ────────────────────────────────────────────────────────────────

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "X-Accel-Buffering": "no",
};

// ── System instruction for code execution ───────────────────────────────────

const CODE_EXEC_PROMPT = `You are a data conversion specialist. You have an uploaded file (Excel or CSV).

Write Python code to:
1. Read the file using pandas (pd.read_excel or pd.read_csv as appropriate)
2. Detect which columns contain: question number, question text, answer(s), choices, explanation
3. Convert ALL rows into the required JSON format
4. Print ONLY the JSON array to stdout (no other output)

Output JSON format:
[{"num":1,"question":"...","choices":["A. opt","B. opt","C. opt","D. opt"],"answer":["A"],"explanation":"...","source":""}]

Field rules:
- num: integer, 1-based question number
- question: full question text (no choices embedded)
- choices: string array, each starting with a letter and period, e.g. "A. Option text"
- answer: array of uppercase letters, e.g. ["A"] or ["A","C"] for multi-select
- explanation: explanation text (empty string if none)
- source: source URL or reference (empty string if none)

Important:
- Convert ALL rows — do NOT truncate or summarize
- Japanese/Chinese/Korean column headers are fine — identify by content
- Handle both embedded choices (in same cell, newline-separated) and separate choice columns
- Normalise answers: extract uppercase letters only (e.g. "B ↓ A" → ["A","B"])
- Skip rows where both question and answer are empty
- If choices are not labelled with letters, assign A, B, C, D... in order
- If a column appears to be a "duplicate" or "check" flag, ignore it`;

// ── Fallback: column mapping prompt for Bedrock ─────────────────────────────

const MAPPING_PROMPT = `You are a data conversion specialist. Analyze the sample rows below and return a JSON object describing the column mapping.

Return ONLY this JSON (no markdown, no explanation):
{
  "questionCol": <0-based column index for question text>,
  "answerCol": <0-based column index for answer>,
  "explanationCol": <0-based column index for explanation, or -1 if none>,
  "numCol": <0-based column index for question number, or -1 if none>,
  "choicesCols": [<0-based indices of columns containing individual choices>],
  "choicesEmbedded": <true if choices are embedded in the question cell>,
  "answerSeparator": <string used to separate multiple answers, e.g. "," or "↓" or null if single>
}

Rules:
- Identify columns by their content, not just headers
- Japanese/Chinese/Korean headers are fine
- Ignore columns that are flags/checks/duplicates
- choicesCols should be empty if choices are embedded in question`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildOptions(choices: string[]): { label: string; text: string }[] {
  return choices.map((c, i) => {
    const m = c.match(/^([A-Z])[.)]\s*([\s\S]+)$/);
    if (m) return { label: m[1], text: m[2].trim() };
    return { label: String.fromCharCode(65 + i), text: c.trim() };
  });
}

function rowsToCsv(headers: string[], rows: string[][]): string {
  const escape = (s: string) => {
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(row.map((c) => escape(c ?? "")).join(","));
  }
  return lines.join("\n");
}

// ── Bedrock fallback: deterministic mapping ─────────────────────────────────

interface ColumnMapping {
  questionCol: number;
  answerCol: number;
  explanationCol: number;
  numCol: number;
  choicesCols: number[];
  choicesEmbedded: boolean;
  answerSeparator: string | null;
}

const ColumnMappingKeys = [
  "questionCol", "answerCol", "explanationCol", "numCol",
  "choicesCols", "choicesEmbedded", "answerSeparator",
] as const;

function applyMapping(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping
): ImportedQuestion[] {
  const questions: ImportedQuestion[] = [];
  let num = 1;

  for (const row of rows) {
    const questionText = (row[mapping.questionCol] ?? "").trim();
    const answerRaw = (row[mapping.answerCol] ?? "").trim();

    if (!questionText && !answerRaw) continue;

    // Parse answer letters
    const answer = answerRaw
      .split(/[,\s↓→]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z]$/.test(s));

    // Parse choices
    let choices: string[] = [];
    if (mapping.choicesCols.length > 0) {
      choices = mapping.choicesCols
        .map((ci, i) => {
          const text = (row[ci] ?? "").trim();
          return text ? `${String.fromCharCode(65 + i)}. ${text}` : "";
        })
        .filter(Boolean);
    } else if (mapping.choicesEmbedded) {
      // Try to extract choices from question text
      const choicePattern = /^[A-Z][.)]\s*.+/gm;
      const matches = questionText.match(choicePattern);
      if (matches) {
        choices = matches.map((m, i) => {
          const cm = m.match(/^([A-Z])[.)]\s*(.+)/);
          return cm ? `${cm[1]}. ${cm[2].trim()}` : `${String.fromCharCode(65 + i)}. ${m.trim()}`;
        });
      }
    }

    const explanation = mapping.explanationCol >= 0
      ? (row[mapping.explanationCol] ?? "").trim()
      : "";

    const qNum = mapping.numCol >= 0
      ? parseInt(row[mapping.numCol], 10) || num
      : num;

    questions.push({
      num: qNum,
      question: questionText,
      choices,
      answer,
      explanation,
      source: "",
    });
    num++;
  }

  return questions;
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
  const hiddenColsRaw = (formData.get("hiddenCols") as string | null)?.trim() || null;
  const hiddenCols: Set<number> = new Set(
    hiddenColsRaw ? (JSON.parse(hiddenColsRaw) as number[]) : []
  );

  if (!file || !examId) {
    return new Response(JSON.stringify({ error: "file and examId are required" }), { status: 400 });
  }

  const pg = getDB();
  if (!pg) {
    return new Response(JSON.stringify({ error: "DB not available" }), { status: 503 });
  }
  const now = getNow(pg);
  const userEmail = await getUserEmail();

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: object) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* client disconnected */ }
      };

      try {
        // ── 1. Parse file server-side ──────────────────────────────────────
        send({ step: "upload", message: "Reading file..." });

        const parsed = await parseUploadedFile(file, sheetHint);
        if (parsed.rows.length === 0) {
          send({ step: "error", message: "File contains no data rows." });
          return controller.close();
        }

        // Filter out hidden columns
        if (hiddenCols.size > 0) {
          parsed.headers = parsed.headers.filter((_, i) => !hiddenCols.has(i));
          parsed.rows = parsed.rows.map((row) =>
            row.filter((_, i) => !hiddenCols.has(i))
          );
        }

        send({
          step: "inspect",
          message: `Found ${parsed.rows.length} rows in "${parsed.sheet}" with columns: ${parsed.headers.join(", ")}`,
        });

        // ── 2. Convert via AI ────────────────────────────────────────────
        let allQuestions: ImportedQuestion[];

        if (!isAWS) {
          // ── Gemini: code execution ──────────────────────────────────────
          send({ step: "convert", message: `Processing ${parsed.rows.length} rows via AI code execution...` });

          const csvText = rowsToCsv(parsed.headers, parsed.rows);
          const prompt = `${CODE_EXEC_PROMPT}\n\nHere is the data as CSV (${parsed.rows.length} rows):\n\n${csvText}`;

          const result = await aiGenerate(prompt, {
            useCodeExecution: true,
            timeoutMs: 180_000,
          });

          const jsonStr = result.codeOutput || result.text;
          const { data, error } = parseAiJsonAs(jsonStr, ImportedQuestionsSchema);
          if (!data) {
            send({ step: "error", message: `AI code execution failed: ${error}` });
            return controller.close();
          }
          allQuestions = data;
        } else {
          // ── Bedrock fallback: column mapping ────────────────────────────
          send({ step: "convert", message: "Detecting column structure..." });

          const sampleRows = parsed.rows.slice(0, 10);
          const sampleText = `Columns: ${parsed.headers.join(" | ")}\n\n` +
            sampleRows.map((row, i) =>
              `Row ${i + 1}: ${parsed.headers.map((h, j) => `${h || `Col${j + 1}`}: ${(row[j] ?? "").slice(0, 200)}`).join(" | ")}`
            ).join("\n");

          const mappingResult = await aiGenerate(
            `${MAPPING_PROMPT}\n\nSample data:\n${sampleText}`,
            { jsonMode: true, maxTokens: 1024, timeoutMs: 30_000 }
          );

          let mapping: ColumnMapping;
          try {
            const raw = JSON.parse(mappingResult.text);
            // Validate required fields exist
            if (typeof raw.questionCol !== "number" || typeof raw.answerCol !== "number") {
              throw new Error("Missing questionCol or answerCol");
            }
            mapping = {
              questionCol: raw.questionCol,
              answerCol: raw.answerCol,
              explanationCol: raw.explanationCol ?? -1,
              numCol: raw.numCol ?? -1,
              choicesCols: Array.isArray(raw.choicesCols) ? raw.choicesCols : [],
              choicesEmbedded: raw.choicesEmbedded ?? false,
              answerSeparator: raw.answerSeparator ?? null,
            };
          } catch (e) {
            send({ step: "error", message: `Column mapping failed: ${e instanceof Error ? e.message : String(e)}` });
            return controller.close();
          }

          send({ step: "convert", message: `Mapping: question=col${mapping.questionCol}, answer=col${mapping.answerCol}` });
          allQuestions = applyMapping(parsed.headers, parsed.rows, mapping);
        }

        if (allQuestions.length === 0) {
          send({ step: "error", message: "No questions extracted from file." });
          return controller.close();
        }

        send({ step: "convert", message: `Extracted ${allQuestions.length} questions` });

        // ── 3. Bulk insert ───────────────────────────────────────────────
        send({ step: "saving", message: `Saving ${allQuestions.length} questions...`, done: 0, total: allQuestions.length });

        await pg`
          INSERT INTO exams (id, name, lang, created_by)
          VALUES (${examId}, ${examName ?? examId}, ${lang}, ${userEmail})
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, lang = EXCLUDED.lang`;

        let saved = 0;
        for (const q of allQuestions) {
          const qId = `${examId}__${q.num}`;
          const options = buildOptions(q.choices);

          await pg`
            INSERT INTO questions
              (id, exam_id, num, question_text, options, answers, explanation, source,
               explanation_sources, created_by, created_at, added_at)
            VALUES (
              ${qId}, ${examId}, ${q.num}, ${q.question},
              ${JSON.stringify(options)}, ${JSON.stringify(q.answer)},
              ${q.explanation}, ${q.source}, ${"[]"}, ${userEmail}, ${now}, ${now}
            )
            ON CONFLICT (id) DO UPDATE SET
              question_text = EXCLUDED.question_text,
              options       = EXCLUDED.options,
              answers       = EXCLUDED.answers,
              explanation   = EXCLUDED.explanation,
              source        = EXCLUDED.source`;

          saved++;
          if (saved % 50 === 0 || saved === allQuestions.length) {
            send({ step: "saving", done: saved, total: allQuestions.length });
          }
        }

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
