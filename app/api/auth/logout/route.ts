import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { deleteAuthSession } from "@/lib/auth";
import type { D1Database } from "@/lib/db";

export const runtime = "edge";

function getDB(): D1Database | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getRequestContext() as any).env.DB as D1Database ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get("__session")?.value;

  if (token) {
    const db = getDB();
    if (db) {
      await deleteAuthSession(db, token);
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete("__session");
  return res;
}
