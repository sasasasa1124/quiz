export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Choice } from "@/lib/types";
import { getSetting } from "@/lib/db";

// Node.js runtime required for @google/genai

const ChoiceSchema = z.object({
  label: z.string(),
  text: z.string(),
});

const AiRefineResponseSchema = z.object({
  question: z.string(),
  choices: z.array(ChoiceSchema),
  changesSummary: z.string(),
});

export type AiRefineResponse = z.infer<typeof AiRefineResponseSchema>;

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    question: string;
    choices: Choice[];
    userPrompt?: string;
  };

  const { getEnv } = await import("@/lib/env");
  const apiKey = getEnv("GEMINI_API_KEY");
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const choicesText = body.choices.map((c) => `${c.label}. ${c.text}`).join("\n");

  const lines = [
    "You are an expert editor for Salesforce/MuleSoft certification exam questions.",
    "Your task is to fix ONLY typos, grammatical errors, spelling mistakes, and awkward phrasing in the question text and answer choices.",
    "Do NOT change the meaning, technical content, correct answers, or add/remove choices.",
    "Do NOT rewrite or rephrase if there is no error — preserve the original wording as much as possible.",
    body.userPrompt ? `Additional instructions: ${body.userPrompt}` : "",
    "",
    "Question:",
    body.question,
    "",
    "Choices:",
    choicesText,
    "",
    "Respond ONLY with a JSON object (no markdown, no code fences) with exactly these keys:",
    '{ "question": "...", "choices": [{"label": "A", "text": "..."}], "changesSummary": "..." }',
    "- question: the corrected question text (identical to input if no errors found)",
    "- choices: array of corrected choices in the same order (identical to input if no errors found)",
    "- changesSummary: a brief human-readable summary of what was changed, or empty string if nothing changed",
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

  const result = AiRefineResponseSchema.safeParse(parsed);
  if (!result.success) {
    return NextResponse.json(
      { error: "AI response schema mismatch", issues: result.error.issues, raw },
      { status: 502 }
    );
  }

  return NextResponse.json(result.data);
}
