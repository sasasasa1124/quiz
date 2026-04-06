export const runtime = 'edge';
import { NextResponse } from "next/server";
import { isAWS } from "@/lib/ai-client";

export async function GET() {
  if (isAWS) {
    return NextResponse.json({ models: ["us.anthropic.claude-3-7-sonnet-20250219-v1:0", "us.anthropic.claude-haiku-4-5-20251001-v1:0"] });
  }

  const { GoogleGenAI } = await import("@google/genai");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const pager = await ai.models.list();
    const models: string[] = [];
    for await (const model of pager) {
      if (model.name) {
        // name is like "models/gemini-2.0-flash" — strip the prefix
        models.push(model.name.replace(/^models\//, ""));
      }
    }
    // Show only generateContent-capable models (gemini-*)
    const filtered = models.filter((m) => m.startsWith("gemini-"));
    return NextResponse.json({ models: filtered });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Gemini API error: ${msg}` }, { status: 502 });
  }
}
