export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { Choice } from "@/lib/types";
import { getSetting } from "@/lib/db";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const choicesText = context.choices.map((c) => `${c.label}. ${c.text}`).join("\n");
  const systemMsg = `You are a Salesforce/MuleSoft certification exam expert helping a student understand this question.

Question: ${context.question}
Choices:
${choicesText}
Correct answer(s): ${context.answers.join(", ")}
Explanation: ${context.explanation}

Answer follow-up questions concisely and accurately.`;

  const contents = [
    { role: "user" as const, parts: [{ text: systemMsg }] },
    { role: "model" as const, parts: [{ text: "Understood. I'll help explain this question." }] },
    ...history.map((h) => ({ role: h.role as "user" | "model", parts: [{ text: h.text }] })),
    { role: "user" as const, parts: [{ text: message }] },
  ];

  const ai = new GoogleGenAI({ apiKey });
  const model = (await getSetting("gemini_model")) ?? "gemini-3-flash-preview";

  try {
    const response = await ai.models.generateContent({ model, contents });
    return NextResponse.json({ reply: response.text ?? "" } satisfies AiChatResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Gemini API error: ${msg}` }, { status: 502 });
  }
}
