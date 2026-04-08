export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getBatchJob, getActiveJob, type JobType } from "@/lib/batch-job";
import { requireAdmin } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireAdmin();
    if (authError) return authError;

    const pg = getDB();
    if (!pg) return NextResponse.json({ error: "DB not available" }, { status: 503 });

    const { id: examId } = await params;
    const { searchParams } = req.nextUrl;
    const jobId = searchParams.get("jobId");
    const latest = searchParams.get("latest") as JobType | null;

    if (jobId) {
      try {
        const job = await getBatchJob(pg, jobId);
        return NextResponse.json(job ?? { error: "Job not found" }, { status: job ? 200 : 404 });
      } catch {
        return NextResponse.json(null);
      }
    }

    if (latest) {
      try {
        const job = await getActiveJob(pg, examId, latest);
        return NextResponse.json(job ?? null);
      } catch {
        return NextResponse.json(null);
      }
    }

    return NextResponse.json({ error: "jobId or latest required" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[batch-status] unhandled error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
