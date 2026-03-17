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
  source: string;
  isDuplicate: boolean;
  choiceCount: number; // metadata for validation
  isMultiple: boolean; // true if answers.length > 1
  version: number;
  category: string | null;
  createdBy: string;
}

export interface ExamMeta {
  id: string;           // exam id
  name: string;         // display name
  language: "ja" | "en";
  questionCount: number;
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

export interface UserSettings {
  language: "en" | "ja" | "zh" | "ko";
  aiPrompt: string;
  aiRefinePrompt: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  language: "en",
  aiPrompt: "",
  aiRefinePrompt: "",
};
