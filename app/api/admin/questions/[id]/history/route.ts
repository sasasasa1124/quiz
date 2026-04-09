import { NextRequest, NextResponse } from "next/server";
import { getQuestionHistory } from "@/lib/db";



export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const history = await getQuestionHistory(id);
  return NextResponse.json(history);
}
