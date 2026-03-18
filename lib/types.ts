export interface Choice {
  label: string; // "A", "B", "C", ...
  text: string;  // choice body
}

export interface Question {
  id: number;
  dbId: string;      // "{examId}__{num}" – used for API calls
  question: string;
  choices: Choice[];
  answers: string[]; // ["A", "C", "E"]
  explanation: string;
  source: string;            // question source (website/reference)
  explanationSources: string[]; // explanation/answer reference URLs (multiple)
  isDuplicate: boolean;
  choiceCount: number; // metadata for validation
  isMultiple: boolean; // true if answers.length > 1
  version: number;
  category: string | null;
  createdBy: string;
  createdAt: string; // when the question was authored (ISO datetime)
  addedAt: string;   // when the question was added to the DB (ISO datetime)
}

export interface ExamMeta {
  id: string;           // exam id
  name: string;         // display name
  language: "ja" | "en";
  questionCount: number;
  duplicateCount?: number;
}

export interface CategoryStat {
  category: string | null;
  total: number;
  attempted: number;
  correct: number;
}

export interface QuestionHistoryEntry {
  id: number;
  questionId: string;
  questionText: string;
  options: Choice[];
  answers: string[];
  explanation: string;
  version: number;
  changedAt: string;
  changedBy: string | null;
  changeReason: string | null;
}

// 0 = last answer wrong, 1 = last answer correct, undefined = never answered
export type QuizStat = 0 | 1;

export type QuizStats = Record<string, QuizStat>; // key: String(question.id)

export interface ExamSnapshot {
  ts: number;       // Unix ms
  correct: number;
  total: number;
  accuracy: number; // 0–100
}

export interface UserSettings {
  language: "en" | "ja" | "zh" | "ko";
  aiPrompt: string;
  aiRefinePrompt: string;
}

export const DEFAULT_EXPLAIN_PROMPT = `You are a Salesforce/MuleSoft certification exam expert.

Question:
{question}

Choices:
{choices}

Currently recorded answer(s): {answers}
{explanation}

Please verify the correct answer(s) using your knowledge and web search if needed.
Respond ONLY with a JSON object (no markdown, no code fences) with exactly these keys:
{ "explanation": "...", "answers": ["A"], "reasoning": "...", "sources": ["https://..."] }
- explanation: concise explanation of why the correct answer(s) are correct
- answers: array of correct choice labels (e.g. ["A"] or ["A", "C"])
- reasoning: brief reasoning for why you chose those answers
- sources: array of 1–3 URLs that directly support the answer (official docs, Trailhead, etc.). Use [] if none found.`;

export const DEFAULT_REFINE_PROMPT = `You are an expert editor for Salesforce/MuleSoft certification exam questions.
Your task is to fix ONLY typos, grammatical errors, spelling mistakes, and awkward phrasing in the question text and answer choices.
Do NOT change the meaning, technical content, correct answers, or add/remove choices.
Do NOT rewrite or rephrase if there is no error — preserve the original wording as much as possible.

Question:
{question}

Choices:
{choices}

Respond ONLY with a JSON object (no markdown, no code fences) with exactly these keys:
{ "question": "...", "choices": [{"label": "A", "text": "..."}], "changesSummary": "..." }
- question: the corrected question text (identical to input if no errors found)
- choices: array of corrected choices in the same order (identical to input if no errors found)
- changesSummary: a brief human-readable summary of what was changed, or empty string if nothing changed`;

export interface SessionRecord {
  id: string;
  userEmail: string;
  examId: string;
  mode: "quiz" | "review";
  filter: "all" | "wrong";
  startedAt: string;
  completedAt: string | null;
  questionCount: number;
  correctCount: number | null;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  language: "en",
  aiPrompt: DEFAULT_EXPLAIN_PROMPT,
  aiRefinePrompt: DEFAULT_REFINE_PROMPT,
};
