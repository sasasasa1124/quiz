import { NextRequest, NextResponse } from "next/server";
import { updateExamMeta, renameCategory } from "@/lib/db";

export const runtime = "edge";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json() as {
    name?: string;
    language?: string;
    tags?: string[];
    renameCategory?: { from: string; to: string };
  };

  // Category rename
  if (body.renameCategory?.from && body.renameCategory?.to) {
    await renameCategory(id, body.renameCategory.from, body.renameCategory.to);
    return NextResponse.json({ ok: true });
  }

  const fields: { name?: string; language?: "ja" | "en" | "zh" | "ko"; tags?: string[] } = {};
  if (typeof body.name === "string" && body.name.trim()) {
    fields.name = body.name.trim();
  }
  if (body.language === "ja" || body.language === "en" || body.language === "zh" || body.language === "ko") {
    fields.language = body.language;
  }
  if (Array.isArray(body.tags)) {
    fields.tags = body.tags.map((t) => String(t).trim()).filter(Boolean);
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }

  await updateExamMeta(id, fields);
  return NextResponse.json({ ok: true });
}
