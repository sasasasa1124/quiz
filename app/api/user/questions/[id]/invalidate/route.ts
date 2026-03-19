export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { toggleUserInvalidated } from "@/lib/db";
import { getUserEmail } from "@/lib/user";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userEmail = await getUserEmail();
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const invalidated = await toggleUserInvalidated(id, userEmail);
  return NextResponse.json({ invalidated });
}
