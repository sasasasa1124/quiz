/**
 * Drizzle ORM schema — mirrors the existing D1 database structure.
 * Source of truth for Drizzle Kit migrations going forward.
 */
import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";

export const exams = sqliteTable("exams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  lang: text("lang").notNull(),
  tags: text("tags"), // JSON: string[]
});

export const questions = sqliteTable("questions", {
  id: text("id").primaryKey(),
  examId: text("exam_id").notNull().references(() => exams.id),
  num: integer("num").notNull(),
  questionText: text("question_text").notNull(),
  options: text("options").notNull(), // JSON: Choice[]
  answers: text("answers").notNull(), // JSON: string[]
  explanation: text("explanation").default(""),
  source: text("source").default(""),
  explanationSources: text("explanation_sources"), // JSON: string[]
  isDuplicate: integer("is_duplicate").default(0),
  version: integer("version").default(1),
  category: text("category"),
  createdBy: text("created_by"),
  createdAt: text("created_at"),
  addedAt: text("added_at"),
  updatedAt: text("updated_at"),
});

export const questionHistory = sqliteTable("question_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: text("question_id").notNull(),
  questionText: text("question_text").notNull(),
  options: text("options").notNull(),
  answers: text("answers").notNull(),
  explanation: text("explanation").default(""),
  version: integer("version").notNull(),
  changedAt: text("changed_at"),
  changedBy: text("changed_by"),
  changeReason: text("change_reason"),
});

export const scores = sqliteTable("scores", {
  userEmail: text("user_email").notNull(),
  questionId: text("question_id").notNull(),
  lastCorrect: integer("last_correct").notNull(),
  attempts: integer("attempts").default(1),
  correctCount: integer("correct_count").default(0),
  intervalDays: integer("interval_days").default(1),
  easeFactor: real("ease_factor").default(2.5),
  nextReviewAt: text("next_review_at"),
  updatedAt: text("updated_at"),
}, (t) => [primaryKey({ columns: [t.userEmail, t.questionId] })]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  examId: text("exam_id").notNull(),
  mode: text("mode"),
  filter: text("filter"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  questionCount: integer("question_count"),
  correctCount: integer("correct_count"),
});

export const sessionAnswers = sqliteTable("session_answers", {
  sessionId: text("session_id").notNull(),
  questionId: text("question_id").notNull(),
  isCorrect: integer("is_correct").notNull(),
  answeredAt: text("answered_at"),
});

export const userSettings = sqliteTable("user_settings", {
  userEmail: text("user_email").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedAt: text("updated_at"),
}, (t) => [primaryKey({ columns: [t.userEmail, t.key] })]);

export const userSnapshots = sqliteTable("user_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email").notNull(),
  examId: text("exam_id").notNull(),
  ts: integer("ts").notNull(),
  correct: integer("correct").notNull(),
  total: integer("total").notNull(),
  accuracy: real("accuracy").notNull(),
  createdAt: text("created_at"),
});

export const userInvalidatedQuestions = sqliteTable("user_invalidated_questions", {
  userEmail: text("user_email").notNull(),
  questionId: text("question_id").notNull(),
}, (t) => [primaryKey({ columns: [t.userEmail, t.questionId] })]);

export const studyGuides = sqliteTable("study_guides", {
  examId: text("exam_id").primaryKey(),
  markdown: text("markdown").notNull(),
  generatedAt: text("generated_at"),
});

export const suggestions = sqliteTable("suggestions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: text("question_id").notNull(),
  type: text("type").notNull(), // 'ai' | 'manual'
  suggestedAnswers: text("suggested_answers"),
  suggestedExplanation: text("suggested_explanation"),
  aiModel: text("ai_model"),
  comment: text("comment"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at"),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at"),
});
