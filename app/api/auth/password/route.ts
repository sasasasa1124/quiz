import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { isEmailAllowed, getOrCreateUser, checkUserPassword, createAuthSession } from "@/lib/auth";
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

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function POST(req: NextRequest) {
  const body = await req.json() as { email?: string; password?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  if (!isEmailAllowed(email)) {
    return NextResponse.json({ error: "Access restricted to @salesforce.com accounts" }, { status: 403 });
  }

  const db = getDB();
  if (!db) {
    return NextResponse.json({ error: "DB not available" }, { status: 500 });
  }

  // Ensure user row exists
  await getOrCreateUser(db, email);

  const { ok, emailVerified } = await checkUserPassword(db, email, password);
  if (!ok) {
    // Use a generic error to avoid user enumeration
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const ua = req.headers.get("user-agent") ?? undefined;
  const ip = req.headers.get("cf-connecting-ip") ?? undefined;
  const token = await createAuthSession(db, email, ua, ip);

  const res = NextResponse.json({
    ok: true,
    redirect: emailVerified ? "/" : "/verify",
  });

  res.cookies.set("__session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  return res;
}
