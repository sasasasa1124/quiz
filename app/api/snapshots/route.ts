export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { getSnapshots, saveSnapshot } from "@/lib/db";
import { getUserEmail } from "@/lib/user";


export async function GET(req: NextRequest) {
  const examId = req.nextUrl.searchParams.get("examId") ?? undefined;
  const userEmail = await getUserEmail();
  const snapshots = await getSnapshots(userEmail, examId);
  return NextResponse.json({ snapshots });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    examId: string;
    ts: number;
    correct: number;
    total: number;
    accuracy: number;
  };
  if (!body.examId || body.ts == null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const userEmail = await getUserEmail();
  await saveSnapshot(userEmail, body.examId, body.ts, body.correct, body.total, body.accuracy);
  return NextResponse.json({ ok: true });
}
