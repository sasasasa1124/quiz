import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import {
  isEmailAllowed,
  getOrCreateUser,
  verifyOtp,
  createAuthSession,
  setUserVerified,
  validateAuthSession,
} from "@/lib/auth";
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
  const body = await req.json() as { email?: string; code?: string; purpose?: string };
  const purpose = (body.purpose === "verify" ? "verify" : "login") as "login" | "verify";
  const code = (body.code ?? "").trim();

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
  }

  const db = getDB();
  if (!db) {
    return NextResponse.json({ error: "DB not available" }, { status: 500 });
  }

  let email: string;

  if (purpose === "verify") {
    // Email comes from the current session
    const token = req.cookies.get("__session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const session = await validateAuthSession(db, token);
    if (!session) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    email = session.userEmail;

    const valid = await verifyOtp(db, email, code, "verify");
    if (!valid) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }

    await setUserVerified(db, email);
    return NextResponse.json({ ok: true });
  } else {
    // Login OTP
    email = (body.email ?? "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!isEmailAllowed(email)) {
      return NextResponse.json({ error: "Access restricted to @salesforce.com accounts" }, { status: 403 });
    }

    const valid = await verifyOtp(db, email, code, "login");
    if (!valid) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }

    const { emailVerified } = await getOrCreateUser(db, email);

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
}
