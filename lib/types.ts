export interface Choice {
  label: string; // "A", "B", "C", ...
  text: string;  // choice body
}

export interface Question {
  id: number;
  question: string;
  choices: Choice[];
  answers: string[]; // ["A", "C", "E"]
  explanation: string;
  source: string;
  isDuplicate: boolean;
  choiceCount: number; // metadata for validation
  isMultiple: boolean; // true if answers.length > 1
}

export interface ExamMeta {
  id: string;           // file name without .csv
  name: string;         // display name
  language: "ja" | "en";
  questionCount: number;
}

// 0 = last answer wrong, 1 = last answer correct, undefined = never answered
export type QuizStat = 0 | 1;

export type QuizStats = Record<string, QuizStat>; // key: questionId
