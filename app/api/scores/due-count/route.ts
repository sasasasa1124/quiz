export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { getDueCount } from "@/lib/db";
import { getUserEmail } from "@/lib/user";


export async function GET(req: NextRequest) {
  const examId = req.nextUrl.searchParams.get("examId");
  if (!examId) return NextResponse.json({ error: "examId required" }, { status: 400 });
  const userEmail = await getUserEmail();
  const count = await getDueCount(userEmail, examId);
  return NextResponse.json({ count });
}
