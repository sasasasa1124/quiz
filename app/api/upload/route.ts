export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { getUserEmail } from "@/lib/user";
import { getDB } from "@/lib/db";



// RFC 4180-compliant CSV parser (edge-compatible, no Node.js deps).
// Handles both:
//   1. Quoted cells with embedded real newlines  (Python csv.writer output)
//   2. Cells containing the literal two-char sequence \n  (some manual exports)
function parseCSV(text: string): Record<string, string>[] {
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  function parseAllCells(s: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let i = 0;
    while (i <= s.length) {
      if (i === s.length || s[i] === "\n") {
        rows.push(row);
        row = [];
        i++;
      } else if (s[i] === ",") {
        row.push("");
        i++;
      } else if (s[i] === '"') {
        i++;
        let cell = "";
        while (i < s.length) {
          if (s[i] === '"' && s[i + 1] === '"') { cell += '"'; i += 2; }
          else if (s[i] === '"') { i++; break; }
          else { cell += s[i++]; } // real newlines inside quotes are kept as-is
        }
        row.push(cell);
        if (s[i] === ",") i++;
      } else {
        let cell = "";
        while (i < s.length && s[i] !== "," && s[i] !== "\n") cell += s[i++];
        row.push(cell);
        if (s[i] === ",") i++;
      }
    }
    return rows.filter(r => r.some(c => c.trim()));
  }

  const [headerRow, ...dataRows] = parseAllCells(src);
  if (!headerRow) return [];
  return dataRows.map(cols => {
    const rec: Record<string, string> = {};
    // Also expand literal \n escape sequences produced by manual CSV writing
    headerRow.forEach((h, idx) => { rec[h] = (cols[idx] ?? "").replace(/\\n/g, "\n"); });
    return rec;
  });
}

type Locale = "ja" | "en" | "zh" | "ko";

function detectLanguage(records: Record<string, string>[]): Locale {
  if (records.length === 0) return "ja";
  const jaRe = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g;
  const enRe = /[A-Za-z]/g;
  let ja = 0, en = 0;
  for (const row of records) {
    const text = Object.values(row).join(" ");
    if ((text.match(jaRe) ?? []).length > (text.match(enRe) ?? []).length) ja++; else en++;
  }
  return ja >= en ? "ja" : "en";
}

function parseChoices(raw: string): Array<{ label: string; text: string }> {
  const parts = raw.split(/\n|\s*\|\s*/).filter((p) => p.trim());
  const choices: Array<{ label: string; text: string }> = [];
  for (const part of parts) {
    const m = part.match(/^([A-Z])[.)]\s*([\s\S]+)$/);
    if (m) choices.push({ label: m[1], text: m[2].trim() });
    else if (part.trim()) choices.push({ label: String.fromCharCode(65 + choices.length), text: part.trim() });
  }
  return choices;
}

function parseAnswers(raw: string): string[] {
  return raw.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]$/.test(s));
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const name = file.name.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
  if (!name.endsWith(".csv")) {
    return NextResponse.json({ error: "CSV only" }, { status: 400 });
  }

  const text = await file.text();
  const records = parseCSV(text);

  if (records.length === 0) {
    return NextResponse.json({ error: "Empty CSV" }, { status: 400 });
  }

  const cols = Object.keys(records[0]);
  const hasEn = cols.includes("question") && cols.includes("choices") && (cols.includes("answer") || cols.includes("answers"));
  if (!hasEn) {
    return NextResponse.json({
      error: "CSV には question/choices/answer カラムが必要です"
    }, { status: 400 });
  }

  // appendTo: if set, append questions to this existing exam instead of creating/replacing
  const appendTo = (formData.get("appendTo") as string | null)?.trim() || null;

  const pg = getDB();

  if (appendTo) {
    // ── Append mode ────────────────────────────────────────────────────────
    if (!pg) return NextResponse.json({ error: "DB not available" }, { status: 500 });

    const [examRow] = await pg<{ id: string; name: string; lang: string }[]>`SELECT id, name, lang FROM exams WHERE id = ${appendTo}`;
    if (!examRow) return NextResponse.json({ error: `Exam not found: ${appendTo}` }, { status: 404 });

    const [maxRow] = await pg<{ max_num: number }[]>`SELECT COALESCE(MAX(num), 0)::int AS max_num FROM questions WHERE exam_id = ${appendTo}`;
    let nextNum = (maxRow?.max_num ?? 0) + 1;

    for (const row of records) {
      const num = nextNum++;
      const id = `${appendTo}__${num}`;
      const choices = parseChoices(row["choices"] ?? "");
      const answers = parseAnswers(row["answer"] ?? row["answers"] ?? "");
      const explanationSources = (row["explanation_sources"] ?? "")
        ? (row["explanation_sources"] ?? "").split(/\s*\|\s*/).map((s: string) => s.trim()).filter(Boolean)
        : [];
      const isDuplicate = !!(row["duplicate"] ?? "").trim() ? 1 : 0;

      await pg`INSERT INTO questions (id, exam_id, num, question_text, options, answers, explanation, source, explanation_sources, is_duplicate, created_at, added_at)
        VALUES (${id}, ${appendTo}, ${num}, ${row["question"] ?? ""}, ${JSON.stringify(choices)}, ${JSON.stringify(answers)}, ${row["explanation"] ?? ""}, ${row["source"] ?? ""}, ${JSON.stringify(explanationSources)}, ${isDuplicate}, NOW(), NOW())`;
    }

    const [countRow] = await pg<{ cnt: number }[]>`SELECT COUNT(*)::int AS cnt FROM questions WHERE exam_id = ${appendTo}`;

    return NextResponse.json({
      exam: {
        id: examRow.id,
        name: examRow.name,
        language: examRow.lang as Locale,
        questionCount: countRow?.cnt ?? 0,
      },
      appended: records.length,
    });
  }

  // ── New exam mode ─────────────────────────────────────────────────────────
  const examId = name.replace(".csv", "");
  const explicitLang = formData.get("language") as string | null;
  const validLocales: Locale[] = ["ja", "en", "zh", "ko"];
  const language: Locale = validLocales.includes(explicitLang as Locale)
    ? (explicitLang as Locale)
    : detectLanguage(records);
  const displayName = examId.replace(/_en$/, "").replace(/_/g, " ");
  const uploaderEmail = await getUserEmail();

  if (pg) {
    await pg`INSERT INTO exams (id, name, lang, created_by) VALUES (${examId}, ${displayName}, ${language}, ${uploaderEmail})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, lang = EXCLUDED.lang`;

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const num = parseInt(row["#"] ?? String(i + 1), 10);
      const id = `${examId}__${num}`;
      const choices = parseChoices(row["choices"] ?? "");
      const answers = parseAnswers(row["answer"] ?? row["answers"] ?? "");
      const explanationSources = (row["explanation_sources"] ?? "")
        ? (row["explanation_sources"] ?? "").split(/\s*\|\s*/).map((s: string) => s.trim()).filter(Boolean)
        : [];
      const isDuplicate = !!(row["duplicate"] ?? "").trim() ? 1 : 0;

      await pg`INSERT INTO questions (id, exam_id, num, question_text, options, answers, explanation, source, explanation_sources, is_duplicate, created_at, added_at)
        VALUES (${id}, ${examId}, ${num}, ${row["question"] ?? ""}, ${JSON.stringify(choices)}, ${JSON.stringify(answers)}, ${row["explanation"] ?? ""}, ${row["source"] ?? ""}, ${JSON.stringify(explanationSources)}, ${isDuplicate}, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET question_text = EXCLUDED.question_text, options = EXCLUDED.options, answers = EXCLUDED.answers, explanation = EXCLUDED.explanation, updated_at = NOW()`;
    }
  }

  return NextResponse.json({
    exam: { id: examId, name: displayName, language, questionCount: records.length }
  });
}
