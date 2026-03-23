import type { Locale } from "./i18n";
export type { Locale };

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
  updatedAt: string; // when the question was last edited (ISO datetime)
}

export interface ExamMeta {
  id: string;           // exam id
  name: string;         // display name
  language: Locale;
  questionCount: number;
  duplicateCount?: number;
  tags?: string[];      // categorization tags (e.g. ["Salesforce", "MuleSoft"])
}

export interface PromptVersion {
  name: string;    // version identifier (e.g. "default", "my-custom-v1")
  author: string;  // author name
  prompt: string;  // prompt text
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
  language: Locale;
  aiPrompt: string;
  aiPromptAuthor: string;           // author of the current explain prompt
  aiPromptVersions: PromptVersion[]; // saved named versions
  aiRefinePrompt: string;
  aiRefinePromptAuthor: string;
  aiRefinePromptVersions: PromptVersion[];
  studyGuidePrompt: string;
  studyGuidePromptAuthor: string;
  studyGuidePromptVersions: PromptVersion[];
  dailyGoal: number; // questions per day target
  audioMode: boolean; // read questions aloud
  audioSpeed: number; // playback rate 0.5–4.0
  audioPrefetch: number; // chunks to pre-fetch ahead while playing (0 = off)
  skipRevealOnCorrect: boolean; // auto-advance without showing answer when correct
}

export const DEFAULT_EXPLAIN_PROMPT = `You are a Salesforce/MuleSoft certification exam expert. Analyze the question below thoroughly.

Question:
{question}

Choices:
{choices}

Currently recorded answer(s): {answers}
{explanation}

## Source verification rules (MUST follow)
- Official Salesforce sources (help.salesforce.com, developer.salesforce.com, trailhead.salesforce.com, mulesoft.com/docs, etc.): a single authoritative source is sufficient.
- Unofficial sources (blogs, forums, community posts, third-party study sites): you MUST verify the claim is consistent across at least 2 independent unofficial sources before accepting it. If you cannot confirm consistency, flag the uncertainty in the explanation.

## Output format
Respond ONLY with a JSON object (no markdown, no code fences) with exactly these keys:

{
  "highlights": ["exact phrase 1", "exact phrase 2"],
  "explanation": "...",
  "answers": ["A"],
  "reasoning": "..."
}

Field definitions:
- highlights: up to 6 exact substrings from the question text that are critical for determining the correct answer — constraint words, feature names, qualifying conditions, action verbs that change the scope, etc. These will be visually highlighted for the user.
- explanation: structured in three labeled sections (use the exact section headers below):

[Key Concepts]
The core Salesforce/MuleSoft concepts the question tests. Keep concise (3–5 bullet points or sentences).

[Answer Analysis]
Per-choice breakdown using the choice labels explicitly:
A: <why correct or incorrect>
B: <why correct or incorrect>
(continue for all choices)

[Why Incorrect Options Fail]
For each wrong choice, state the specific misconception or edge case that makes it wrong.

- answers: array of correct choice labels e.g. ["A"] or ["A","C"]
- reasoning: step-by-step elimination — how a test-taker should narrow down to the correct answer using the key concepts and choice comparisons`;

export const DEFAULT_REFINE_PROMPT = `You are an expert editor for Salesforce/MuleSoft certification exam questions.
Your tasks:
1. Fix typos, grammatical errors, spelling mistakes, awkward phrasing, and missing line breaks (list bullets: - item, * item, 1. item, etc.).
2. Add **bold** markers around the key terms that are critical for identifying the correct answer — specifically:
   - The core action or decision being asked (e.g., "**which feature** should be used", "**what is the first step**")
   - Technical terms or conditions that distinguish one choice from another (e.g., "**without sharing**", "**before save**")
   - Important constraints or qualifiers (e.g., "**without writing code**", "**in a single transaction**")
   Use **bold** sparingly — only on genuinely important distinguishing terms, not on every noun.

Do NOT change meaning, technical content, correct answers, or add/remove choices.
Do NOT rewrite or rephrase if there is no error — preserve the original wording.
When searching, limit to official sources only (help.salesforce.com, developer.salesforce.com, trailhead.salesforce.com, docs.mulesoft.com).

Question:
{question}

Choices:
{choices}

Respond ONLY with a JSON object (no markdown, no code fences) with exactly these keys:
{ "question": "...", "choices": [{"label": "A", "text": "..."}], "changesSummary": "..." }
- question: the corrected question text with **bold** highlights (identical to input if no changes needed)
- choices: array of corrected choices in the same order (identical to input if no changes needed)
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

export const DEFAULT_STUDY_GUIDE_PROMPT = `
You are an expert on the "{examName}" certification exam.
Analyze the exam questions provided below (grouped by category) and use Google Search to find the latest relevant official documentation. Then, produce a comprehensive Study Guide in Markdown format. For each category, your guide must cover:
- Key topics and frequently asked concepts
- The core knowledge and concepts required to uniquely determine the correct answers
- Study priorities
`;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  language: "en",
  aiPrompt: DEFAULT_EXPLAIN_PROMPT,
  aiPromptAuthor: "",
  aiPromptVersions: [],
  aiRefinePrompt: DEFAULT_REFINE_PROMPT,
  aiRefinePromptAuthor: "",
  aiRefinePromptVersions: [],
  studyGuidePrompt: DEFAULT_STUDY_GUIDE_PROMPT,
  studyGuidePromptAuthor: "",
  studyGuidePromptVersions: [],
  dailyGoal: 100,
  audioMode: false,
  audioSpeed: 1.0,
  audioPrefetch: 0,
  skipRevealOnCorrect: false,
};
