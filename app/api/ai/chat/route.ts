import { NextRequest, NextResponse } from "next/server";
import type { Choice } from "@/lib/types";
import { aiGenerate } from "@/lib/ai-client";

export type AiChatRequest = {
  context: {
    question: string;
    choices: Choice[];
    answers: string[];
    explanation: string;
  };
  history: Array<{ role: "user" | "model"; text: string }>;
  message: string;
};

export type AiChatResponse = {
  reply: string;
};

export async function POST(req: NextRequest) {
  const body = await req.json() as AiChatRequest;
  const { context, history, message } = body;

  const choicesText = context.choices.map((c) => `${c.label}. ${c.text}`).join("\n");
  const systemMsg = `You are a Salesforce/MuleSoft certification exam expert helping a student understand this question.

Question: ${context.question}
Choices:
${choicesText}
Correct answer(s): ${context.answers.join(", ")}
Explanation: ${context.explanation}

Answer follow-up questions concisely and accurately.`;

  const historyForAi = [
    { role: "user" as const, text: systemMsg },
    { role: "model" as const, text: "Understood. I'll help explain this question." },
    ...history.map((h) => ({ role: h.role as "user" | "model", text: h.text })),
  ];

  try {
    const { text: reply } = await aiGenerate(message, { history: historyForAi });
    return NextResponse.json({ reply } satisfies AiChatResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `AI error: ${msg}` }, { status: 502 });
  }
}
