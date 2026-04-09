import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { createBatchJob, runFillJob } from "@/lib/batch-job";
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
  let userPrompt: string | undefined, forceRefill = false, refillShort = false;
  try {
    const body = await req.json() as { userPrompt?: string; forceRefill?: boolean; refillShort?: boolean };
    userPrompt = body.userPrompt;
    forceRefill = body.forceRefill ?? false;
    refillShort = body.refillShort ?? false;
  } catch { /* no body is fine */ }

  try {
    const jobId = await createBatchJob(pg, examId, "fill", { userPrompt, forceRefill, refillShort });
    // Fire-and-forget: unawaited async keeps event loop alive in Node.js (App Runner)
    enqueueBatchJob({ jobId, examId, jobType: "fill", params: { userPrompt, forceRefill, refillShort } })
      .catch(e => console.error("[fill] sqs enqueue failed:", e instanceof Error ? e.message : String(e)));
    runFillJob(pg, jobId, examId, { userPrompt, forceRefill, refillShort })
      .catch(e => console.error("[fill] background job failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ jobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[fill] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
