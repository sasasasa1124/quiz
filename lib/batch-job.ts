/**
 * Async batch job processing for fill / refine / factcheck.
 *
 * Jobs are tracked in the `batch_jobs` table (migration 0021).
 * Processing runs in background:
 *   - Cloudflare: via ctx.waitUntil() (extends Worker lifetime beyond response)
 *   - AWS App Runner: via unawaited async (Node.js keeps event loop alive)
 */

import type { D1Client } from "@/lib/db";
import { getNow, isPg } from "@/lib/db";
import { aiGenerate } from "@/lib/ai-client";
import { parseAiJsonAs } from "@/lib/ai-json";
import { AiRefineResponseSchema, AiFactCheckResponseSchema, FillFromExplainSchema } from "@/lib/ai-schemas";
import { DEFAULT_REFINE_PROMPT, DEFAULT_FACTCHECK_PROMPT, DEFAULT_EXPLAIN_PROMPT } from "@/lib/types";
import type { Choice } from "@/lib/types";

// ── Types ───────────────────────────────────────────────────────────────────

export type JobType = "fill" | "refine" | "factcheck";
export type JobStatus = "pending" | "running" | "done" | "error";

export interface BatchJobRow {
  id: string;
  examId: string;
  jobType: JobType;
  status: JobStatus;
  done: number;
  total: number;
  skipped: number;
  resultCount: number;
  failed: number;
  errorMsg: string | null;
}

// ── DB helpers ──────────────────────────────────────────────────────────────

// Safety net: auto-create batch_jobs if migration 0021 was not applied (D1 or PostgreSQL).
// Only runs once per process/Worker isolate lifetime; IF NOT EXISTS makes it a no-op if the table exists.
let tableEnsured = false;
async function ensureTable(pg: D1Client) {
  if (tableEnsured) return;
  await pg`CREATE TABLE IF NOT EXISTS batch_jobs (
    id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', done INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0,
    result_count INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
    error_msg TEXT, params TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`;
  await pg`CREATE INDEX IF NOT EXISTS idx_batch_jobs_exam_id ON batch_jobs(exam_id)`;
  tableEnsured = true;
}

export async function createBatchJob(
  pg: D1Client, examId: string, jobType: JobType, params: Record<string, unknown>,
): Promise<string> {
  await ensureTable(pg);
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = getNow(pg);
  await pg`INSERT INTO batch_jobs (id, exam_id, job_type, status, params, created_at, updated_at)
           VALUES (${id}, ${examId}, ${jobType}, 'pending', ${JSON.stringify(params)}, ${now}, ${now})`;
  return id;
}

export async function getBatchJob(pg: D1Client, jobId: string): Promise<BatchJobRow | null> {
  await ensureTable(pg);
  type R = { id: string; exam_id: string; job_type: string; status: string; done: number; total: number; skipped: number; result_count: number; failed: number; error_msg: string | null };
  const [row] = await pg<R[]>`SELECT id, exam_id, job_type, status, done, total, skipped, result_count, failed, error_msg FROM batch_jobs WHERE id = ${jobId}`;
  if (!row) return null;
  return { id: row.id, examId: row.exam_id, jobType: row.job_type as JobType, status: row.status as JobStatus, done: row.done, total: row.total, skipped: row.skipped, resultCount: row.result_count, failed: row.failed, errorMsg: row.error_msg };
}

export async function getActiveJob(pg: D1Client, examId: string, jobType: JobType): Promise<BatchJobRow | null> {
  await ensureTable(pg);
  type R = { id: string; exam_id: string; job_type: string; status: string; done: number; total: number; skipped: number; result_count: number; failed: number; error_msg: string | null };

  // Only consider jobs updated within the last 60 minutes — older ones are zombie jobs from crashed workers.
  const freshCutoff = pg.unsafe(
    isPg()
      ? "updated_at::timestamptz > (NOW() - INTERVAL '60 minutes')"
      : "updated_at > datetime('now', '-60 minutes')"
  );
  const [row] = await pg<R[]>`
    SELECT id, exam_id, job_type, status, done, total, skipped, result_count, failed, error_msg
    FROM batch_jobs
    WHERE exam_id = ${examId} AND job_type = ${jobType}
      AND status IN ('pending', 'running') AND ${freshCutoff}
    ORDER BY created_at DESC LIMIT 1`;

  if (!row) {
    // Auto-clean any zombie jobs older than 60 minutes so they don't accumulate.
    const staleCutoff = pg.unsafe(
      isPg()
        ? "updated_at::timestamptz < (NOW() - INTERVAL '60 minutes')"
        : "updated_at < datetime('now', '-60 minutes')"
    );
    const now = getNow(pg);
    await pg`UPDATE batch_jobs SET status='error', error_msg='stale: auto-cleaned', updated_at=${now}
             WHERE exam_id = ${examId} AND job_type = ${jobType}
               AND status IN ('pending', 'running') AND ${staleCutoff}`;
    return null;
  }

  return { id: row.id, examId: row.exam_id, jobType: row.job_type as JobType, status: row.status as JobStatus, done: row.done, total: row.total, skipped: row.skipped, resultCount: row.result_count, failed: row.failed, errorMsg: row.error_msg };
}

async function setRunning(pg: D1Client, jobId: string, total: number, skipped: number) {
  const now = getNow(pg);
  await pg`UPDATE batch_jobs SET status='running', total=${total}, skipped=${skipped}, updated_at=${now} WHERE id=${jobId}`;
}

async function progress(pg: D1Client, jobId: string, done: number, resultCount: number, failed: number) {
  const now = getNow(pg);
  await pg`UPDATE batch_jobs SET done=${done}, result_count=${resultCount}, failed=${failed}, updated_at=${now} WHERE id=${jobId}`;
}

async function finish(pg: D1Client, jobId: string, done: number, resultCount: number, failed: number) {
  const now = getNow(pg);
  await pg`UPDATE batch_jobs SET status='done', done=${done}, result_count=${resultCount}, failed=${failed}, updated_at=${now} WHERE id=${jobId}`;
}

async function fail(pg: D1Client, jobId: string, msg: string) {
  const now = getNow(pg);
  await pg`UPDATE batch_jobs SET status='error', error_msg=${msg}, updated_at=${now} WHERE id=${jobId}`;
}

// ── Fill job ────────────────────────────────────────────────────────────────

export async function runFillJob(
  pg: D1Client, jobId: string, examId: string,
  params: { userPrompt?: string; forceRefill?: boolean; refillShort?: boolean },
): Promise<void> {
  const { userPrompt, forceRefill = false, refillShort = false } = params;
  const now = getNow(pg);
  try {
    type QR = { id: string; question_text: string; options: string; answers: string; explanation: string; category: string | null; filled_at: string | null };
    const all = await pg<QR[]>`SELECT id, question_text, options, answers, explanation, category, filled_at FROM questions WHERE exam_id=${examId} ORDER BY num ASC`;
    const candidates = all.filter((q) => {
      if (!q.question_text.trim()) return false;
      const ans = JSON.parse(q.answers ?? "[]") as string[];
      // refillShort: re-fill questions whose explanation lacks the new structured format
      if (refillShort && !forceRefill) {
        const isOldFormat = !q.explanation?.includes("[Key Concepts]");
        if (isOldFormat) return true;
      }
      if (!forceRefill && q.filled_at) return false;
      return forceRefill || ans.length === 0 || !q.explanation || !q.category;
    });

    // Canonical categories
    const [examRow] = await pg<{ name: string }[]>`SELECT name FROM exams WHERE id=${examId}`;
    const existingCats = await pg<{ category: string }[]>`SELECT DISTINCT category FROM questions WHERE exam_id=${examId} AND category IS NOT NULL AND category!=''`;
    let cats = existingCats.map((r) => r.category);
    if (cats.length < 3 && candidates.some((q) => !q.category)) {
      try {
        const { text } = await aiGenerate(`You are an expert on Salesforce/MuleSoft certification exams.\nFind the official exam guide for "${examRow?.name ?? examId}".\nReturn a JSON array of official topic areas (6-12 items, concise English labels).\nReturn ONLY a JSON array of strings.`, { useSearch: true });
        const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/, "")) as string[];
        if (Array.isArray(parsed) && parsed.length >= 3) cats = parsed;
      } catch { /* keep existing */ }
    }

    await setRunning(pg, jobId, candidates.length, all.length - candidates.length);
    if (candidates.length === 0) { await finish(pg, jobId, 0, 0, 0); return; }

    let done = 0, filled = 0, failed = 0;
    for (const q of candidates) {
      try {
        const choices = JSON.parse(q.options) as Choice[];
        const answers = JSON.parse(q.answers ?? "[]") as string[];
        const missing: string[] = [];
        if (answers.length === 0) missing.push("answers");
        if (!q.explanation) missing.push("explanation");
        if (!q.category) missing.push("category");

        if (missing.length === 0 && !forceRefill) {
          await pg`UPDATE questions SET filled_at=${now} WHERE id=${q.id}`;
          done++;
          await progress(pg, jobId, done, filled, failed);
          continue;
        }

        const choicesText = choices.map((c) => `${c.label}. ${c.text}`).join("\n");
        const answersText = answers.length > 0 ? answers.join(", ") : "(unknown — determine the correct answer)";
        const catConstraint = missing.includes("category")
          ? `\n\nAlso include a "category" field: ${cats.length >= 3 ? `one of: ${cats.map((c) => `"${c}"`).join(", ")}` : 'a short topic label'}`
          : "";
        const prompt = (userPrompt || DEFAULT_EXPLAIN_PROMPT)
          .replace("{question}", q.question_text)
          .replace("{choices}", choicesText)
          .replace("{answers}", answersText)
          .replace("{explanation}", q.explanation ? `Current explanation: ${q.explanation}` : "")
          + catConstraint;

        let result: { coreConcept?: string; answers?: string[]; explanation?: string; category?: string } | null = null;
        for (let retries = 2; retries >= 0 && !result; retries--) {
          try {
            const { text } = await aiGenerate(prompt, { jsonMode: true, useSearch: true });
            const { data } = parseAiJsonAs(text, FillFromExplainSchema);
            if (data) result = data;
          } catch { /* retry */ }
        }

        if (result) {
          const newAns = missing.includes("answers") && Array.isArray(result.answers) && result.answers.length > 0 ? JSON.stringify(result.answers) : null;
          const newExp = (forceRefill || refillShort || missing.includes("explanation")) && result.explanation ? result.explanation : null;
          const newCat = missing.includes("category") && result.category ? result.category : null;
          const newCore = result.coreConcept ?? null;
          if (newAns || newExp || newCat || newCore) {
            await pg`UPDATE questions SET answers=COALESCE(${newAns},answers), explanation=COALESCE(${newExp},explanation), core_concept=COALESCE(${newCore},core_concept), category=COALESCE(${newCat},category), filled_at=${now}, updated_at=${now} WHERE id=${q.id}`;
            filled++;
          } else {
            await pg`UPDATE questions SET filled_at=${now} WHERE id=${q.id}`;
          }
        }
      } catch { failed++; }
      done++;
      await progress(pg, jobId, done, filled, failed);
    }
    await finish(pg, jobId, done, filled, failed);
  } catch (e) {
    await fail(pg, jobId, e instanceof Error ? e.message : String(e));
  }
}

// ── Refine job ──────────────────────────────────────────────────────────────

export async function runRefineJob(
  pg: D1Client, jobId: string, examId: string,
  params: { userPrompt?: string; forceRefine?: boolean },
): Promise<void> {
  const { userPrompt, forceRefine = false } = params;
  const now = getNow(pg);
  try {
    type QR = { id: string; question_text: string; options: string; answers: string; refined_at: string | null };
    const all = await pg<QR[]>`SELECT id, question_text, options, answers, refined_at FROM questions WHERE exam_id=${examId} AND question_text!='' ORDER BY num ASC`;
    const candidates = forceRefine ? all : all.filter((r) => !r.refined_at);

    await setRunning(pg, jobId, candidates.length, all.length - candidates.length);
    if (candidates.length === 0) { await finish(pg, jobId, 0, 0, 0); return; }

    let done = 0, refined = 0, failed = 0;
    for (const q of candidates) {
      try {
        const choices = JSON.parse(q.options) as Choice[];
        const answers = JSON.parse(q.answers ?? "[]") as string[];
        const choicesText = choices.map((c) => `${c.label}. ${c.text}`).join("\n");
        const prompt = (userPrompt || DEFAULT_REFINE_PROMPT)
          .replace("{question}", q.question_text)
          .replace("{choices}", choicesText)
          .replace("{answers}", answers.join(", "));

        const { text: raw } = await aiGenerate(prompt, { jsonMode: true, useSearch: true });
        const { data: result, error: parseError } = parseAiJsonAs(raw, AiRefineResponseSchema);
        if (parseError || !result) throw new Error(parseError ?? "parse failed");

        const questionChanged = result.question !== q.question_text;
        const choicesChanged = result.choices.some((c: Choice) => {
          const orig = choices.find((o) => o.label === c.label);
          return orig ? orig.text !== c.text : false;
        });

        if (questionChanged || choicesChanged) {
          await pg`UPDATE questions SET question_text=${result.question}, options=${JSON.stringify(result.choices)}, version=version+1, refined_at=${now}, updated_at=${now} WHERE id=${q.id}`;
          refined++;
        } else {
          await pg`UPDATE questions SET refined_at=${now} WHERE id=${q.id}`;
        }
      } catch { failed++; }
      done++;
      await progress(pg, jobId, done, refined, failed);
    }
    await finish(pg, jobId, done, refined, failed);
  } catch (e) {
    await fail(pg, jobId, e instanceof Error ? e.message : String(e));
  }
}

// ── Factcheck job ───────────────────────────────────────────────────────────

export async function runFactCheckJob(
  pg: D1Client, jobId: string, examId: string,
  params: { userPrompt?: string; forceRecheck?: boolean },
): Promise<void> {
  const { userPrompt, forceRecheck = false } = params;
  const now = getNow(pg);
  try {
    type QR = { id: string; question_text: string; options: string; answers: string; fact_checked_at: string | null };
    let all: QR[];
    let hasCol = true;
    try {
      all = await pg<QR[]>`SELECT id, question_text, options, answers, fact_checked_at FROM questions WHERE exam_id=${examId} ORDER BY num ASC`;
    } catch {
      hasCol = false;
      const rows = await pg<Omit<QR, "fact_checked_at">[]>`SELECT id, question_text, options, answers FROM questions WHERE exam_id=${examId} ORDER BY num ASC`;
      all = rows.map((r) => ({ ...r, fact_checked_at: null }));
    }

    const candidates = all.filter((q) => {
      if (!q.question_text.trim()) return false;
      const ans = JSON.parse(q.answers) as string[];
      if (!ans.length) return false;
      return forceRecheck || !q.fact_checked_at;
    });

    await setRunning(pg, jobId, candidates.length, all.length - candidates.length);
    if (candidates.length === 0) { await finish(pg, jobId, 0, 0, 0); return; }

    let done = 0, fixed = 0, failed = 0;
    for (const q of candidates) {
      try {
        const choices = JSON.parse(q.options) as Choice[];
        const answers = JSON.parse(q.answers) as string[];
        const prompt = (userPrompt || DEFAULT_FACTCHECK_PROMPT)
          .replace("{question}", q.question_text)
          .replace("{choices}", choices.map((c) => `${c.label}. ${c.text}`).join("\n"))
          .replace("{answers}", answers.join(", "));

        const { text: raw } = await aiGenerate(prompt, { jsonMode: true, useSearch: true });
        const { data: result, error: parseError } = parseAiJsonAs(raw, AiFactCheckResponseSchema);
        if (parseError || !result) throw new Error(parseError ?? "parse failed");

        if (!result.isCorrect && result.correctAnswers?.length) {
          if (hasCol) {
            await pg`UPDATE questions SET answers=${JSON.stringify(result.correctAnswers)}, explanation=CASE WHEN ${result.explanation}!='' THEN ${result.explanation} ELSE explanation END, fact_checked_at=${now}, version=version+1, updated_at=${now} WHERE id=${q.id}`;
          } else {
            await pg`UPDATE questions SET answers=${JSON.stringify(result.correctAnswers)}, explanation=CASE WHEN ${result.explanation}!='' THEN ${result.explanation} ELSE explanation END, version=version+1, updated_at=${now} WHERE id=${q.id}`;
          }
          fixed++;
        } else if (hasCol) {
          await pg`UPDATE questions SET fact_checked_at=${now} WHERE id=${q.id}`;
        }
      } catch { failed++; }
      done++;
      await progress(pg, jobId, done, fixed, failed);
    }
    await finish(pg, jobId, done, fixed, failed);
  } catch (e) {
    await fail(pg, jobId, e instanceof Error ? e.message : String(e));
  }
}
