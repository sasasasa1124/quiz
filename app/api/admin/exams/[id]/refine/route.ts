import { NextRequest, NextResponse, after } from "next/server";
import { getDB } from "@/lib/db";
import { createBatchJob, runRefineJob } from "@/lib/batch-job";
import { requireAdmin } from "@/lib/auth";
import { enqueueBatchJob } from "@/lib/sqs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const pg = getDB();
  if (!pg) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const { id: examId } = await params;
  let userPrompt: string | undefined, forceRefine = false;
  try {
    const body = await req.json() as { userPrompt?: string; forceRefine?: boolean };
    userPrompt = body.userPrompt;
    forceRefine = body.forceRefine ?? false;
  } catch { /* no body is fine */ }

  try {
    const jobId = await createBatchJob(pg, examId, "refine", { userPrompt, forceRefine });
    after(async () => {
      await enqueueBatchJob({ jobId, examId, jobType: "refine", params: { userPrompt, forceRefine } });
      await runRefineJob(pg, jobId, examId, { userPrompt, forceRefine });
    });
    return NextResponse.json({ jobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[refine] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
