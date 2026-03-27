export const runtime = 'edge';
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function GET() {
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
