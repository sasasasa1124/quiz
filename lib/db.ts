import type { CategoryStat, Choice, ExamMeta, ExamSnapshot, Question, QuestionHistoryEntry, QuizStats, SessionRecord, Suggestion, UserSettings } from "./types";
import { DEFAULT_USER_SETTINGS } from "./types";
import { getRequestContext } from "@cloudflare/next-on-pages";

// Minimal D1 type stub – replaced by @cloudflare/workers-types after npm install
export interface D1Result {
  meta: { last_row_id: number; changes: number };
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<D1Result>;
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
    language: row.lang as "ja" | "en" | "zh" | "ko",
    questionCount: row.question_count,
    duplicateCount: row.duplicate_count ?? 0,
  }));
}

export async function updateExamMeta(
  examId: string,
  fields: { name?: string; language?: "ja" | "en" | "zh" | "ko" }
): Promise<void> {
  const db = getDB();
  if (!db) return; // CSV mode: no-op
  if (fields.name !== undefined) {
    await db.prepare("UPDATE exams SET name = ? WHERE id = ?").bind(fields.name, examId).run();
  }
  if (fields.language !== undefined) {
    await db.prepare("UPDATE exams SET lang = ? WHERE id = ?").bind(fields.language, examId).run();
  }
}

export async function renameCategory(
  examId: string,
  oldName: string,
  newName: string
): Promise<void> {
  const db = getDB();
  if (!db) return;
  await db
    .prepare("UPDATE questions SET category = ? WHERE exam_id = ? AND category = ?")
    .bind(newName.trim(), examId, oldName)
    .run();
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

export async function setDuplicate(id: string, isDuplicate: boolean): Promise<void> {
  const db = getDB();
  if (!db) throw new Error("DB not available in local dev");
  await db
    .prepare(`UPDATE questions SET is_duplicate = ? WHERE id = ?`)
    .bind(isDuplicate ? 1 : 0, id)
    .run();
}

export async function getUserInvalidatedIds(userEmail: string, examId: string): Promise<string[]> {
  const db = getDB();
  if (!db) return [];
  const result = await db
    .prepare(
      `SELECT u.question_id FROM user_invalidated_questions u
       JOIN questions q ON q.id = u.question_id
       WHERE u.user_email = ? AND q.exam_id = ?`
    )
    .bind(userEmail, examId)
    .all<{ question_id: string }>();
  return result.results.map((r) => r.question_id);
}

export async function toggleUserInvalidated(questionId: string, userEmail: string): Promise<boolean> {
  const db = getDB();
  if (!db) throw new Error("DB not available in local dev");
  const existing = await db
    .prepare(`SELECT 1 FROM user_invalidated_questions WHERE user_email = ? AND question_id = ?`)
    .bind(userEmail, questionId)
    .first();
  if (existing) {
    await db
      .prepare(`DELETE FROM user_invalidated_questions WHERE user_email = ? AND question_id = ?`)
      .bind(userEmail, questionId)
      .run();
    return false;
  } else {
    await db
      .prepare(`INSERT INTO user_invalidated_questions (user_email, question_id) VALUES (?, ?)`)
      .bind(userEmail, questionId)
      .run();
    return true;
  }
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

// ── Spaced Repetition (SM-2) ───────────────────────────────────────────────

/** Apply SM-2 algorithm and persist next review date.
 *  quality: 4 = "Knew it", 1 = "Didn't know" */
export async function saveSRSScore(
  userEmail: string,
  questionDbId: string,
  quality: 1 | 4
): Promise<void> {
  const db = getDB();
  if (!db) return;

  const row = await db
    .prepare("SELECT interval_days, ease_factor FROM scores WHERE user_email = ? AND question_id = ?")
    .bind(userEmail, questionDbId)
    .first<{ interval_days: number; ease_factor: number } | null>();

  const ef = row?.ease_factor ?? 2.5;
  const interval = row?.interval_days ?? 1;

  let newInterval: number;
  let newEF = ef;

  if (quality < 3) {
    newInterval = 1;
  } else {
    if (interval <= 1) newInterval = 1;
    else if (interval === 2) newInterval = 6;
    else newInterval = Math.round(interval * ef);

    newEF = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    newEF = Math.max(1.3, newEF);
  }

  const nextDate = new Date(Date.now() + newInterval * 86400000);
  const nextReviewAt = nextDate.toISOString().slice(0, 10);

  await db
    .prepare(
      `INSERT INTO scores (user_email, question_id, last_correct, attempts, correct_count, interval_days, ease_factor, next_review_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_email, question_id) DO UPDATE SET
         last_correct   = excluded.last_correct,
         attempts       = attempts + 1,
         correct_count  = correct_count + excluded.correct_count,
         interval_days  = excluded.interval_days,
         ease_factor    = excluded.ease_factor,
         next_review_at = excluded.next_review_at,
         updated_at     = excluded.updated_at`
    )
    .bind(userEmail, questionDbId, quality >= 3 ? 1 : 0, quality >= 3 ? 1 : 0, newInterval, newEF, nextReviewAt)
    .run();
}

/** Count questions due for review (next_review_at <= today) */
export async function getDueCount(userEmail: string, examId: string): Promise<number> {
  const db = getDB();
  if (!db) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const prefix = `${examId}__`;

  const row = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM scores
       WHERE user_email = ? AND question_id LIKE ? AND next_review_at IS NOT NULL AND next_review_at <= ?`
    )
    .bind(userEmail, `${prefix}%`, today)
    .first<{ cnt: number }>();

  return row?.cnt ?? 0;
}

// ── All scores (cross-exam) ─────────────────────────────────────────────────

export async function getAllScores(userEmail: string): Promise<Record<string, QuizStats>> {
  const db = getDB();
  if (!db) return {};

  const result = await db
    .prepare("SELECT question_id, last_correct FROM scores WHERE user_email = ?")
    .bind(userEmail)
    .all<{ question_id: string; last_correct: number }>();

  const statsMap: Record<string, QuizStats> = {};
  for (const row of result.results ?? []) {
    const sep = row.question_id.indexOf("__");
    if (sep < 0) continue;
    const examId = row.question_id.slice(0, sep);
    const num = row.question_id.slice(sep + 2);
    if (!statsMap[examId]) statsMap[examId] = {};
    statsMap[examId][num] = row.last_correct as 0 | 1;
  }
  return statsMap;
}

// ── User settings ───────────────────────────────────────────────────────────

export async function getAllUserSettings(userEmail: string): Promise<UserSettings> {
  const db = getDB();
  if (!db) return DEFAULT_USER_SETTINGS;

  const result = await db
    .prepare("SELECT key, value FROM user_settings WHERE user_email = ?")
    .bind(userEmail)
    .all<{ key: string; value: string }>();

  if (!result.results?.length) return DEFAULT_USER_SETTINGS;

  const raw: Partial<UserSettings> = {};
  for (const row of result.results) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (row.key === "dailyGoal" || row.key === "audioSpeed") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (raw as any)[row.key] = Number(row.value);
    } else if (row.key === "audioMode") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (raw as any)[row.key] = row.value === "true" || row.value === "1";
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (raw as any)[row.key] = row.value;
    }
  }
  const merged: UserSettings = { ...DEFAULT_USER_SETTINGS, ...raw };
  if (!merged.aiPrompt) merged.aiPrompt = DEFAULT_USER_SETTINGS.aiPrompt;
  if (!merged.aiRefinePrompt) merged.aiRefinePrompt = DEFAULT_USER_SETTINGS.aiRefinePrompt;
  return merged;
}

export async function setUserSettings(
  userEmail: string,
  settings: Partial<UserSettings>
): Promise<void> {
  const db = getDB();
  if (!db) return;

  for (const [key, value] of Object.entries(settings)) {
    await db
      .prepare(
        `INSERT INTO user_settings (user_email, key, value, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(user_email, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .bind(userEmail, key, String(value))
      .run();
  }
}

// ── User snapshots ──────────────────────────────────────────────────────────

export async function getSnapshots(
  userEmail: string,
  examId?: string
): Promise<Record<string, ExamSnapshot[]>> {
  const db = getDB();
  if (!db) return {};

  const result = examId
    ? await db
        .prepare(
          "SELECT exam_id, ts, correct, total, accuracy FROM user_snapshots WHERE user_email = ? AND exam_id = ? ORDER BY ts ASC"
        )
        .bind(userEmail, examId)
        .all<{ exam_id: string; ts: number; correct: number; total: number; accuracy: number }>()
    : await db
        .prepare(
          "SELECT exam_id, ts, correct, total, accuracy FROM user_snapshots WHERE user_email = ? ORDER BY ts ASC"
        )
        .bind(userEmail)
        .all<{ exam_id: string; ts: number; correct: number; total: number; accuracy: number }>();

  const map: Record<string, ExamSnapshot[]> = {};
  for (const row of result.results ?? []) {
    if (!map[row.exam_id]) map[row.exam_id] = [];
    map[row.exam_id].push({ ts: row.ts, correct: row.correct, total: row.total, accuracy: row.accuracy });
  }
  return map;
}

export async function saveSnapshot(
  userEmail: string,
  examId: string,
  ts: number,
  correct: number,
  total: number,
  accuracy: number
): Promise<void> {
  const db = getDB();
  if (!db) return;

  // Check if there's already a snapshot from today (by UTC date)
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();
  const tomorrowTs = todayTs + 86400000;

  const existing = await db
    .prepare(
      "SELECT id FROM user_snapshots WHERE user_email = ? AND exam_id = ? AND ts >= ? AND ts < ?"
    )
    .bind(userEmail, examId, todayTs, tomorrowTs)
    .first<{ id: number }>();

  if (existing) {
    await db
      .prepare(
        "UPDATE user_snapshots SET ts = ?, correct = ?, total = ?, accuracy = ? WHERE id = ?"
      )
      .bind(ts, correct, total, accuracy, existing.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO user_snapshots (user_email, exam_id, ts, correct, total, accuracy)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(userEmail, examId, ts, correct, total, accuracy)
      .run();

    // Keep only last 60 snapshots per exam
    await db
      .prepare(
        `DELETE FROM user_snapshots WHERE user_email = ? AND exam_id = ? AND id NOT IN (
           SELECT id FROM user_snapshots WHERE user_email = ? AND exam_id = ?
           ORDER BY ts DESC LIMIT 60
         )`
      )
      .bind(userEmail, examId, userEmail, examId)
      .run();
  }
}

// ── Study guides ────────────────────────────────────────────────────────────

export async function getStudyGuide(
  examId: string
): Promise<{ markdown: string; generatedAt: string } | null> {
  const db = getDB();
  if (!db) return null;
  const row = await db
    .prepare("SELECT markdown, generated_at FROM study_guides WHERE exam_id = ?")
    .bind(examId)
    .first<{ markdown: string; generated_at: string }>();
  if (!row) return null;
  return { markdown: row.markdown, generatedAt: row.generated_at };
}

export async function upsertStudyGuide(
  examId: string,
  markdown: string
): Promise<void> {
  const db = getDB();
  if (!db) return;
  await db
    .prepare(
      `INSERT INTO study_guides (exam_id, markdown, generated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(exam_id) DO UPDATE SET markdown = excluded.markdown, generated_at = excluded.generated_at`
    )
    .bind(examId, markdown)
    .run();
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

// ── Suggestions ────────────────────────────────────────────────────────────

function rowToSuggestion(row: Record<string, unknown>): Suggestion {
  return {
    id: row.id as number,
    questionId: row.question_id as string,
    type: row.type as "ai" | "manual",
    suggestedAnswers: row.suggested_answers ? JSON.parse(row.suggested_answers as string) : null,
    suggestedExplanation: (row.suggested_explanation as string) ?? null,
    aiModel: (row.ai_model as string) ?? null,
    comment: (row.comment as string) ?? null,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  };
}

export async function getSuggestions(questionId: string): Promise<Suggestion[]> {
  const db = getDB();
  if (!db) return [];
  const rows = await db
    .prepare("SELECT * FROM suggestions WHERE question_id = ? ORDER BY created_at DESC")
    .bind(questionId)
    .all<Record<string, unknown>>();
  return (rows.results ?? []).map(rowToSuggestion);
}

export async function createSuggestion(
  questionId: string,
  data: {
    type: "ai" | "manual";
    suggestedAnswers: string[] | null;
    suggestedExplanation: string | null;
    aiModel: string | null;
    comment: string | null;
  },
  createdBy: string
): Promise<Suggestion> {
  const db = getDB();
  if (!db) throw new Error("DB not available");
  const result = await db
    .prepare(
      "INSERT INTO suggestions (question_id, type, suggested_answers, suggested_explanation, ai_model, comment, created_by) VALUES (?,?,?,?,?,?,?)"
    )
    .bind(
      questionId,
      data.type,
      data.suggestedAnswers ? JSON.stringify(data.suggestedAnswers) : null,
      data.suggestedExplanation ?? null,
      data.aiModel ?? null,
      data.comment ?? null,
      createdBy
    )
    .run();
  const row = await db
    .prepare("SELECT * FROM suggestions WHERE rowid = ?")
    .bind(result.meta.last_row_id)
    .first<Record<string, unknown>>();
  if (!row) throw new Error("Failed to retrieve created suggestion");
  return rowToSuggestion(row);
}
