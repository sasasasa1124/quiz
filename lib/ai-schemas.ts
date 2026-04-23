/**
 * Centralized Zod schemas for AI (Gemini) response validation.
 *
 * All routes that parse AI-generated JSON should import schemas from here
 * rather than defining them inline, so the expected shapes are auditable
 * in one place.
 */

import { z } from "zod";

// ── Fact-check ────────────────────────────────────────────────────────────────
// Used by: app/api/ai/factcheck + app/api/admin/exams/[id]/factcheck

export const AiFactCheckResponseSchema = z.object({
  isCorrect: z.boolean(),
  correctAnswers: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
  issues: z.array(z.string()),
  explanation: z.string(),
  sources: z.array(z.string()),
  highlights: z.array(z.string()).optional(),
});

export type AiFactCheckResponse = z.infer<typeof AiFactCheckResponseSchema>;

// ── Refine ────────────────────────────────────────────────────────────────────
// Used by: app/api/ai/refine + app/api/admin/exams/[id]/refine

export const ChoiceSchema = z.object({
  label: z.string(),
  text: z.string(),
});

export const AiRefineResponseSchema = z.object({
  question: z.string(),
  choices: z.array(ChoiceSchema),
  changesSummary: z.string(),
  highlights: z.array(z.string()).optional(),
});

export type AiRefineResponse = z.infer<typeof AiRefineResponseSchema>;

// ── Fill ──────────────────────────────────────────────────────────────────────
// Used by: app/api/admin/exams/[id]/fill
// Fill now uses the same explain prompt format (aiPrompt) + a category field appended.

export const AdminFillResultSchema = z.object({
  id: z.string(),
  answers: z.array(z.string()).optional(),
  explanation: z.string().optional(),
  category: z.string().optional(),
});

export const AdminFillResultsSchema = z.array(AdminFillResultSchema);

export type AdminFillResult = z.infer<typeof AdminFillResultSchema>;

// Schema for parsing fill responses that use the explain prompt format
export const FillFromExplainSchema = z.object({
  coreConcept: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  explanation: z.string(),
  answers: z.array(z.string()),
  reasoning: z.string().optional(),
  category: z.string().optional(),
});

// ── Translate ─────────────────────────────────────────────────────────────────
// Used by: app/api/admin/exams/[id]/translate

export const TranslatedChoiceSchema = z.object({
  // Accept both "label" (correct) and "id" (LLM sometimes returns wrong field name)
  label: z.string().optional(),
  id: z.string().optional(),
  text: z.string(),
}).transform((c) => ({
  label: c.label ?? c.id ?? "",
  text: c.text,
}));

export const TranslatedQuestionSchema = z.object({
  num: z.number(),
  question: z.string(),
  choices: z.array(TranslatedChoiceSchema),
  explanation: z.string(),
  category: z.string().nullable().optional(),
});

export const TranslatedQuestionsSchema = z.array(TranslatedQuestionSchema);

export type TranslatedQuestion = z.infer<typeof TranslatedQuestionSchema>;

// ── Import ────────────────────────────────────────────────────────────────────
// Used by: app/api/admin/import

// Gemini codeExecution outputs questions in this format.
// answer accepts both string ("A,C") and array (["A","C"]) — coerced to array.
export const ImportedQuestionSchema = z.object({
  num: z.number().int().positive(),
  question: z.string().min(1),
  choices: z.array(z.string()).min(2).max(8),
  answer: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => {
      const raw = typeof v === "string" ? v : v.join(",");
      return raw
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z]$/.test(s));
    }),
  explanation: z.string().default(""),
  source: z.string().default(""),
  category: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").toString()),
});

export const ImportedQuestionsSchema = z.array(ImportedQuestionSchema);

export type ImportedQuestion = z.infer<typeof ImportedQuestionSchema>;

// ── Feedback fixes ────────────────────────────────────────────────────────────
// Used by: app/api/admin/import/[examId]/feedback

export const FeedbackFixSchema = z.object({
  /** Question ID in the form "examId__N" */
  id: z.string().min(1),
  field: z.enum(["question_text", "options", "answers", "explanation", "source"]),
  /** Serialized value — options/answers are JSON strings */
  value: z.string(),
});

export const FeedbackFixesSchema = z.array(FeedbackFixSchema);

export type FeedbackFix = z.infer<typeof FeedbackFixSchema>;
