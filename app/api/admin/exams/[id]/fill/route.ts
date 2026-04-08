import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { createBatchJob, runFillJob } from "@/lib/batch-job";
import { requireAdmin } from "@/lib/auth";
import { isAWS } from "@/lib/ai-client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const pg = getDB();
  if (!pg) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const { id: examId } = await params;
  let userPrompt: string | undefined, forceRefill = false;
  try {
    const body = await req.json() as { userPrompt?: string; forceRefill?: boolean };
    userPrompt = body.userPrompt;
    forceRefill = body.forceRefill ?? false;
  } catch { /* no body is fine */ }

  const jobId = await createBatchJob(pg, examId, "fill", { userPrompt, forceRefill });
  const task = runFillJob(pg, jobId, examId, { userPrompt, forceRefill });

  if (isAWS) {
    void task;
  } else {
    try {
      const { getRequestContext } = await import("@cloudflare/next-on-pages");
      const ctx = getRequestContext() as { waitUntil?: (p: Promise<void>) => void };
      ctx.waitUntil?.(task);
    } catch {
      void task;
    }
  }

  return NextResponse.json({ jobId });
}
