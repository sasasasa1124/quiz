export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { deleteSuggestion } from "@/lib/db";


export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteSuggestion(Number(id));
  return NextResponse.json({ ok: true });
}
