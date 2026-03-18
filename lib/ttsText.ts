import type { Question } from "./types";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function buildQuestionText(q: Question): string {
  // Only read the question text — choices are visible on screen and make audio very long
  return stripHtml(q.question);
}

export function buildAnswerRevealText(q: Question, language: string): string {
  const labels = q.answers.join(language === "ja" ? "と" : " and ");
  const prefix =
    language === "ja"
      ? `正解は${labels}です。`
      : `The answer is ${labels}.`;
  const explanation = q.explanation ? ` ${q.explanation}` : "";
  return `${prefix}${explanation}`;
}

export function buildAnswerText(q: Question, language: string): string {
  return `${buildQuestionText(q)} ${buildAnswerRevealText(q, language)}`;
}
