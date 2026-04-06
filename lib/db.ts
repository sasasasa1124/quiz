import type {
  CategoryStat, Choice, ExamMeta, ExamSnapshot,
  Question, QuestionHistoryEntry, QuizStats, RichQuizStats, RichScoreEntry,
  SessionRecord, Suggestion, UserSettings,
} from "./types";
import { DEFAULT_USER_SETTINGS } from "./types";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { drizzle } from "drizzle-orm/d1";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, like, and, sql, asc, desc, isNotNull, lte, lt, gte, inArray } from "drizzle-orm";
import type { D1Database as CloudflareD1 } from "@cloudflare/workers-types";
import * as schema from "./schema";
import * as schemaPg from "./schema.pg";
import {
  exams as examsTable, questions as questionsTable, questionHistory,
  scores, sessions, sessionAnswers, userSettings, userSnapshots,
  userInvalidatedQuestions, studyGuides, suggestions as suggestionsTable,
  appSettings,
} from "./schema";

// ── D1 adapter (mimics postgres.js template-tag API) ──────────────────────

class UnsafeRaw { constructor(public readonly sql: string) {} }

type D1Client = {
  <T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  unsafe: (s: string) => UnsafeRaw;
};

function buildD1Client(d1: CloudflareD1): D1Client {
  const client = async function<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> {
    let query = "";
    const params: unknown[] = [];
    for (let i = 0; i < strings.length; i++) {
      query += strings[i];
      if (i < values.length) {
        const v = values[i];
        if (v instanceof UnsafeRaw) {
          query += v.sql;
        } else {
          params.push(v);
          query += `?${params.length}`;
        }
      }
    }
    const result = await d1.prepare(query).bind(...params).all<unknown>();
    return (result.results ?? []) as unknown as T;
  };
  client.unsafe = (s: string) => new UnsafeRaw(s);
  return client as unknown as D1Client;
}

// ── PostgreSQL adapter (wraps postgres.js with same template-tag API) ──────

// Singleton postgres.js client — reuse across requests to avoid connection churn.
let _pgSql: postgres.Sql | null = null;
function getPgSql(): postgres.Sql {
  if (!_pgSql) {
    const url = process.env.DATABASE_URL!;
    const ssl = url.includes("rds.amazonaws.com") ? { rejectUnauthorized: false } : false;
    _pgSql = postgres(url, { max: 10, idle_timeout: 20, ssl });
  }
  return _pgSql;
}

function buildPgClient(): D1Client {
  const client = async function<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> {
    const parts: string[] = [];
    const params: unknown[] = [];
    for (let i = 0; i < strings.length; i++) {
      if (i < values.length) {
        const v = values[i];
        if (v instanceof UnsafeRaw) {
          parts.push(strings[i] + v.sql);
        } else {
          params.push(v);
          parts.push(strings[i] + `$${params.length}`);
        }
      } else {
        parts.push(strings[i]);
      }
    }
    const query = parts.join("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPgSql().unsafe(query, params as any);
    return (result ?? []) as unknown as T;
  };
  client.unsafe = (s: string) => new UnsafeRaw(s);
  return client as unknown as D1Client;
}

// ── Database connection ────────────────────────────────────────────────────

/** True when running on Node.js (AWS App Runner) with a PostgreSQL DATABASE_URL. */
function isPg(): boolean {
  return !!process.env.DATABASE_URL;
}

/** Returns a SQL template-tag client, or null in local dev. */
export function getDB(): D1Client | null {
  if (isPg()) return buildPgClient();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d1 = (getRequestContext() as any).env.DB as CloudflareD1 | undefined;
    if (!d1) return null;
    return buildD1Client(d1);
  } catch {
    return null;
  }
}

/** Returns a Drizzle ORM instance, or null in local dev. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDrizzle(): any {
  if (isPg()) {
    return drizzlePg(getPgSql(), { schema: schemaPg });
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d1 = (getRequestContext() as any).env.DB as CloudflareD1 | undefined;
    if (!d1) return null;
    return drizzle(d1, { schema });
  } catch {
    return null;
  }
}

// ── CSV fallback (local dev only) ─────────────────────────────────────────

const LOCAL_BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

async function csvExamList(): Promise<ExamMeta[]> {
  try {
    const res = await fetch(`${LOCAL_BASE}/api/local-exams`);
    if (!res.ok) return [];
    return await res.json() as ExamMeta[];
  } catch { return []; }
}

async function csvQuestions(examId: string): Promise<Question[]> {
  try {
    const res = await fetch(`${LOCAL_BASE}/api/local-questions/${encodeURIComponent(examId)}`);
    if (!res.ok) return [];
    return await res.json() as Question[];
  } catch { return []; }
}

// ── Exam list ──────────────────────────────────────────────────────────────

export async function getExamList(): Promise<ExamMeta[]> {
  const pg = getDB();
  if (!pg) {
    return csvExamList();
  }

  type Row = { id: string; name: string; lang: string; tags: string | null; question_count: number; duplicate_count: number };
  const rows = await pg<Row[]>`
    SELECT e.id, e.name, e.lang, e.tags, COUNT(q.id) AS question_count,
           COALESCE(SUM(CASE WHEN q.is_duplicate = 1 THEN 1 ELSE 0 END), 0) AS duplicate_count
    FROM exams e
    LEFT JOIN questions q ON q.exam_id = e.id
    GROUP BY e.id
    ORDER BY e.lang ASC, e.name ASC`;

  return rows.map((row) => {
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
  const qIds = qs.map((q: { id: string }) => q.id);

  if (qIds.length > 0) {
    await db.delete(suggestionsTable).where(inArray(suggestionsTable.questionId, qIds));
    await db.delete(userInvalidatedQuestions).where(inArray(userInvalidatedQuestions.questionId, qIds));
    await db.delete(scores).where(inArray(scores.questionId, qIds));
    await db.delete(questionHistory).where(inArray(questionHistory.questionId, qIds));
  }

  // Collect session IDs
  const sess = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.examId, examId));
  const sessIds = sess.map((s: { id: string }) => s.id);
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
  const pg = getDB();
  if (!pg) return csvQuestions(examId);

  type Row = {
    id: string; num: number; question_text: string; options: string;
    answers: string; explanation: string; source: string;
    explanation_sources: string | null; is_duplicate: number; version: number;
    category: string | null; created_by: string; created_at: string | null;
    added_at: string | null; updated_at: string | null;
  };
  const rows = await pg<Row[]>`SELECT ${pg.unsafe(QUESTION_COLS)} FROM questions WHERE exam_id = ${examId} ORDER BY num ASC`;
  return rows.map(mapQuestionRow);
}

export async function getQuestionById(id: string): Promise<Question | null> {
  const pg = getDB();
  if (!pg) return null;

  type Row = {
    id: string; num: number; question_text: string; options: string;
    answers: string; explanation: string; source: string;
    explanation_sources: string | null; is_duplicate: number; version: number;
    category: string | null; created_by: string; created_at: string | null;
    added_at: string | null; updated_at: string | null;
  };
  const [row] = await pg<Row[]>`SELECT ${pg.unsafe(QUESTION_COLS)} FROM questions WHERE id = ${id}`;
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
  const pg = getDB();
  if (!pg) throw new Error("DB not available in local dev");

  type CurrentRow = { question_text: string; options: string; answers: string; explanation: string; source: string; explanation_sources: string | null; version: number };
  const [current] = await pg<CurrentRow[]>`SELECT question_text, options, answers, explanation, source, explanation_sources, version FROM questions WHERE id = ${id}`;
  if (!current) throw new Error(`Question ${id} not found`);

  await pg`
    INSERT INTO question_history (question_id, question_text, options, answers, explanation, source, explanation_sources, version, changed_by, change_reason)
    VALUES (${id}, ${current.question_text}, ${current.options}, ${current.answers}, ${current.explanation}, ${current.source ?? ""}, ${current.explanation_sources ?? "[]"}, ${current.version}, ${changedBy}, ${data.change_reason})`;

  const nowExpr = isPg() ? pg.unsafe("NOW()") : pg.unsafe("datetime('now')");
  await pg`
    UPDATE questions
    SET question_text = ${data.question_text}, options = ${JSON.stringify(data.options)},
        answers = ${JSON.stringify(data.answers)}, explanation = ${data.explanation},
        source = ${data.source ?? ""}, explanation_sources = ${JSON.stringify(data.explanation_sources ?? [])},
        version = version + 1, updated_at = ${nowExpr}
    WHERE id = ${id}`;
}

export async function setDuplicate(id: string, isDuplicate: boolean): Promise<void> {
  const db = getDrizzle();
  if (!db) throw new Error("DB not available in local dev");
  await db.update(questionsTable)
    .set({ isDuplicate: isDuplicate ? 1 : 0 })
    .where(eq(questionsTable.id, id));
}

export async function getUserInvalidatedIds(userEmail: string, examId: string): Promise<string[]> {
  const pg = getDB();
  if (!pg) return [];
  const rows = await pg<{ question_id: string }[]>`
    SELECT u.question_id FROM user_invalidated_questions u
    JOIN questions q ON q.id = u.question_id
    WHERE u.user_email = ${userEmail} AND q.exam_id = ${examId}`;
  return rows.map((r) => r.question_id);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((row: any) => ({
    id: row.id,
    questionId: row.questionId,
    questionText: row.questionText,
    options: JSON.parse(row.options) as Choice[],
    answers: JSON.parse(row.answers) as string[],
    explanation: row.explanation ?? "",
    source: row.source ?? "",
    explanationSources: JSON.parse(row.explanationSources ?? "[]") as string[],
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
  const pg = getDB();
  if (!pg) throw new Error("DB not available in local dev");

  const [maxRow] = await pg<{ max_num: number }[]>`SELECT COALESCE(MAX(num), 0) AS max_num FROM questions WHERE exam_id = ${examId}`;
  const num = (maxRow?.max_num ?? 0) + 1;
  const id = `${examId}__${num}`;

  const nowFn = isPg() ? pg.unsafe("NOW()") : pg.unsafe("datetime('now')");
  await pg`
    INSERT INTO questions (id, exam_id, num, question_text, options, answers, explanation, source,
                           explanation_sources, created_by, created_at, added_at)
    VALUES (${id}, ${examId}, ${num}, ${data.question_text}, ${JSON.stringify(data.options)},
            ${JSON.stringify(data.answers)}, ${data.explanation}, ${data.source},
            ${JSON.stringify(data.explanation_sources ?? [])}, ${createdBy}, ${nowFn}, ${nowFn})`;

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
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: [scores.userEmail, scores.questionId],
      set: {
        lastCorrect,
        attempts: sql`${scores.attempts} + 1`,
        correctCount: sql`${scores.correctCount} + ${correctDelta}`,
        updatedAt: new Date().toISOString(),
      },
    });
}

// ── Category stats ───────────────────────────────────────────────────────────

export async function getCategoryStats(userEmail: string, examId: string): Promise<CategoryStat[]> {
  const pg = getDB();
  if (!pg) return [];

  const rows = await pg<{ category: string | null; total: number; attempted: number; correct_count: number }[]>`
    SELECT q.category,
           COUNT(q.id) AS total,
           COUNT(s.question_id) AS attempted,
           COALESCE(SUM(s.last_correct), 0) AS correct_count
    FROM questions q
    LEFT JOIN scores s ON s.question_id = q.id AND s.user_email = ${userEmail}
    WHERE q.exam_id = ${examId}
    GROUP BY q.category
    ORDER BY q.category`;

  return rows.map((row) => ({
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
      startedAt: new Date().toISOString(),
      questionCount,
    })
    .onConflictDoNothing();
}

export async function completeSession(sessionId: string, correctCount: number): Promise<void> {
  const db = getDrizzle();
  if (!db) return;
  await db.update(sessions)
    .set({ completedAt: new Date().toISOString(), correctCount })
    .where(eq(sessions.id, sessionId));
}

export async function addSessionAnswer(sessionId: string, questionId: string, isCorrect: boolean): Promise<void> {
  const db = getDrizzle();
  if (!db) return;
  await db.insert(sessionAnswers).values({
    sessionId, questionId,
    isCorrect: isCorrect ? 1 : 0,
    answeredAt: new Date().toISOString(),
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((row: any) => ({
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
  const pg = getDB();
  if (!pg) return { todayCount: 0, activeDays: [] };

  const todayFilter = isPg()
    ? pg.unsafe("started_at::date = CURRENT_DATE")
    : pg.unsafe("date(started_at) = date('now')");
  const dateFn = isPg()
    ? pg.unsafe("started_at::date")
    : pg.unsafe("date(started_at)");

  const [todayRow] = await pg<{ cnt: number }[]>`
    SELECT COALESCE(SUM(question_count), 0) AS cnt
    FROM sessions WHERE user_email = ${userEmail} AND ${todayFilter}`;

  const dayRows = await pg<{ day: string }[]>`
    SELECT DISTINCT ${dateFn} AS day
    FROM sessions WHERE user_email = ${userEmail}
    ORDER BY day DESC LIMIT 90`;

  return {
    todayCount: todayRow?.cnt ?? 0,
    activeDays: dayRows.map((r) => r.day),
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
      updatedAt: new Date().toISOString(),
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
        updatedAt: new Date().toISOString(),
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

export async function getAllScores(userEmail: string): Promise<Record<string, { answered: number; correct: number }>> {
  // Aggregate per-exam using the examId prefix (format: "examId__questionNum")
  const pg = getDB();
  if (!pg) return {};
  const examIdExpr = isPg()
    ? pg.unsafe("substring(question_id, 1, strpos(question_id, '__') - 1)")
    : pg.unsafe("substr(question_id, 1, instr(question_id, '__') - 1)");
  const hasDelimExpr = isPg()
    ? pg.unsafe("strpos(question_id, '__') > 0")
    : pg.unsafe("instr(question_id, '__') > 0");

  const rows = await pg<{ exam_id: string; answered: number; correct: number }[]>`
    SELECT
      ${examIdExpr} AS exam_id,
      COUNT(*) AS answered,
      SUM(CASE WHEN last_correct = 1 THEN 1 ELSE 0 END) AS correct
    FROM scores
    WHERE user_email = ${userEmail}
      AND ${hasDelimExpr}
    GROUP BY exam_id`;

  const statsMap: Record<string, { answered: number; correct: number }> = {};
  for (const row of rows) {
    statsMap[row.exam_id] = { answered: row.answered, correct: row.correct };
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
    } else if (row.key === "aiPromptVersions" || row.key === "aiRefinePromptVersions" || row.key === "studyGuidePromptVersions" || row.key === "aiFactCheckPromptVersions") {
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
  if (!Array.isArray(merged.aiPromptVersions)) merged.aiPromptVersions = [];
  if (!Array.isArray(merged.aiRefinePromptVersions)) merged.aiRefinePromptVersions = [];
  if (!Array.isArray(merged.studyGuidePromptVersions)) merged.studyGuidePromptVersions = [];
  return merged;
}

export async function setUserSettings(userEmail: string, settings: Partial<UserSettings>): Promise<void> {
  const db = getDrizzle();
  if (!db) return;

  const entries = Object.entries(settings);
  if (!entries.length) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.transaction(async (tx: any) => {
    for (const [key, value] of entries) {
      const serialized = (Array.isArray(value) || (typeof value === "object" && value !== null))
        ? JSON.stringify(value)
        : String(value);
      await tx.insert(userSettings)
        .values({
          userEmail, key, value: serialized,
          updatedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: [userSettings.userEmail, userSettings.key],
          set: { value: serialized, updatedAt: new Date().toISOString() },
        });
    }
  });
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
    const pg2 = getDB();
    if (pg2) {
      await pg2`
        DELETE FROM user_snapshots WHERE user_email = ${userEmail} AND exam_id = ${examId} AND id NOT IN (
          SELECT id FROM user_snapshots WHERE user_email = ${userEmail} AND exam_id = ${examId}
          ORDER BY ts DESC LIMIT 60
        )`; // SQLite supports this subquery DELETE syntax
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
  // D1 may return large TEXT columns as ArrayBuffer/Uint8Array — coerce to string
  let md = row.markdown;
  if (typeof md !== "string") {
    try {
      md = new TextDecoder().decode(md as unknown as ArrayBuffer);
    } catch {
      md = String(md);
    }
  }
  return { markdown: md, generatedAt: row.generatedAt ?? "" };
}

export async function upsertStudyGuide(examId: string, markdown: string): Promise<void> {
  const db = getDrizzle();
  if (!db) return;

  await db.insert(studyGuides)
    .values({ examId, markdown, generatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: studyGuides.examId,
      set: { markdown, generatedAt: new Date().toISOString() },
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
    .values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date().toISOString() },
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

// ── TTS cache ───────────────────────────────────────────────────────────────

export async function getTtsCacheEntry(textHash: string): Promise<string | null> {
  const db = getDrizzle();
  if (!db) return null;

  const [row] = await db.select({ wavData: schema.ttsCache.wavData })
    .from(schema.ttsCache)
    .where(eq(schema.ttsCache.textHash, textHash));

  return row?.wavData ?? null;
}

export async function setTtsCacheEntry(textHash: string, wavData: string, model: string, voice: string): Promise<void> {
  const db = getDrizzle();
  if (!db) return;

  await db.insert(schema.ttsCache)
    .values({ textHash, wavData, model, voice, createdAt: new Date().toISOString() })
    .onConflictDoNothing();
}
