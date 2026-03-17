import type { CategoryStat, Choice, ExamMeta, Question, QuestionHistoryEntry, QuizStats } from "./types";
import { getRequestContext } from "@cloudflare/next-on-pages";

// Minimal D1 type stub – replaced by @cloudflare/workers-types after npm install
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<void>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

// ── Runtime detection ─────────────────────────────────────────────────────

function getDB(): D1Database | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getRequestContext() as any).env.DB as D1Database ?? null;
  } catch {
    return null;
  }
}

// ── CSV fallback (local dev only) ─────────────────────────────────────────
// Edge runtime can't use fs/process.cwd(), so we call a Node.js API route
// that reads CSV files. In production on Cloudflare, getDB() returns D1 so
// these functions are never reached.

const LOCAL_BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

async function csvExamList(): Promise<ExamMeta[]> {
  try {
    const res = await fetch(`${LOCAL_BASE}/api/local-exams`);
    return res.json() as Promise<ExamMeta[]>;
  } catch { return []; }
}

async function csvQuestions(examId: string): Promise<Question[]> {
  try {
    const res = await fetch(`${LOCAL_BASE}/api/local-questions/${encodeURIComponent(examId)}`);
    return res.json() as Promise<Question[]>;
  } catch { return []; }
}

// ── Exam list ──────────────────────────────────────────────────────────────

export async function getExamList(): Promise<ExamMeta[]> {
  const db = getDB();
  if (!db) return csvExamList();

  const result = await db
    .prepare(
      `SELECT e.id, e.name, e.lang, COUNT(q.id) AS question_count
       FROM exams e
       LEFT JOIN questions q ON q.exam_id = e.id
       GROUP BY e.id
       ORDER BY e.lang ASC, e.name ASC`
    )
    .all<{ id: string; name: string; lang: string; question_count: number }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    language: row.lang as "ja" | "en",
    questionCount: row.question_count,
  }));
}

// ── Questions ──────────────────────────────────────────────────────────────

export async function getQuestions(examId: string): Promise<Question[]> {
  const db = getDB();
  if (!db) return csvQuestions(examId);

  const result = await db
    .prepare(
      `SELECT id, num, question_text, options, answers, explanation, source, is_duplicate, version, category
       FROM questions WHERE exam_id = ? ORDER BY num ASC`
    )
    .bind(examId)
    .all<{
      id: string; num: number; question_text: string; options: string;
      answers: string; explanation: string; source: string;
      is_duplicate: number; version: number; category: string | null;
    }>();

  return (result.results ?? []).map((row) => {
    const choices: Choice[] = JSON.parse(row.options);
    const answers: string[] = JSON.parse(row.answers);
    return {
      id: row.num,
      dbId: row.id,
      question: row.question_text,
      choices,
      answers,
      explanation: row.explanation ?? "",
      source: row.source ?? "",
      isDuplicate: row.is_duplicate === 1,
      choiceCount: choices.length,
      isMultiple: answers.length > 1,
      version: row.version,
      category: row.category ?? null,
    };
  });
}

export async function getQuestionById(id: string): Promise<Question | null> {
  const db = getDB();
  if (!db) return null;

  const row = await db
    .prepare(
      `SELECT id, num, question_text, options, answers, explanation, source, is_duplicate, version, category
       FROM questions WHERE id = ?`
    )
    .bind(id)
    .first<{
      id: string; num: number; question_text: string; options: string;
      answers: string; explanation: string; source: string;
      is_duplicate: number; version: number; category: string | null;
    }>();

  if (!row) return null;
  const choices: Choice[] = JSON.parse(row.options);
  const answers: string[] = JSON.parse(row.answers);
  return {
    id: row.num,
    dbId: row.id,
    question: row.question_text,
    choices,
    answers,
    explanation: row.explanation ?? "",
    source: row.source ?? "",
    isDuplicate: row.is_duplicate === 1,
    choiceCount: choices.length,
    isMultiple: answers.length > 1,
    version: row.version,
    category: row.category ?? null,
  };
}

// ── Question edit ──────────────────────────────────────────────────────────

export interface QuestionUpdate {
  question_text: string;
  options: Choice[];
  answers: string[];
  explanation: string;
}

export async function updateQuestion(
  id: string,
  data: QuestionUpdate,
  changedBy: string
): Promise<void> {
  const db = getDB();
  if (!db) throw new Error("DB not available in local dev");

  const current = await db
    .prepare(
      `SELECT question_text, options, answers, explanation, version FROM questions WHERE id = ?`
    )
    .bind(id)
    .first<{
      question_text: string; options: string; answers: string;
      explanation: string; version: number;
    }>();

  if (!current) throw new Error(`Question ${id} not found`);

  await db
    .prepare(
      `INSERT INTO question_history (question_id, question_text, options, answers, explanation, version, changed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, current.question_text, current.options, current.answers, current.explanation, current.version, changedBy)
    .run();

  await db
    .prepare(
      `UPDATE questions
       SET question_text = ?, options = ?, answers = ?, explanation = ?,
           version = version + 1, updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(data.question_text, JSON.stringify(data.options), JSON.stringify(data.answers), data.explanation, id)
    .run();
}

export async function getQuestionHistory(questionId: string): Promise<QuestionHistoryEntry[]> {
  const db = getDB();
  if (!db) return [];

  const result = await db
    .prepare(
      `SELECT id, question_id, question_text, options, answers, explanation, version, changed_at, changed_by
       FROM question_history WHERE question_id = ? ORDER BY version DESC`
    )
    .bind(questionId)
    .all<{
      id: number; question_id: string; question_text: string; options: string;
      answers: string; explanation: string; version: number;
      changed_at: string; changed_by: string | null;
    }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    questionId: row.question_id,
    questionText: row.question_text,
    options: JSON.parse(row.options) as Choice[],
    answers: JSON.parse(row.answers) as string[],
    explanation: row.explanation ?? "",
    version: row.version,
    changedAt: row.changed_at,
    changedBy: row.changed_by,
  }));
}

// ── Scores ─────────────────────────────────────────────────────────────────

export async function getScores(userEmail: string, examId: string): Promise<QuizStats> {
  const db = getDB();
  if (!db) return {};

  const prefix = `${examId}__`;
  const result = await db
    .prepare(
      `SELECT question_id, last_correct FROM scores
       WHERE user_email = ? AND question_id LIKE ?`
    )
    .bind(userEmail, `${prefix}%`)
    .all<{ question_id: string; last_correct: number }>();

  const stats: QuizStats = {};
  for (const row of result.results ?? []) {
    const num = row.question_id.slice(prefix.length);
    stats[num] = row.last_correct as 0 | 1;
  }
  return stats;
}

// ── Category stats ───────────────────────────────────────────────────────────

export async function getCategoryStats(
  userEmail: string,
  examId: string
): Promise<CategoryStat[]> {
  const db = getDB();
  if (!db) return [];

  const result = await db
    .prepare(
      `SELECT
         q.category,
         COUNT(q.id) AS total,
         COUNT(s.question_id) AS attempted,
         COALESCE(SUM(s.last_correct), 0) AS correct_count
       FROM questions q
       LEFT JOIN scores s ON s.question_id = q.id AND s.user_email = ?
       WHERE q.exam_id = ?
       GROUP BY q.category
       ORDER BY q.category`
    )
    .bind(userEmail, examId)
    .all<{ category: string | null; total: number; attempted: number; correct_count: number }>();

  return (result.results ?? []).map((row) => ({
    category: row.category,
    total: row.total,
    attempted: row.attempted,
    correct: row.correct_count,
  }));
}

export async function saveScore(
  userEmail: string,
  examId: string,
  questionNum: number,
  correct: boolean
): Promise<void> {
  const db = getDB();
  if (!db) return; // no-op in local dev

  const questionId = `${examId}__${questionNum}`;
  const lastCorrect = correct ? 1 : 0;
  const correctDelta = correct ? 1 : 0;

  await db
    .prepare(
      `INSERT INTO scores (user_email, question_id, last_correct, attempts, correct_count, updated_at)
       VALUES (?, ?, ?, 1, ?, datetime('now'))
       ON CONFLICT(user_email, question_id) DO UPDATE SET
         last_correct  = excluded.last_correct,
         attempts      = attempts + 1,
         correct_count = correct_count + excluded.correct_count,
         updated_at    = excluded.updated_at`
    )
    .bind(userEmail, questionId, lastCorrect, correctDelta)
    .run();
}
