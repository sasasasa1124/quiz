export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import type { Choice } from "@/lib/types";
import { DEFAULT_REFINE_PROMPT } from "@/lib/types";
import { parseAiJson } from "@/lib/ai-json";
import { AiRefineResponseSchema } from "@/lib/ai-schemas";
import { aiGenerate } from "@/lib/ai-client";

export type { AiRefineResponse } from "@/lib/ai-schemas";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    question: string;
    choices: Choice[];
    answers?: string[];
    userPrompt?: string;
  };

  const choicesText = body.choices.map((c) => `${c.label}. ${c.text}`).join("\n");
  const answersText = (body.answers ?? []).join(", ");

  const template = body.userPrompt || DEFAULT_REFINE_PROMPT;
  const prompt = template
    .replace("{question}", body.question)
    .replace("{choices}", choicesText)
    .replace("{answers}", answersText);

  let raw = "";
  try {
    const { text } = await aiGenerate(prompt, { jsonMode: true, useSearch: true });
    raw = text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `AI error: ${msg}` }, { status: 502 });
  }

  const parsed = parseAiJson(raw);
  if (parsed === null) {
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
