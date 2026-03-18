export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Choice } from "@/lib/types";
import { DEFAULT_EXPLAIN_PROMPT } from "@/lib/types";
import { getSetting } from "@/lib/db";
import { getRequestContext } from "@cloudflare/next-on-pages";

async function validateUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; QuizBot/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;

    const isSalesforce =
      url.includes("help.salesforce.com") ||
      url.includes("trailhead.salesforce.com") ||
      url.includes("developer.salesforce.com");

    if (isSalesforce) {
      const text = await res.text();
      if (
        text.includes("We looked high and low") ||
        text.includes("couldn't find that page") ||
        text.includes("Page Not Found")
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

const AiResponseSchema = z.object({
  explanation: z.string(),
  answers: z.array(z.string()),
  reasoning: z.string(),
  sources: z.array(z.string()).optional(),
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiKey = (getRequestContext() as any).env?.GEMINI_API_KEY as string | undefined;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const choicesText = body.choices.map((c) => `${c.label}. ${c.text}`).join("\n");
  const explanationLine = body.explanation ? `Current explanation on record: ${body.explanation}` : "";

  const template = body.userPrompt || DEFAULT_EXPLAIN_PROMPT;
  const prompt = template
    .replace("{question}", body.question)
    .replace("{choices}", choicesText)
    .replace("{answers}", body.answers.join(", "))
    .replace("{explanation}", explanationLine);

  const ai = new GoogleGenAI({ apiKey });
  const model = (await getSetting("gemini_model")) ?? "gemini-2.5-flash";

  let raw: string;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
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

  const rawSources = result.data.sources ?? [];
  const validated = await Promise.all(rawSources.map(validateUrl));
  const sources = rawSources.filter((_, i) => validated[i]);

  return NextResponse.json({ ...result.data, sources });
}
