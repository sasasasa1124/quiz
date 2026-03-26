export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getStudyGuide, upsertStudyGuide, getSetting } from "@/lib/db";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { DEFAULT_STUDY_GUIDE_PROMPT } from "@/lib/types";

interface QuestionSummary {
  question: string;
  answers: string[];
  category: string | null;
}

interface UserStats {
  totalAttempted: number;
  totalCorrect: number;
  accuracy: number;
  perCategory: Record<string, { attempted: number; correct: number; accuracy: number }>;
  wrongQuestions: {
    question: string;
    answers: string[];
    correctAnswers: string[];
    category: string | null;
  }[];
}

const langInstruction: Record<string, string> = {
  ja: "Write the entire output in Japanese.",
  en: "Write the entire output in English.",
  zh: "Write the entire output in Chinese (Simplified).",
  ko: "Write the entire output in Korean.",
};

export async function GET(req: NextRequest) {
  const examId = req.nextUrl.searchParams.get("examId");
  if (!examId) {
    return NextResponse.json({ error: "examId required" }, { status: 400 });
  }
  const result = await getStudyGuide(examId);
  if (!result) {
    return NextResponse.json({ markdown: null, generatedAt: null });
  }
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    examId: string | null;
    examName: string;
    language?: string;
    questions: QuestionSummary[];
    userStats?: UserStats;
    userPrompt?: string;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiKey = (getRequestContext() as any).env?.GEMINI_API_KEY as
    | string
    | undefined;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 }
    );
  }

  const { examId, examName, questions, userStats, userPrompt } = body;
  const lang = body.language ?? "en";

  // Personalized guides (with userStats) are never cached
  const saveToDb = examId !== null && examId !== undefined && examId !== "" && !userStats;

  // Group questions by category
  const byCategory = new Map<string, QuestionSummary[]>();
  for (const q of questions) {
    const cat = q.category ?? "General";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(q);
  }

  // Build per-category Q&A data (2–3 sample questions per category)
  const categoryLines: string[] = [];
  for (const [cat, qs] of byCategory) {
    categoryLines.push(`\n### Category: ${cat} (${qs.length} questions total)`);
    const samples = qs.slice(0, 3);
    for (const q of samples) {
      const stripped = q.question.replace(/<[^>]+>/g, "").trim();
      categoryLines.push(`- Q: ${stripped}`);
      categoryLines.push(`  Answers/Choices: ${q.answers.join(" | ")}`);
    }
  }

  // Build user stats section if provided
  let userStatsSection = "";
  if (userStats) {
    const categoryRows = Object.entries(userStats.perCategory)
      .sort((a, b) => a[1].accuracy - b[1].accuracy)
      .map(([cat, s]) => `  - ${cat}: ${s.correct}/${s.attempted} (${s.accuracy}%)`)
      .join("\n");

    const wrongLines = userStats.wrongQuestions.slice(0, 10).map((wq) => {
      const stripped = wq.question.replace(/<[^>]+>/g, "").trim();
      return `  - Q: ${stripped}\n    Correct: ${wq.correctAnswers.join(", ")} | Choices: ${wq.answers.join(" | ")}`;
    }).join("\n");

    userStatsSection = `

## User Performance Data (include a personalized analysis section based on this)
- Total answered: ${userStats.totalAttempted} questions
- Correct: ${userStats.totalCorrect} (${userStats.accuracy}%)
- Per-category accuracy (sorted ascending — weakest first):
${categoryRows}
- Wrong questions sample (up to 10):
${wrongLines}`;
  }

  const personalizedSection = userStats ? `## Your Learning Trends & Wrong Answer Patterns
- Overall accuracy: ${userStats.totalCorrect}/${userStats.totalAttempted} (${userStats.accuracy}%)
- Per-category breakdown (weakest first)
- Analysis of wrong answer patterns: which categories/question types need focus
- Key wrong questions with explanation of the correct answer
` : "";

  const template = userPrompt || DEFAULT_STUDY_GUIDE_PROMPT;
  const prompt = template
    .replace(/{examName}/g, examName)
    .replace("{questions}", categoryLines.join("\n") + (userStatsSection ? "\n" + userStatsSection : ""))
    .replace("{userStats}", personalizedSection)
    .replace("{langInstruction}", langInstruction[lang] ?? langInstruction["en"]);

  const ai = new GoogleGenAI({ apiKey });
  const model = (await getSetting("gemini_model")) ?? "gemini-3-flash-preview";

  let markdown: string;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    markdown = response.text ?? "";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Gemini API error: ${msg}` },
      { status: 502 }
    );
  }

  if (saveToDb) {
    try {
      await upsertStudyGuide(examId, markdown);
    } catch (e) {
      console.error("Failed to save study guide to DB:", e);
    }
  }

  return NextResponse.json({ markdown });
}
