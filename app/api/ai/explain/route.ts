export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Choice } from "@/lib/types";
import { DEFAULT_EXPLAIN_PROMPT } from "@/lib/types";
import { parseAiJson } from "@/lib/ai-json";
import { aiGenerate } from "@/lib/ai-client";


const AiResponseSchema = z.object({
  highlights: z.array(z.string()).optional(),
  explanation: z.string(),
  answers: z.array(z.string()),
  reasoning: z.string(),
  model: z.string().optional(),
  // sources is populated from grounding metadata, not from AI JSON output
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

  const choicesText = body.choices.map((c) => `${c.label}. ${c.text}`).join("\n");
  const explanationLine = body.explanation ? `Current explanation on record: ${body.explanation}` : "";

  const template = body.userPrompt || DEFAULT_EXPLAIN_PROMPT;
  const prompt = template
    .replace("{question}", body.question)
    .replace("{choices}", choicesText)
    .replace("{answers}", body.answers.join(", "))
    .replace("{explanation}", explanationLine);

  let raw = "";
  let groundingSources: string[] = [];
  let parsed: unknown = null;

  try {
    const result = await aiGenerate(prompt, { jsonMode: true, useSearch: true });
    raw = result.text;
    groundingSources = result.sources;
    parsed = parseAiJson(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `AI error: ${msg}` }, { status: 502 });
  }

  if (parsed === null) {
    return NextResponse.json({ error: "AI returned invalid JSON", raw }, { status: 502 });
  }

  const result = AiResponseSchema.safeParse(parsed);
  if (!result.success) {
    return NextResponse.json(
      { error: "AI response schema mismatch", issues: result.error.issues, raw },
      { status: 502 }
    );
  }

  return NextResponse.json({ ...result.data, sources: groundingSources });
}
