import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";


// Minimal CSV parser (edge-compatible, no Node.js deps)
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  function splitRow(row: string): string[] {
    const cells: string[] = [];
    let i = 0;
    while (i < row.length) {
      if (row[i] === '"') {
        i++;
        let cell = "";
        while (i < row.length) {
          if (row[i] === '"' && row[i + 1] === '"') { cell += '"'; i += 2; }
          else if (row[i] === '"') { i++; break; }
          else { cell += row[i++]; }
        }
        cells.push(cell);
        if (row[i] === ",") i++;
      } else {
        const end = row.indexOf(",", i);
        if (end === -1) { cells.push(row.slice(i)); i = row.length; }
        else { cells.push(row.slice(i, end)); i = end + 1; }
      }
    }
    return cells;
  }

  const headers = splitRow(lines[0]);
  const records: Record<string, string>[] = [];
  for (let li = 1; li < lines.length; li++) {
    if (!lines[li].trim()) continue;
    const values = splitRow(lines[li]);
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => { rec[h] = values[idx] ?? ""; });
    records.push(rec);
  }
  return records;
}

function detectLanguage(records: Record<string, string>[]): "ja" | "en" {
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

  // Get D1 binding
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any = null;
  try {
    const { getRequestContext } = await import("@cloudflare/next-on-pages");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db = (getRequestContext() as any).env.DB;
  } catch {
    // local dev: no D1
  }

  if (appendTo) {
    // ── Append mode ────────────────────────────────────────────────────────
    if (!db) return NextResponse.json({ error: "DB not available" }, { status: 500 });

    const examRow = await db
      .prepare("SELECT id, name, lang FROM exams WHERE id = ?")
      .bind(appendTo)
      .first() as { id: string; name: string; lang: string } | null;
    if (!examRow) return NextResponse.json({ error: `Exam not found: ${appendTo}` }, { status: 404 });

    const maxRow = await db
      .prepare("SELECT COALESCE(MAX(num), 0) AS max_num FROM questions WHERE exam_id = ?")
      .bind(appendTo)
      .first() as { max_num: number } | null;
    let nextNum = (maxRow?.max_num ?? 0) + 1;

    for (const row of records) {
      const num = nextNum++;
      const id = `${appendTo}__${num}`;
      const questionText = esc(row["question"] ?? "");
      const choices = parseChoices(row["choices"] ?? "");
      const answers = parseAnswers(row["answer"] ?? row["answers"] ?? "");
      const explanation = esc(row["explanation"] ?? "");
      const source = esc(row["source"] ?? "");
      const isDuplicate = !!(row["duplicate"] ?? "").trim() ? 1 : 0;
      const optionsJson = esc(JSON.stringify(choices));
      const answersJson = esc(JSON.stringify(answers));

      await db.prepare(
        `INSERT INTO questions (id, exam_id, num, question_text, options, answers, explanation, source, is_duplicate) ` +
        `VALUES ('${id}', '${esc(appendTo)}', ${num}, '${questionText}', '${optionsJson}', '${answersJson}', '${explanation}', '${source}', ${isDuplicate})`
      ).run();
    }

    const countRow = await db
      .prepare("SELECT COUNT(*) AS cnt FROM questions WHERE exam_id = ?")
      .bind(appendTo)
      .first() as { cnt: number } | null;

    return NextResponse.json({
      exam: {
        id: examRow.id,
        name: examRow.name,
        language: examRow.lang as "ja" | "en",
        questionCount: countRow?.cnt ?? 0,
      },
      appended: records.length,
    });
  }

  // ── New exam mode ─────────────────────────────────────────────────────────
  const examId = name.replace(".csv", "");
  const language = detectLanguage(records);
  const displayName = examId.replace(/_en$/, "").replace(/_/g, " ");

  if (db) {
    await db.prepare(
      `INSERT OR REPLACE INTO exams (id, name, lang) VALUES ('${esc(examId)}', '${esc(displayName)}', '${language}')`
    ).run();

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const num = parseInt(row["#"] ?? String(i + 1), 10);
      const id = `${examId}__${num}`;
      const questionText = esc(row["question"] ?? "");
      const choices = parseChoices(row["choices"] ?? "");
      const answers = parseAnswers(row["answer"] ?? row["answers"] ?? "");
      const explanation = esc(row["explanation"] ?? "");
      const source = esc(row["source"] ?? "");
      const isDuplicate = !!(row["duplicate"] ?? "").trim() ? 1 : 0;
      const optionsJson = esc(JSON.stringify(choices));
      const answersJson = esc(JSON.stringify(answers));

      await db.prepare(
        `INSERT OR REPLACE INTO questions (id, exam_id, num, question_text, options, answers, explanation, source, is_duplicate) ` +
        `VALUES ('${id}', '${esc(examId)}', ${num}, '${questionText}', '${optionsJson}', '${answersJson}', '${explanation}', '${source}', ${isDuplicate})`
      ).run();
    }
  }

  return NextResponse.json({
    exam: { id: examId, name: displayName, language, questionCount: records.length }
  });
}
