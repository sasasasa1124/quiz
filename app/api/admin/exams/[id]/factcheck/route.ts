export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { createBatchJob, runFactCheckJob } from "@/lib/batch-job";
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
  let userPrompt: string | undefined, forceRecheck = false;
  try {
    const body = await req.json() as { userPrompt?: string; forceRecheck?: boolean };
    userPrompt = body.userPrompt;
    forceRecheck = body.forceRecheck ?? false;
  } catch { /* no body is fine */ }

  try {
    const jobId = await createBatchJob(pg, examId, "factcheck", { userPrompt, forceRecheck });
    const task = runFactCheckJob(pg, jobId, examId, { userPrompt, forceRecheck });

    if (isAWS) {
      void task;
    } else {
      try {
        const { getRequestContext } = await import("@cloudflare/next-on-pages");
        const { ctx } = getRequestContext() as unknown as { ctx: { waitUntil: (p: Promise<void>) => void } };
        ctx.waitUntil(task);
      } catch {
        void task;
      }
    }

    return NextResponse.json({ jobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[factcheck] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
