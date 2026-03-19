export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";

const DEFAULTS: Record<string, string> = {
  gemini_model: "gemini-3-flash-preview",
};

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const value = (await getSetting(key)) ?? DEFAULTS[key] ?? null;
  return NextResponse.json({ value });
}

export async function POST(req: NextRequest) {
  const { key, value } = await req.json() as { key: string; value: string };
  if (!key || value === undefined) {
    return NextResponse.json({ error: "key and value required" }, { status: 400 });
  }
  await setSetting(key, value);
  return NextResponse.json({ ok: true });
}
