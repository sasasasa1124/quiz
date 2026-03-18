import type { CategoryStat, Choice, ExamMeta, Question, QuestionHistoryEntry, QuizStats, SessionRecord } from "./types";
import { getRequestContext } from "@cloudflare/next-on-pages";

// Minimal D1 type stub – replaced by @cloudflare/workers-types after npm install
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<void>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

// ── Runtime detection ─────────────────────────────────────────────────────

export function getDB(): D1Database | null {
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
      `SELECT e.id, e.name, e.lang, COUNT(q.id) AS question_count,
              SUM(CASE WHEN q.is_duplicate = 1 THEN 1 ELSE 0 END) AS duplicate_count
       FROM exams e
       LEFT JOIN questions q ON q.exam_id = e.id
       GROUP BY e.id
       ORDER BY e.lang ASC, e.name ASC`
    )
    .all<{ id: string; name: string; lang: string; question_count: number; duplicate_count: number }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    language: row.lang as "ja" | "en",
    questionCount: row.question_count,
    duplicateCount: row.duplicate_count ?? 0,
  }));
}

// ── Questions ──────────────────────────────────────────────────────────────

export async function getQuestions(examId: string): Promise<Question[]> {
  const db = getDB();
  if (!db) return csvQuestions(examId);

  const result = await db
    .prepare(
      `SELECT id, num, question_text, options, answers, explanation, source, explanation_sources,
              is_duplicate, version, category, created_by, created_at, added_at
       FROM questions WHERE exam_id = ? ORDER BY num ASC`
    )
    .bind(examId)
    .all<{
      id: string; num: number; question_text: string; options: string;
      answers: string; explanation: string; source: string;
      explanation_sources: string | null;
      is_duplicate: number; version: number; category: string | null;
      created_by: string; created_at: string | null; added_at: string | null;
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
      explanationSources: JSON.parse(row.explanation_sources ?? "[]") as string[],
      isDuplicate: row.is_duplicate === 1,
      choiceCount: choices.length,
      isMultiple: answers.length > 1,
      version: row.version,
      category: row.category ?? null,
      createdBy: row.created_by ?? "",
      createdAt: row.created_at ?? "",
      addedAt: row.added_at ?? "",
    };
  });
}

export async function getQuestionById(id: string): Promise<Question | null> {
  const db = getDB();
  if (!db) return null;

  const row = await db
    .prepare(
      `SELECT id, num, question_text, options, answers, explanation, source, explanation_sources,
              is_duplicate, version, category, created_by, created_at, added_at
       FROM questions WHERE id = ?`
    )
    .bind(id)
    .first<{
      id: string; num: number; question_text: string; options: string;
      answers: string; explanation: string; source: string;
      explanation_sources: string | null;
      is_duplicate: number; version: number; category: string | null;
      created_by: string; created_at: string | null; added_at: string | null;
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
    explanationSources: JSON.parse(row.explanation_sources ?? "[]") as string[],
    isDuplicate: row.is_duplicate === 1,
    choiceCount: choices.length,
    isMultiple: answers.length > 1,
    version: row.version,
    category: row.category ?? null,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at ?? "",
    addedAt: row.added_at ?? "",
  };
}

// ── Question edit ──────────────────────────────────────────────────────────

export interface QuestionUpdate {
  question_text: string;
  options: Choice[];
  answers: string[];
  explanation: string;
  source: string;
  explanation_sources: string[];
  change_reason: string;
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
      `INSERT INTO question_history (question_id, question_text, options, answers, explanation, version, changed_by, change_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, current.question_text, current.options, current.answers, current.explanation, current.version, changedBy, data.change_reason)
    .run();

  await db
    .prepare(
      `UPDATE questions
       SET question_text = ?, options = ?, answers = ?, explanation = ?, source = ?,
           explanation_sources = ?, version = version + 1, updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(
      data.question_text, JSON.stringify(data.options), JSON.stringify(data.answers),
      data.explanation, data.source ?? "",
      JSON.stringify(data.explanation_sources ?? []), id
    )
    .run();
}

export async function getQuestionHistory(questionId: string): Promise<QuestionHistoryEntry[]> {
  const db = getDB();
  if (!db) return [];

  const result = await db
    .prepare(
      `SELECT id, question_id, question_text, options, answers, explanation, version, changed_at, changed_by, change_reason
       FROM question_history WHERE question_id = ? ORDER BY version DESC`
    )
    .bind(questionId)
    .all<{
      id: number; question_id: string; question_text: string; options: string;
      answers: string; explanation: string; version: number;
      changed_at: string; changed_by: string | null; change_reason: string | null;
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
    changeReason: row.change_reason ?? null,
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

// ── Question create / delete ────────────────────────────────────────────────

export interface QuestionCreate {
  question_text: string;
  options: Choice[];
  answers: string[];
  explanation: string;
  source: string;
  explanation_sources: string[];
}

export async function createQuestion(
  examId: string,
  data: QuestionCreate,
  createdBy: string
): Promise<Question> {
  const db = getDB();
  if (!db) throw new Error("DB not available in local dev");

  // Determine next num
  const maxRow = await db
    .prepare("SELECT COALESCE(MAX(num), 0) AS max_num FROM questions WHERE exam_id = ?")
    .bind(examId)
    .first<{ max_num: number }>();
  const num = (maxRow?.max_num ?? 0) + 1;
  const id = `${examId}__${num}`;

  await db
    .prepare(
      `INSERT INTO questions (id, exam_id, num, question_text, options, answers, explanation, source,
                              explanation_sources, created_by, created_at, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .bind(
      id, examId, num, data.question_text, JSON.stringify(data.options),
      JSON.stringify(data.answers), data.explanation, data.source,
      JSON.stringify(data.explanation_sources ?? []), createdBy
    )
    .run();

  const created = await getQuestionById(id);
  if (!created) throw new Error("Failed to retrieve created question");
  return created;
}

export async function deleteQuestion(id: string): Promise<void> {
  const db = getDB();
  if (!db) throw new Error("DB not available in local dev");

  await db.prepare("DELETE FROM question_history WHERE question_id = ?").bind(id).run();
  await db.prepare("DELETE FROM scores WHERE question_id = ?").bind(id).run();
  await db.prepare("DELETE FROM questions WHERE id = ?").bind(id).run();
}

// ── Scores ─────────────────────────────────────────────────────────────────

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

// ── Sessions ───────────────────────────────────────────────────────────────

export async function createSession(
  userEmail: string,
  examId: string,
  mode: "quiz" | "review",
  filter: "all" | "wrong",
  questionCount: number,
  sessionId: string
): Promise<void> {
  const db = getDB();
  if (!db) return;
  await db
    .prepare(
      `INSERT OR IGNORE INTO sessions (id, user_email, exam_id, mode, filter, started_at, question_count)
       VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`
    )
    .bind(sessionId, userEmail, examId, mode, filter, questionCount)
    .run();
}

export async function completeSession(
  sessionId: string,
  correctCount: number
): Promise<void> {
  const db = getDB();
  if (!db) return;
  await db
    .prepare(
      `UPDATE sessions SET completed_at = datetime('now'), correct_count = ? WHERE id = ?`
    )
    .bind(correctCount, sessionId)
    .run();
}

export async function addSessionAnswer(
  sessionId: string,
  questionId: string,
  isCorrect: boolean
): Promise<void> {
  const db = getDB();
  if (!db) return;
  await db
    .prepare(
      `INSERT INTO session_answers (session_id, question_id, is_correct, answered_at)
       VALUES (?, ?, ?, datetime('now'))`
    )
    .bind(sessionId, questionId, isCorrect ? 1 : 0)
    .run();
}

export async function getSessionsByExam(
  userEmail: string,
  examId: string,
  limit = 20
): Promise<SessionRecord[]> {
  const db = getDB();
  if (!db) return [];
  const result = await db
    .prepare(
      `SELECT id, user_email, exam_id, mode, filter, started_at, completed_at, question_count, correct_count
       FROM sessions WHERE user_email = ? AND exam_id = ?
       ORDER BY started_at DESC LIMIT ?`
    )
    .bind(userEmail, examId, limit)
    .all<{
      id: string; user_email: string; exam_id: string; mode: string; filter: string;
      started_at: string; completed_at: string | null; question_count: number; correct_count: number | null;
    }>();
  return (result.results ?? []).map((row) => ({
    id: row.id,
    userEmail: row.user_email,
    examId: row.exam_id,
    mode: row.mode as "quiz" | "review",
    filter: row.filter as "all" | "wrong",
    startedAt: row.started_at,
    completedAt: row.completed_at,
    questionCount: row.question_count,
    correctCount: row.correct_count,
  }));
}

// ── Daily progress ──────────────────────────────────────────────────────────

export async function getDailyProgress(userEmail: string): Promise<{
  todayCount: number;
  activeDays: string[]; // YYYY-MM-DD strings, descending, max 90
}> {
  const db = getDB();
  if (!db) return { todayCount: 0, activeDays: [] };

  const todayRow = await db
    .prepare(
      `SELECT COALESCE(SUM(question_count), 0) as cnt
       FROM sessions WHERE user_email = ? AND date(started_at) = date('now')`
    )
    .bind(userEmail)
    .first<{ cnt: number }>();

  const daysResult = await db
    .prepare(
      `SELECT DISTINCT date(started_at) as day
       FROM sessions WHERE user_email = ?
       ORDER BY day DESC LIMIT 90`
    )
    .bind(userEmail)
    .all<{ day: string }>();

  return {
    todayCount: todayRow?.cnt ?? 0,
    activeDays: (daysResult.results ?? []).map((r) => r.day),
  };
}

// ── App settings ───────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = getDB();
  if (!db) return null;
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await db
    .prepare(
      "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))"
    )
    .bind(key, value)
    .run();
}
