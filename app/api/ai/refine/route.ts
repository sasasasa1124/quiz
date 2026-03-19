export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Choice } from "@/lib/types";
import { DEFAULT_REFINE_PROMPT } from "@/lib/types";
import { getSetting } from "@/lib/db";
import { getRequestContext } from "@cloudflare/next-on-pages";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiKey = (getRequestContext() as any).env?.GEMINI_API_KEY as string | undefined;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const choicesText = body.choices.map((c) => `${c.label}. ${c.text}`).join("\n");

  const template = body.userPrompt || DEFAULT_REFINE_PROMPT;
  const prompt = template
    .replace("{question}", body.question)
    .replace("{choices}", choicesText);

  const ai = new GoogleGenAI({ apiKey });
  const model = (await getSetting("gemini_model")) ?? "gemini-2.5-flash";

  let raw: string;
  try {
    // Step 1: Google Search grounding with free-form output.
    // Separating grounding from JSON output avoids the incompatibility where
    // JSON-requesting prompts cause the model to skip search or return
    // citation-annotated text that breaks JSON.parse.
    const groundingPrompt = `You are an expert editor for Salesforce/MuleSoft certification exam questions.
Research the correct Salesforce/MuleSoft terminology and phrasing for the following exam question.
Identify any typos, grammatical errors, or awkward phrasing that should be fixed.

Question:
${body.question}

Choices:
${choicesText}

Provide your analysis of what should be corrected (if anything), referencing official terminology where relevant.`;

    const groundingResponse = await ai.models.generateContent({
      model,
      contents: groundingPrompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    const groundedText = groundingResponse.text ?? "";

    // Step 2: Format as JSON using grounded analysis as additional context.
    const formatPrompt = `${prompt}

Additional research context (from Google Search):
${groundedText}

Using the above context, provide your answer in the JSON format specified above.`;

    const formatResponse = await ai.models.generateContent({
      model,
      contents: formatPrompt,
      config: {
        responseMimeType: "application/json",
      },
    });
    raw = formatResponse.text ?? "";
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
