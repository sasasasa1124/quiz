export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { completeSession } from "@/lib/db";


export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json() as { correctCount: number };
  if (body.correctCount == null) {
    return NextResponse.json({ error: "correctCount required" }, { status: 400 });
  }
  await completeSession(id, body.correctCount);
  return NextResponse.json({ ok: true });
}
