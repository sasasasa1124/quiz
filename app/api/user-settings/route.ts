import { NextRequest, NextResponse } from "next/server";
import { getDB, getAllUserSettings, setUserSettings } from "@/lib/db";
import { getUserEmail } from "@/lib/user";
import type { UserSettings } from "@/lib/types";

export const runtime = "edge";

export async function GET() {
  // No DB available (local dev without wrangler) — let client fall back to localStorage
  if (!getDB()) return NextResponse.json({}, { status: 503 });
  const userEmail = await getUserEmail();
  const settings = await getAllUserSettings(userEmail);
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as Partial<UserSettings>;
  const userEmail = await getUserEmail();
  await setUserSettings(userEmail, body);
  return NextResponse.json({ ok: true });
}
