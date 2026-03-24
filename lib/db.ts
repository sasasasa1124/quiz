import type {
  CategoryStat, Choice, ExamMeta, ExamSnapshot,
  Question, QuestionHistoryEntry, QuizStats, RichQuizStats, RichScoreEntry,
  SessionRecord, Suggestion, UserSettings,
} from "./types";
import { DEFAULT_USER_SETTINGS } from "./types";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { drizzle } from "drizzle-orm/d1";
import { eq, like, and, sql, asc, desc, isNotNull, lte, lt, gte, inArray } from "drizzle-orm";
import type { D1Database as CloudflareD1 } from "@cloudflare/workers-types";
import * as schema from "./schema";
import {
  exams as examsTable, questions as questionsTable, questionHistory,
  scores, sessions, sessionAnswers, userSettings, userSnapshots,
  userInvalidatedQuestions, studyGuides, suggestions as suggestionsTable,
  appSettings,
} from "./schema";

// ── Runtime detection ─────────────────────────────────────────────────────

// Minimal stub kept for complex raw-SQL queries that go through db.$client
export interface D1Result {
  meta: { last_row_id: number; changes: number };
}
export interface D1Database {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T = unknown>(): Promise<{ results: T[] }>;
      first<T = unknown>(): Promise<T | null>;
      run(): Promise<D1Result>;
    };
  };
}

/** Returns the raw D1 binding (used internally by getDrizzle and by complex queries). */
export function getDB(): D1Database | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getRequestContext() as any).env.DB as D1Database ?? null;
  } catch {
    return null;
  }
}

/** Returns a Drizzle instance wrapping D1, or null in local dev. */
function getDrizzle() {
  const d1 = getDB();
  if (!d1) return null;
  return drizzle(d1 as unknown as CloudflareD1, { schema });
}

// ── CSV fallback (local dev only) ─────────────────────────────────────────

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
  const d1 = getDB();
  if (!d1) {
    // csvExamList uses Node.js fs which is unavailable in edge runtime (Cloudflare Workers)
    if (process.env.NEXT_RUNTIME === "edge") return [];
    return csvExamList();
  }

  // Complex GROUP BY + aggregation — keep as raw SQL via db.$client
  const result = await d1
    .prepare(
      `SELECT e.id, e.name, e.lang, e.tags, COUNT(q.id) AS question_count,
              SUM(CASE WHEN q.is_duplicate = 1 THEN 1 ELSE 0 END) AS duplicate_count
       FROM exams e
       LEFT JOIN questions q ON q.exam_id = e.id
       GROUP BY e.id
       ORDER BY e.lang ASC, e.name ASC`
    )
    .bind()
    .all<{ id: string; name: string; lang: string; tags: string | null; question_count: number; duplicate_count: number }>();

  return (result.results ?? []).map((row) => {
    let tags: string[] = ["Salesforce"];
    try { if (row.tags) tags = JSON.parse(row.tags) as string[]; } catch { /* ignore */ }
    return {
      id: row.id,
      name: row.name,
      language: row.lang as "ja" | "en" | "zh" | "ko",
      questionCount: row.question_count,
      duplicateCount: row.duplicate_count ?? 0,
      tags,
    };
  });
}

export async function updateExamMeta(
  examId: string,
  fields: { name?: string; language?: "ja" | "en" | "zh" | "ko"; tags?: string[] }
): Promise<void> {
  const db = getDrizzle();
  if (!db) return;
  if (fields.name !== undefined) {
    await db.update(examsTable).set({ name: fields.name }).where(eq(examsTable.id, examId));
  }
  if (fields.language !== undefined) {
    await db.update(examsTable).set({ lang: fields.language }).where(eq(examsTable.id, examId));
  }
  if (fields.tags !== undefined) {
    await db.update(examsTable).set({ tags: JSON.stringify(fields.tags) }).where(eq(examsTable.id, examId));
  }
}

export async function deleteExam(examId: string): Promise<void> {
  const db = getDrizzle();
  if (!db) return;

  // Collect question IDs
  const qs = await db.select({ id: questionsTable.id }).from(questionsTable).where(eq(questionsTable.examId, examId));
  const qIds = qs.map((q) => q.id);

  if (qIds.length > 0) {
    await db.delete(suggestionsTable).where(inArray(suggestionsTable.questionId, qIds));
    await db.delete(userInvalidatedQuestions).where(inArray(userInvalidatedQuestions.questionId, qIds));
    await db.delete(scores).where(inArray(scores.questionId, qIds));
    await db.delete(questionHistory).where(inArray(questionHistory.questionId, qIds));
  }

  // Collect session IDs
  const sess = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.examId, examId));
  const sessIds = sess.map((s) => s.id);
  if (sessIds.length > 0) {
    await db.delete(sessionAnswers).where(inArray(sessionAnswers.sessionId, sessIds));
  }

  await db.delete(studyGuides).where(eq(studyGuides.examId, examId));
  await db.delete(userSnapshots).where(eq(userSnapshots.examId, examId));
  await db.delete(sessions).where(eq(sessions.examId, examId));
  await db.delete(questionsTable).where(eq(questionsTable.examId, examId));
  await db.delete(examsTable).where(eq(examsTable.id, examId));
}

export async function renameCategory(examId: string, oldName: string, newName: string): Promise<void> {
  const db = getDrizzle();
  if (!db) return;
  await db.update(questionsTable)
    .set({ category: newName.trim() })
    .where(and(eq(questionsTable.examId, examId), eq(questionsTable.category, oldName)));
}

// ── Questions ──────────────────────────────────────────────────────────────

function mapQuestionRow(row: {
  id: string; num: number; question_text: string; options: string;
  answers: string; explanation: string; source: string;
  explanation_sources: string | null; is_duplicate: number; version: number;
  category: string | null; created_by: string; created_at: string | null;
  added_at: string | null; updated_at: string | null;
}): Question {
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
    updatedAt: row.updated_at ?? "",
  };
}

const QUESTION_COLS = `id, num, question_text, options, answers, explanation, source, explanation_sources,
  is_duplicate, version, category, created_by, created_at, added_at, updated_at`;

export async function getQuestions(examId: string): Promise<Question[]> {
  const d1 = getDB();
  if (!d1) return csvQuestions(examId);

  type Row = {
    id: string; num: number; question_text: string; options: string;
    answers: string; explanation: string; source: string;
    explanation_sources: string | null; is_duplicate: number; version: number;
    category: string | null; created_by: string; created_at: string | null;
    added_at: string | null; updated_at: string | null;
  };
  const result = await d1
    .prepare(`SELECT ${QUESTION_COLS} FROM questions WHERE exam_id = ? ORDER BY num ASC`)
    .bind(examId)
    .all<Row>();

  return (result.results ?? []).map(mapQuestionRow);
}

export async function getQuestionById(id: string): Promise<Question | null> {
  const d1 = getDB();
  if (!d1) return null;

  type Row = {
    id: string; num: number; question_text: string; options: string;
    answers: string; explanation: string; source: string;
    explanation_sources: string | null; is_duplicate: number; version: number;
    category: string | null; created_by: string; created_at: string | null;
    added_at: string | null; updated_at: string | null;
  };
  const row = await d1
    .prepare(`SELECT ${QUESTION_COLS} FROM questions WHERE id = ?`)
    .bind(id)
    .first<Row>();

  if (!row) return null;
  return mapQuestionRow(row);
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

export async function updateQuestion(id: string, data: QuestionUpdate, changedBy: string): Promise<void> {
  const d1 = getDB();
  if (!d1) throw new Error("DB not available in local dev");

  const current = await d1
    .prepare(`SELECT question_text, options, answers, explanation, version FROM questions WHERE id = ?`)
    .bind(id)
    .first<{ question_text: string; options: string; answers: string; explanation: string; version: number }>();

  if (!current) throw new Error(`Question ${id} not found`);

  await d1
    .prepare(
      `INSERT INTO question_history (question_id, question_text, options, answers, explanation, version, changed_by, change_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, current.question_text, current.options, current.answers, current.explanation, current.version, changedBy, data.change_reason)
    .run();

  await d1
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
  const db = getDrizzle();
  if (!db) throw new Error("DB not available in local dev");
  await db.update(questionsTable)
    .set({ isDuplicate: isDuplicate ? 1 : 0 })
    .where(eq(questionsTable.id, id));
}

export async function getUserInvalidatedIds(userEmail: string, examId: string): Promise<string[]> {
  const d1 = getDB();
  if (!d1) return [];
  const result = await d1
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
  const db = getDrizzle();
  if (!db) throw new Error("DB not available in local dev");

  const existing = await db.select({ questionId: userInvalidatedQuestions.questionId })
    .from(userInvalidatedQuestions)
    .where(and(
      eq(userInvalidatedQuestions.userEmail, userEmail),
      eq(userInvalidatedQuestions.questionId, questionId)
    ))
    .limit(1);

  if (existing.length > 0) {
    await db.delete(userInvalidatedQuestions).where(
      and(
        eq(userInvalidatedQuestions.userEmail, userEmail),
        eq(userInvalidatedQuestions.questionId, questionId)
      )
    );
    return false;
  } else {
    await db.insert(userInvalidatedQuestions).values({ userEmail, questionId });
    return true;
  }
}

export async function getQuestionHistory(questionId: string): Promise<QuestionHistoryEntry[]> {
  const db = getDrizzle();
  if (!db) return [];

  const rows = await db.select()
    .from(questionHistory)
    .where(eq(questionHistory.questionId, questionId))
    .orderBy(desc(questionHistory.version));

  return rows.map((row) => ({
    id: row.id,
    questionId: row.questionId,
    questionText: row.questionText,
    options: JSON.parse(row.options) as Choice[],
    answers: JSON.parse(row.answers) as string[],
    explanation: row.explanation ?? "",
    version: row.version,
    changedAt: row.changedAt ?? "",
    changedBy: row.changedBy ?? null,
    changeReason: row.changeReason ?? null,
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

export async function createQuestion(examId: string, data: QuestionCreate, createdBy: string): Promise<Question> {
  const d1 = getDB();
  if (!d1) throw new Error("DB not available in local dev");

  const maxRow = await d1
    .prepare("SELECT COALESCE(MAX(num), 0) AS max_num FROM questions WHERE exam_id = ?")
    .bind(examId)
    .first<{ max_num: number }>();
  const num = (maxRow?.max_num ?? 0) + 1;
  const id = `${examId}__${num}`;

  await d1
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
  const db = getDrizzle();
  if (!db) throw new Error("DB not available in local dev");

  await db.delete(questionHistory).where(eq(questionHistory.questionId, id));
  await db.delete(scores).where(eq(scores.questionId, id));
  await db.delete(questionsTable).where(eq(questionsTable.id, id));
}

// ── Scores ─────────────────────────────────────────────────────────────────

export async function getScores(userEmail: string, examId: string): Promise<QuizStats> {
  const db = getDrizzle();
  if (!db) return {};

  const prefix = `${examId}__`;
  const rows = await db.select({ questionId: scores.questionId, lastCorrect: scores.lastCorrect })
    .from(scores)
    .where(and(
      eq(scores.userEmail, userEmail),
      like(scores.questionId, `${prefix}%`)
    ));

  const stats: QuizStats = {};
  for (const row of rows) {
    const num = row.questionId.slice(prefix.length);
    stats[num] = row.lastCorrect as 0 | 1;
  }
  return stats;
}

export async function getRichScores(userEmail: string, examId: string): Promise<RichQuizStats> {
  const db = getDrizzle();
  if (!db) return {};

  const prefix = `${examId}__`;
  const rows = await db.select({
    questionId: scores.questionId,
    lastCorrect: scores.lastCorrect,
    attempts: scores.attempts,
    correctCount: scores.correctCount,
    updatedAt: scores.updatedAt,
    nextReviewAt: scores.nextReviewAt,
  })
    .from(scores)
    .where(and(
      eq(scores.userEmail, userEmail),
      like(scores.questionId, `${prefix}%`)
    ));

  const stats: RichQuizStats = {};
  for (const row of rows) {
    const num = row.questionId.slice(prefix.length);
    stats[num] = {
      lastCorrect: row.lastCorrect as 0 | 1,
      attempts: row.attempts ?? 0,
      correctCount: row.correctCount ?? 0,
      updatedAt: row.updatedAt ?? null,
      nextReviewAt: row.nextReviewAt ?? null,
    } as RichScoreEntry;
  }
  return stats;
}

export async function saveScore(userEmail: string, examId: string, questionNum: number, correct: boolean): Promise<void> {
  const db = getDrizzle();
  if (!db) return;

  const questionId = `${examId}__${questionNum}`;
  const lastCorrect = correct ? 1 : 0;
  const correctDelta = correct ? 1 : 0;

  await db.insert(scores)
    .values({
      userEmail, questionId, lastCorrect,
      attempts: 1, correctCount: correctDelta,
      updatedAt: sql`datetime('now')` as unknown as string,
    })
    .onConflictDoUpdate({
      target: [scores.userEmail, scores.questionId],
      set: {
        lastCorrect,
        attempts: sql`${scores.attempts} + 1`,
        correctCount: sql`${scores.correctCount} + ${correctDelta}`,
        updatedAt: sql`datetime('now')`,
      },
    });
}

// ── Category stats ───────────────────────────────────────────────────────────

export async function getCategoryStats(userEmail: string, examId: string): Promise<CategoryStat[]> {
  const d1 = getDB();
  if (!d1) return [];

  const result = await d1
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

// ── Sessions ───────────────────────────────────────────────────────────────

export async function createSession(
  userEmail: string, examId: string, mode: "quiz" | "review",
  filter: "all" | "wrong", questionCount: number, sessionId: string
): Promise<void> {
  const db = getDrizzle();
  if (!db) return;
  await db.insert(sessions)
    .values({
      id: sessionId, userEmail, examId, mode, filter,
      startedAt: sql`datetime('now')` as unknown as string,
      questionCount,
    })
    .onConflictDoNothing();
}

export async function completeSession(sessionId: string, correctCount: number): Promise<void> {
  const db = getDrizzle();
  if (!db) return;
  await db.update(sessions)
    .set({ completedAt: sql`datetime('now')` as unknown as string, correctCount })
    .where(eq(sessions.id, sessionId));
}

export async function addSessionAnswer(sessionId: string, questionId: string, isCorrect: boolean): Promise<void> {
  const db = getDrizzle();
  if (!db) return;
  await db.insert(sessionAnswers).values({
    sessionId, questionId,
    isCorrect: isCorrect ? 1 : 0,
    answeredAt: sql`datetime('now')` as unknown as string,
  });
}

export async function getSessionsByExam(userEmail: string, examId: string, limit = 20): Promise<SessionRecord[]> {
  const db = getDrizzle();
  if (!db) return [];

  const rows = await db.select()
    .from(sessions)
    .where(and(eq(sessions.userEmail, userEmail), eq(sessions.examId, examId)))
    .orderBy(desc(sessions.startedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    userEmail: row.userEmail,
    examId: row.examId,
    mode: row.mode as "quiz" | "review",
    filter: row.filter as "all" | "wrong",
    startedAt: row.startedAt ?? "",
    completedAt: row.completedAt ?? null,
    questionCount: row.questionCount ?? 0,
    correctCount: row.correctCount ?? null,
  }));
}

// ── Daily progress ──────────────────────────────────────────────────────────

export async function getDailyProgress(userEmail: string): Promise<{
  todayCount: number;
  activeDays: string[];
}> {
  const d1 = getDB();
  if (!d1) return { todayCount: 0, activeDays: [] };

  const todayRow = await d1
    .prepare(
      `SELECT COALESCE(SUM(question_count), 0) as cnt
       FROM sessions WHERE user_email = ? AND date(started_at) = date('now')`
    )
    .bind(userEmail)
    .first<{ cnt: number }>();

  const daysResult = await d1
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

export async function saveSRSScore(userEmail: string, questionDbId: string, quality: 1 | 4): Promise<void> {
  const db = getDrizzle();
  if (!db) return;

  const [row] = await db.select({ intervalDays: scores.intervalDays, easeFactor: scores.easeFactor })
    .from(scores)
    .where(and(eq(scores.userEmail, userEmail), eq(scores.questionId, questionDbId)))
    .limit(1);

  const ef = row?.easeFactor ?? 2.5;
  const interval = row?.intervalDays ?? 1;

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

  const nextReviewAt = new Date(Date.now() + newInterval * 86400000).toISOString().slice(0, 10);
  const lastCorrect = quality >= 3 ? 1 : 0;

  await db.insert(scores)
    .values({
      userEmail, questionId: questionDbId, lastCorrect,
      attempts: 1, correctCount: lastCorrect,
      intervalDays: newInterval, easeFactor: newEF, nextReviewAt,
      updatedAt: sql`datetime('now')` as unknown as string,
    })
    .onConflictDoUpdate({
      target: [scores.userEmail, scores.questionId],
      set: {
        lastCorrect,
        attempts: sql`${scores.attempts} + 1`,
        correctCount: sql`${scores.correctCount} + ${lastCorrect}`,
        intervalDays: newInterval,
        easeFactor: newEF,
        nextReviewAt,
        updatedAt: sql`datetime('now')`,
      },
    });
}

export async function getDueCount(userEmail: string, examId: string): Promise<number> {
  const db = getDrizzle();
  if (!db) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const prefix = `${examId}__`;

  const [row] = await db.select({ cnt: sql<number>`COUNT(*)` })
    .from(scores)
    .where(and(
      eq(scores.userEmail, userEmail),
      like(scores.questionId, `${prefix}%`),
      isNotNull(scores.nextReviewAt),
      lte(scores.nextReviewAt, today)
    ));

  return row?.cnt ?? 0;
}

// ── All scores (cross-exam) ─────────────────────────────────────────────────

export async function getAllScores(userEmail: string): Promise<Record<string, QuizStats>> {
  const db = getDrizzle();
  if (!db) return {};

  const rows = await db.select({ questionId: scores.questionId, lastCorrect: scores.lastCorrect })
    .from(scores)
    .where(eq(scores.userEmail, userEmail));

  const statsMap: Record<string, QuizStats> = {};
  for (const row of rows) {
    const sep = row.questionId.indexOf("__");
    if (sep < 0) continue;
    const examId = row.questionId.slice(0, sep);
    const num = row.questionId.slice(sep + 2);
    if (!statsMap[examId]) statsMap[examId] = {};
    statsMap[examId][num] = row.lastCorrect as 0 | 1;
  }
  return statsMap;
}

// ── User settings ───────────────────────────────────────────────────────────

export async function getAllUserSettings(userEmail: string): Promise<UserSettings> {
  const db = getDrizzle();
  if (!db) return DEFAULT_USER_SETTINGS;

  const rows = await db.select({ key: userSettings.key, value: userSettings.value })
    .from(userSettings)
    .where(eq(userSettings.userEmail, userEmail));

  if (!rows.length) return DEFAULT_USER_SETTINGS;

  const raw: Partial<UserSettings> = {};
  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (row.key === "dailyGoal" || row.key === "audioSpeed" || row.key === "audioPrefetch") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (raw as any)[row.key] = Number(row.value);
    } else if (row.key === "audioMode" || row.key === "skipRevealOnCorrect") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (raw as any)[row.key] = row.value === "true" || row.value === "1";
    } else if (row.key === "aiPromptVersions" || row.key === "aiRefinePromptVersions" || row.key === "studyGuidePromptVersions" || row.key === "aiFillPromptVersions") {
      try {
        const parsed = JSON.parse(row.value);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (raw as any)[row.key] = Array.isArray(parsed) ? parsed : [];
      } catch {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (raw as any)[row.key] = [];
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (raw as any)[row.key] = row.value;
    }
  }
  const merged: UserSettings = { ...DEFAULT_USER_SETTINGS, ...raw };
  if (!merged.aiPrompt) merged.aiPrompt = DEFAULT_USER_SETTINGS.aiPrompt;
  if (!merged.aiRefinePrompt) merged.aiRefinePrompt = DEFAULT_USER_SETTINGS.aiRefinePrompt;
  if (!merged.studyGuidePrompt) merged.studyGuidePrompt = DEFAULT_USER_SETTINGS.studyGuidePrompt;
  if (!merged.aiFillPrompt) merged.aiFillPrompt = DEFAULT_USER_SETTINGS.aiFillPrompt;
  if (!Array.isArray(merged.aiPromptVersions)) merged.aiPromptVersions = [];
  if (!Array.isArray(merged.aiRefinePromptVersions)) merged.aiRefinePromptVersions = [];
  if (!Array.isArray(merged.studyGuidePromptVersions)) merged.studyGuidePromptVersions = [];
  if (!Array.isArray(merged.aiFillPromptVersions)) merged.aiFillPromptVersions = [];
  return merged;
}

export async function setUserSettings(userEmail: string, settings: Partial<UserSettings>): Promise<void> {
  const db = getDrizzle();
  if (!db) return;

  for (const [key, value] of Object.entries(settings)) {
    const serialized = (Array.isArray(value) || (typeof value === "object" && value !== null))
      ? JSON.stringify(value)
      : String(value);
    await db.insert(userSettings)
      .values({
        userEmail, key, value: serialized,
        updatedAt: sql`datetime('now')` as unknown as string,
      })
      .onConflictDoUpdate({
        target: [userSettings.userEmail, userSettings.key],
        set: { value: serialized, updatedAt: sql`datetime('now')` },
      });
  }
}

// ── User snapshots ──────────────────────────────────────────────────────────

export async function getSnapshots(userEmail: string, examId?: string): Promise<Record<string, ExamSnapshot[]>> {
  const db = getDrizzle();
  if (!db) return {};

  const rows = examId
    ? await db.select({
        examId: userSnapshots.examId, ts: userSnapshots.ts, correct: userSnapshots.correct,
        total: userSnapshots.total, accuracy: userSnapshots.accuracy,
      })
      .from(userSnapshots)
      .where(and(eq(userSnapshots.userEmail, userEmail), eq(userSnapshots.examId, examId)))
      .orderBy(asc(userSnapshots.ts))
    : await db.select({
        examId: userSnapshots.examId, ts: userSnapshots.ts, correct: userSnapshots.correct,
        total: userSnapshots.total, accuracy: userSnapshots.accuracy,
      })
      .from(userSnapshots)
      .where(eq(userSnapshots.userEmail, userEmail))
      .orderBy(asc(userSnapshots.ts));

  const map: Record<string, ExamSnapshot[]> = {};
  for (const row of rows) {
    if (!map[row.examId]) map[row.examId] = [];
    map[row.examId].push({ ts: row.ts, correct: row.correct, total: row.total, accuracy: row.accuracy });
  }
  return map;
}

export async function saveSnapshot(
  userEmail: string, examId: string, ts: number,
  correct: number, total: number, accuracy: number
): Promise<void> {
  const db = getDrizzle();
  if (!db) return;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();
  const tomorrowTs = todayTs + 86400000;

  const [existing] = await db.select({ id: userSnapshots.id })
    .from(userSnapshots)
    .where(and(
      eq(userSnapshots.userEmail, userEmail),
      eq(userSnapshots.examId, examId),
      gte(userSnapshots.ts, todayTs),
      lt(userSnapshots.ts, tomorrowTs)
    ))
    .limit(1);

  if (existing) {
    await db.update(userSnapshots)
      .set({ ts, correct, total, accuracy })
      .where(eq(userSnapshots.id, existing.id));
  } else {
    await db.insert(userSnapshots).values({ userEmail, examId, ts, correct, total, accuracy });

    // Keep only last 60 snapshots per exam
    const d1 = getDB();
    if (d1) {
      await d1
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
}

// ── Study guides ────────────────────────────────────────────────────────────

export async function getStudyGuide(examId: string): Promise<{ markdown: string; generatedAt: string } | null> {
  const db = getDrizzle();
  if (!db) return null;

  const [row] = await db.select({ markdown: studyGuides.markdown, generatedAt: studyGuides.generatedAt })
    .from(studyGuides)
    .where(eq(studyGuides.examId, examId))
    .limit(1);

  if (!row) return null;
  return { markdown: row.markdown, generatedAt: row.generatedAt ?? "" };
}

export async function upsertStudyGuide(examId: string, markdown: string): Promise<void> {
  const db = getDrizzle();
  if (!db) return;

  await db.insert(studyGuides)
    .values({ examId, markdown, generatedAt: sql`datetime('now')` as unknown as string })
    .onConflictDoUpdate({
      target: studyGuides.examId,
      set: { markdown, generatedAt: sql`datetime('now')` },
    });
}

// ── App settings ───────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = getDrizzle();
  if (!db) return null;

  const [row] = await db.select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);

  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDrizzle();
  if (!db) return;

  await db.insert(appSettings)
    .values({ key, value, updatedAt: sql`datetime('now')` as unknown as string })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: sql`datetime('now')` },
    });
}

// ── Suggestions ────────────────────────────────────────────────────────────

function rowToSuggestion(row: typeof suggestionsTable.$inferSelect): Suggestion {
  return {
    id: row.id,
    questionId: row.questionId,
    type: row.type as "ai" | "manual",
    suggestedAnswers: row.suggestedAnswers ? JSON.parse(row.suggestedAnswers) : null,
    suggestedExplanation: row.suggestedExplanation ?? null,
    aiModel: row.aiModel ?? null,
    comment: row.comment ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt ?? "",
  };
}

export async function getSuggestions(questionId: string): Promise<Suggestion[]> {
  const db = getDrizzle();
  if (!db) return [];

  const rows = await db.select()
    .from(suggestionsTable)
    .where(eq(suggestionsTable.questionId, questionId))
    .orderBy(desc(suggestionsTable.createdAt));

  return rows.map(rowToSuggestion);
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
  const db = getDrizzle();
  if (!db) throw new Error("DB not available");

  await db.insert(suggestionsTable).values({
    questionId,
    type: data.type,
    suggestedAnswers: data.suggestedAnswers ? JSON.stringify(data.suggestedAnswers) : null,
    suggestedExplanation: data.suggestedExplanation ?? null,
    aiModel: data.aiModel ?? null,
    comment: data.comment ?? null,
    createdBy,
    createdAt: new Date().toISOString(),
  });

  // Fetch last inserted row (D1 doesn't support RETURNING reliably)
  const [row] = await db.select()
    .from(suggestionsTable)
    .where(eq(suggestionsTable.questionId, questionId))
    .orderBy(desc(suggestionsTable.id))
    .limit(1);

  if (!row) throw new Error("Failed to retrieve created suggestion");
  return rowToSuggestion(row);
}

export async function getSuggestionCount(questionId: string): Promise<number> {
  const db = getDrizzle();
  if (!db) return 0;

  const [row] = await db.select({ count: sql<number>`count(*)` })
    .from(suggestionsTable)
    .where(eq(suggestionsTable.questionId, questionId));

  return row?.count ?? 0;
}

export async function getSuggestionById(id: number): Promise<Suggestion | null> {
  const db = getDrizzle();
  if (!db) return null;

  const [row] = await db.select()
    .from(suggestionsTable)
    .where(eq(suggestionsTable.id, id));

  return row ? rowToSuggestion(row) : null;
}

export async function deleteSuggestion(id: number): Promise<void> {
  const db = getDrizzle();
  if (!db) throw new Error("DB not available");

  await db.delete(suggestionsTable).where(eq(suggestionsTable.id, id));
}
