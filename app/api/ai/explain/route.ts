export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Choice } from "@/lib/types";
import { DEFAULT_EXPLAIN_PROMPT } from "@/lib/types";
import { getSetting } from "@/lib/db";
import { getRequestContext } from "@cloudflare/next-on-pages";

const SourceSchema = z.object({
  uri: z.string(),
  title: z.string(),
});

const AiResponseSchema = z.object({
  explanation: z.string(),
  answers: z.array(z.string()),
  reasoning: z.string(),
  sources: z.array(SourceSchema).optional(),
});

const ALLOWED_DOMAINS = [
  "trailhead.salesforce.com",
  "developer.salesforce.com",
  "www.salesforce.com",
  "help.salesforce.com",
];

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
  const domainHint = `\n\nWhen searching the web, prioritize official Salesforce documentation from: trailhead.salesforce.com, developer.salesforce.com, help.salesforce.com, www.salesforce.com.`;
  const prompt = template
    .replace("{question}", body.question)
    .replace("{choices}", choicesText)
    .replace("{answers}", body.answers.join(", "))
    .replace("{explanation}", explanationLine) + domainHint;

  const ai = new GoogleGenAI({ apiKey });
  const model = (await getSetting("gemini_model")) ?? "gemini-2.5-flash";

  let raw: string;
  let sources: { uri: string; title: string }[] = [];
  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    raw = response.text ?? "";

    // Extract grounding sources, filtered to allowed Salesforce domains
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    sources = chunks
      .filter((c) => {
        if (!c.web?.uri) return false;
        try {
          const host = new URL(c.web.uri).hostname;
          return ALLOWED_DOMAINS.includes(host);
        } catch { return false; }
      })
      .map((c) => ({ uri: c.web!.uri!, title: c.web!.title ?? c.web!.uri! }));
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

  return NextResponse.json({ ...result.data, sources: sources.length > 0 ? sources : undefined });
}
