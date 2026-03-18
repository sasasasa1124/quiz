import type { Question } from "./types";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** 問題文 + 選択肢 の2チャンク */
export function buildQuestionText(q: Question): string[] {
  const questionText = stripHtml(q.question);
  const choicesText = q.choices.map((c) => `${c.label}. ${c.text}`).join(". ");
  return [questionText, choicesText];
}

/** 正解 + 解説 の1チャンク */
export function buildAnswerRevealText(q: Question, language: string): string[] {
  const labels = q.answers.join(language === "ja" ? "と" : " and ");
  const prefix =
    language === "ja"
      ? `正解は${labels}です。`
      : `The answer is ${labels}.`;
  const explanation = q.explanation ? ` ${q.explanation}` : "";
  return [`${prefix}${explanation}`];
}

/** 問題文 + 選択肢 + 解答解説 の3チャンク */
export function buildAnswerText(q: Question, language: string): string[] {
  return [...buildQuestionText(q), ...buildAnswerRevealText(q, language)];
}
