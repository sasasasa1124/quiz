import { NextRequest, NextResponse } from "next/server";
import { updateExamMeta, renameCategory, deleteExam, getDB } from "@/lib/db";
import { getUserEmail } from "@/lib/user";

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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [userEmail, db] = await Promise.all([getUserEmail(), Promise.resolve(getDB())]);

  if (db) {
    const exam = await db.prepare("SELECT created_by FROM exams WHERE id = ?").bind(id).first<{ created_by: string | null }>();
    if (!exam) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (exam.created_by && exam.created_by !== userEmail) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  await deleteExam(id);
  return NextResponse.json({ ok: true });
}
