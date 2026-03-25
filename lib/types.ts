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
  aiFillPrompt: string;
  aiFillPromptAuthor: string;
  aiFillPromptVersions: PromptVersion[];
  aiFactCheckPrompt: string;
  aiFactCheckPromptAuthor: string;
  aiFactCheckPromptVersions: PromptVersion[];
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
Per-choice breakdown using the choice labels explicitly. For each choice state whether it is correct or incorrect and why:
A: <correct/incorrect — reason>
B: <correct/incorrect — reason>
(continue for all choices)

[Sources]
List 1–3 official URLs that directly support the correct answer (help.salesforce.com, developer.salesforce.com, trailhead.salesforce.com, docs.mulesoft.com, etc.). Do not include unofficial sources.

- answers: array of correct choice labels e.g. ["A"] or ["A","C"]
- reasoning: step-by-step elimination — how a test-taker should narrow down to the correct answer using the key concepts and choice comparisons

IMPORTANT: Write the explanation and reasoning fields in the same language as the question text. If the question is in Japanese, write in Japanese. If in English, write in English.`;

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

Currently recorded answer(s): {answers}

Respond ONLY with a JSON object (no markdown, no code fences) with exactly these keys:
{ "question": "...", "choices": [{"label": "A", "text": "..."}], "changesSummary": "...", "highlights": ["phrase1", "phrase2"] }
- question: the corrected question text with **bold** highlights (identical to input if no changes needed)
- choices: array of corrected choices in the same order (identical to input if no changes needed)
- changesSummary: a brief human-readable summary of what was changed, or empty string if nothing changed
- highlights: up to 6 exact substrings from the (refined) question text to visually highlight for the user. Choose phrases that:
  (a) capture the core question being asked — the final "which feature…", "what should…", "what is the…" clause that defines what the test-taker must determine, and
  (b) are the key differentiating terms between choices — specific words, constraints, or qualifiers whose presence is what makes one choice correct and the others wrong (e.g. "without writing code", "before save", "in a single transaction").
  Avoid generic nouns. Prioritize terms that would change the correct answer if they changed.`;

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
  filter: "all" | "continue" | "wrong" | "custom";
  startedAt: string;
  completedAt: string | null;
  questionCount: number;
  correctCount: number | null;
}

export interface FilterConfig {
  neverAttempted: boolean;       // include questions never answered
  dueForReview: boolean;         // SM-2 nextReviewAt <= today
  maxAttempts: number | null;    // attempts <= N
  maxAccuracy: number | null;    // (correctCount/attempts)*100 <= N%
  notSeenInDays: number | null;  // last answered >= N days ago (includes never answered)
}

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  neverAttempted: false,
  dueForReview: false,
  maxAttempts: null,
  maxAccuracy: null,
  notSeenInDays: null,
};

export interface RichScoreEntry {
  lastCorrect: 0 | 1;
  attempts: number;
  correctCount: number;
  updatedAt: string | null;    // ISO datetime
  nextReviewAt: string | null; // YYYY-MM-DD
}

export type RichQuizStats = { [questionId: string]: RichScoreEntry };

export const DEFAULT_STUDY_GUIDE_PROMPT = `You are an expert on the "{examName}" certification exam.
Analyze the exam questions provided below (grouped by category) and use Google Search to find the latest relevant official documentation. Then, produce a comprehensive Study Guide in Markdown format. For each category, your guide must cover:

1. **Key topics and frequently tested areas** — what this category covers and which topics appear most often in exam questions.

2. **Essential knowledge structure** — the core concepts required to uniquely determine the correct answer for any question in this category. Do NOT format this as Q&A pairs. Instead, present it as structured knowledge: if the user masters these concepts, they can answer ALL questions in this category. Aim for depth and precision — identify the exact distinctions, rules, and conditions that drive correct answers.

3. **Tricky points and common pitfalls** — specific misconceptions, edge cases, or nuances frequently tested in exam questions that tend to lead test-takers to wrong answers.

4. **Personalized study advice** (when user performance data is provided) — based on the user's accuracy and wrong answer patterns in this category, identify priority areas and provide targeted study recommendations.

## Required output structure

# Study Guide: {examName}

## Overall Overview
- Exam overview: number of questions, time limit, passing score, domain weights (use Google Search for the official exam guide)
- Key topics and recommended study priorities

## Per-Category Study Guide
For each category, write a detailed section covering all 4 elements above.
### {Category Name} ({N} questions)

{userStats}---

## Question Data
{questions}

Important: Use Google Search to look up "{examName} exam guide" and "{examName} certification" for the latest official information. Limit searches to official Salesforce and MuleSoft sources only (help.salesforce.com, developer.salesforce.com, trailhead.salesforce.com, docs.mulesoft.com).
{langInstruction}`;

export const DEFAULT_FACTCHECK_PROMPT = `You are a Salesforce/MuleSoft certification exam fact-checker with access to Google Search.

Given the question and currently recorded answers below, verify whether the answers are correct using official sources.

Question:
{question}

Choices:
{choices}

Currently recorded answer(s): {answers}

## Your tasks
1. Use Google Search to verify the correct answer(s) using official sources only (help.salesforce.com, developer.salesforce.com, trailhead.salesforce.com, docs.mulesoft.com).
2. Determine whether the recorded answer(s) match the correct answers.
3. If incorrect or uncertain, identify the correct answer(s).

Respond ONLY with a JSON object (no markdown, no code fences) with exactly these keys:
{
  "isCorrect": true,
  "correctAnswers": ["A"],
  "confidence": "high",
  "issues": [],
  "explanation": "...",
  "sources": ["https://..."]
}

Field definitions:
- isCorrect: true if the recorded answers exactly match the correct answers
- correctAnswers: array of correct choice labels according to your research (e.g. ["A"] or ["A","C"])
- confidence: "high" if confirmed by official source, "medium" if inferred, "low" if uncertain
- issues: list of problems found (empty array if isCorrect is true)
- explanation: brief explanation of why the answers are correct/incorrect (2–3 sentences)
- sources: 1–3 official URLs that directly support your finding

IMPORTANT: Write the explanation in the same language as the question text. If the question is in Japanese, write in Japanese. If in English, write in English.`;

export const DEFAULT_FILL_PROMPT = `You are a Salesforce/MuleSoft certification exam expert with access to Google Search for fact verification.

For each question in the JSON array below, fill in the fields listed in "missing":
- "answers": array of correct choice labels (e.g. ["A"] or ["A","C"]). Verify with Google Search.
- "explanation": 2-3 paragraph explanation of why the answers are correct and why incorrect options are wrong.
- "category": short topic/domain label (e.g. "Data Management", "Security Model", "Automation", "Reporting").

Return a JSON array (no markdown, no code blocks) with this exact structure for every question:
[{ "id": "<question id>", "answers": [...], "explanation": "...", "category": "..." }]

Even if a field is not in "missing", include it in your response (copy from input or infer).

IMPORTANT: Write the explanation field in the same language as the question text. If the question is in Japanese, write in Japanese. If in English, write in English.

Questions:
{questions}`;

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
  aiFillPrompt: DEFAULT_FILL_PROMPT,
  aiFillPromptAuthor: "",
  aiFillPromptVersions: [],
  aiFactCheckPrompt: DEFAULT_FACTCHECK_PROMPT,
  aiFactCheckPromptAuthor: "",
  aiFactCheckPromptVersions: [],
  dailyGoal: 100,
  audioMode: false,
  audioSpeed: 1.0,
  audioPrefetch: 0,
  skipRevealOnCorrect: false,
};
