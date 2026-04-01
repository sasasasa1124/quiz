/**
 * Drizzle ORM schema for PostgreSQL (AWS RDS).
 * Mirrors lib/schema.ts but uses pgTable / serial instead of sqliteTable / integer autoIncrement.
 */
import { pgTable, text, integer, real, serial, primaryKey } from "drizzle-orm/pg-core";

export const exams = pgTable("exams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  lang: text("lang").notNull(),
  tags: text("tags"), // JSON: string[]
  createdBy: text("created_by"),
});

export const questions = pgTable("questions", {
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

export const questionHistory = pgTable("question_history", {
  id: serial("id").primaryKey(),
  questionId: text("question_id").notNull(),
  questionText: text("question_text").notNull(),
  options: text("options").notNull(),
  answers: text("answers").notNull(),
  explanation: text("explanation").default(""),
  source: text("source").default(""),
  explanationSources: text("explanation_sources").default("[]"),
  version: integer("version").notNull(),
  changedAt: text("changed_at"),
  changedBy: text("changed_by"),
  changeReason: text("change_reason"),
});

export const scores = pgTable("scores", {
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

export const sessions = pgTable("sessions", {
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

export const sessionAnswers = pgTable("session_answers", {
  sessionId: text("session_id").notNull(),
  questionId: text("question_id").notNull(),
  isCorrect: integer("is_correct").notNull(),
  answeredAt: text("answered_at"),
});

export const userSettings = pgTable("user_settings", {
  userEmail: text("user_email").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedAt: text("updated_at"),
}, (t) => [primaryKey({ columns: [t.userEmail, t.key] })]);

export const userSnapshots = pgTable("user_snapshots", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  examId: text("exam_id").notNull(),
  ts: integer("ts").notNull(),
  correct: integer("correct").notNull(),
  total: integer("total").notNull(),
  accuracy: real("accuracy").notNull(),
  createdAt: text("created_at"),
});

export const userInvalidatedQuestions = pgTable("user_invalidated_questions", {
  userEmail: text("user_email").notNull(),
  questionId: text("question_id").notNull(),
}, (t) => [primaryKey({ columns: [t.userEmail, t.questionId] })]);

export const studyGuides = pgTable("study_guides", {
  examId: text("exam_id").primaryKey(),
  markdown: text("markdown").notNull(),
  generatedAt: text("generated_at"),
});

export const suggestions = pgTable("suggestions", {
  id: serial("id").primaryKey(),
  questionId: text("question_id").notNull(),
  type: text("type").notNull(), // 'ai' | 'manual'
  suggestedAnswers: text("suggested_answers"),
  suggestedExplanation: text("suggested_explanation"),
  aiModel: text("ai_model"),
  comment: text("comment"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at"),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at"),
});

export const ttsCache = pgTable("tts_cache", {
  textHash: text("text_hash").primaryKey(),
  wavData: text("wav_data").notNull(),
  model: text("model").notNull(),
  voice: text("voice").notNull(),
  createdAt: text("created_at").notNull(),
});
