
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { Choice } from "@/lib/types";
import { DEFAULT_REFINE_PROMPT } from "@/lib/types";
import { getSetting } from "@/lib/db";
import { parseAiJson } from "@/lib/ai-json";
import { AiRefineResponseSchema } from "@/lib/ai-schemas";

export type { AiRefineResponse } from "@/lib/ai-schemas";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    question: string;
    choices: Choice[];
    answers?: string[];
    userPrompt?: string;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const choicesText = body.choices.map((c) => `${c.label}. ${c.text}`).join("\n");
  const answersText = (body.answers ?? []).join(", ");

  const template = body.userPrompt || DEFAULT_REFINE_PROMPT;
  const prompt = template
    .replace("{question}", body.question)
    .replace("{choices}", choicesText)
    .replace("{answers}", answersText);

  const ai = new GoogleGenAI({ apiKey });
  const model = (await getSetting("gemini_model")) ?? "gemini-3-flash-preview";

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

  const result = AiRefineResponseSchema.safeParse(parsed);
  if (!result.success) {
    return NextResponse.json(
      { error: "AI response schema mismatch", issues: result.error.issues, raw },
      { status: 502 }
    );
  }

  return NextResponse.json(result.data);
}
