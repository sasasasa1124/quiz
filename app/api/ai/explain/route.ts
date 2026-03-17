export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Choice } from "@/lib/types";
import { getSetting } from "@/lib/db";

// Node.js runtime required for @google/genai — do NOT add `export const runtime = "edge"`

const AiResponseSchema = z.object({
  explanation: z.string(),
  answers: z.array(z.string()),
  reasoning: z.string(),
});

export type AiExplainResponse = z.infer<typeof AiResponseSchema>;

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    question: string;
    choices: Choice[];
    answers: string[];
    explanation: string;
    userPrompt?: string;
  };

  const { getEnv } = await import("@/lib/env");
  const apiKey = getEnv("GEMINI_API_KEY");
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const choicesText = body.choices.map((c) => `${c.label}. ${c.text}`).join("\n");

  const lines = [
    "You are a Salesforce/MuleSoft certification exam expert.",
    body.userPrompt ? `Additional instructions: ${body.userPrompt}` : "",
    "",
    "Question:",
    body.question,
    "",
    "Choices:",
    choicesText,
    "",
    `Currently recorded answer(s): ${body.answers.join(", ")}`,
    body.explanation ? `Current explanation on record: ${body.explanation}` : "",
    "",
    "Please verify the correct answer(s) using your knowledge and web search if needed.",
    "Respond ONLY with a JSON object (no markdown, no code fences) with exactly these keys:",
    '{ "explanation": "...", "answers": ["A"], "reasoning": "..." }',
    "- explanation: concise explanation of why the correct answer(s) are correct",
    "- answers: array of correct choice labels (e.g. [\"A\"] or [\"A\", \"C\"])",
    "- reasoning: brief reasoning for why you chose those answers",
  ].filter(Boolean).join("\n");

  const ai = new GoogleGenAI({ apiKey });
  const model = (await getSetting("gemini_model")) ?? "gemini-2.5-flash-preview-04-17";

  let raw: string;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: lines,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    raw = response.text ?? "";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Gemini API error: ${msg}` }, { status: 502 });
  }

  // Strip markdown code fences if present
  const jsonText = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return NextResponse.json({ error: "AI returned invalid JSON", raw }, { status: 502 });
  }

  const result = AiResponseSchema.safeParse(parsed);
  if (!result.success) {
    return NextResponse.json(
      { error: "AI response schema mismatch", issues: result.error.issues, raw },
      { status: 502 }
    );
  }

  return NextResponse.json(result.data);
}
