export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Choice } from "@/lib/types";
import { DEFAULT_FACTCHECK_PROMPT } from "@/lib/types";
import { getSetting } from "@/lib/db";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { parseAiJson } from "@/lib/ai-json";

const AiFactCheckResponseSchema = z.object({
  isCorrect: z.boolean(),
  correctAnswers: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
  issues: z.array(z.string()),
  explanation: z.string(),
  sources: z.array(z.string()),
});

export type AiFactCheckResponse = z.infer<typeof AiFactCheckResponseSchema>;

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    question: string;
    choices: Choice[];
    answers: string[];
    userPrompt?: string;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiKey = (getRequestContext() as any).env?.GEMINI_API_KEY as string | undefined;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const choicesText = body.choices.map((c) => `${c.label}. ${c.text}`).join("\n");
  const answersText = (body.answers ?? []).join(", ");

  const template = body.userPrompt || DEFAULT_FACTCHECK_PROMPT;
  const prompt = template
    .replace("{question}", body.question)
    .replace("{choices}", choicesText)
    .replace("{answers}", answersText);

  const ai = new GoogleGenAI({ apiKey });
  const model = (await getSetting("gemini_model")) ?? "gemini-2.5-flash-preview";

  let raw = "";
  let parsed: unknown = null;

  // Try with googleSearch grounding first, then retry without if JSON parsing fails
  for (const useGrounding of [true, false]) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          ...(useGrounding ? { tools: [{ googleSearch: {} }] } : {}),
          responseMimeType: "application/json",
        },
      });
      raw = response.text ?? "";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!useGrounding) {
        return NextResponse.json({ error: `Gemini API error: ${msg}` }, { status: 502 });
      }
      continue;
    }

    parsed = parseAiJson(raw);
    if (parsed !== null) break;
  }

  if (parsed === null) {
    return NextResponse.json({ error: "AI returned invalid JSON", raw: raw }, { status: 502 });
  }

  const result = AiFactCheckResponseSchema.safeParse(parsed);
  if (!result.success) {
    return NextResponse.json(
      { error: "AI response schema mismatch", issues: result.error.issues, raw },
      { status: 502 }
    );
  }

  return NextResponse.json(result.data);
}
