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
  language: "ja" | "en" | "zh" | "ko";
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
  studyGuidePrompt: string;
  dailyGoal: number; // questions per day target
  audioMode: boolean; // read questions aloud
  audioSpeed: number; // playback rate 0.5–4.0
  audioPrefetch: number; // chunks to pre-fetch ahead while playing (0 = off)
  skipRevealOnCorrect: boolean; // auto-advance without showing answer when correct
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
{ "explanation": "...", "answers": ["A"], "reasoning": "..." }
- explanation: concise explanation of why the correct answer(s) are correct
- answers: array of correct choice labels (e.g. ["A"] or ["A", "C"])
- reasoning: brief reasoning for why you chose those answers`;

export const DEFAULT_REFINE_PROMPT = `You are an expert editor for Salesforce/MuleSoft certification exam questions.
Your task is to fix ONLY typos, grammatical errors, spelling mistakes, and awkward phrasing, missing line breaks (either in list, bullets; 1.xxx, 1).xxx, *xxx , - xxx, etc.) in the question text and answer choices.
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

export interface Suggestion {
  id: number;
  questionId: string;
  type: "ai" | "manual";
  suggestedAnswers: string[] | null;
  suggestedExplanation: string | null;
  aiModel: string | null;
  comment: string | null;
  createdBy: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userEmail: string;
  examId: string;
  mode: "quiz" | "review";
  filter: "all" | "continue" | "wrong";
  startedAt: string;
  completedAt: string | null;
  questionCount: number;
  correctCount: number | null;
}

export const DEFAULT_STUDY_GUIDE_PROMPT = `You are an expert on the "{examName}" certification exam.
Analyze the exam questions below (grouped by category) and use Google Search to find the latest official exam guide information. Then produce a comprehensive Study Guide in Markdown format covering key topics, representative Q&As per category, and study priorities.`;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  language: "en",
  aiPrompt: DEFAULT_EXPLAIN_PROMPT,
  aiRefinePrompt: DEFAULT_REFINE_PROMPT,
  studyGuidePrompt: DEFAULT_STUDY_GUIDE_PROMPT,
  dailyGoal: 20,
  audioMode: false,
  audioSpeed: 1.0,
  audioPrefetch: 0,
  skipRevealOnCorrect: false,
};
