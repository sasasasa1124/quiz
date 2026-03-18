import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { isEmailAllowed, getOrCreateUser, createOtp, validateAuthSession } from "@/lib/auth";
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

async function sendOtpEmail(
  to: string,
  code: string,
  resendApiKey: string
): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Your sign-in code",
      text: `Your sign-in code is: ${code}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
    }),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { email?: string; purpose?: string };
  const purpose = (body.purpose === "verify" ? "verify" : "login") as "login" | "verify";

  let email: string;

  if (purpose === "verify") {
    // For verification, email comes from the current session
    const db = getDB();
    if (!db) return NextResponse.json({ error: "DB not available" }, { status: 500 });
    const token = req.cookies.get("__session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const session = await validateAuthSession(db, token);
    if (!session) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    email = session.userEmail;
  } else {
    // For login, email comes from the request body
    email = (body.email ?? "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!isEmailAllowed(email)) {
      return NextResponse.json({ error: "Access restricted to @salesforce.com accounts" }, { status: 403 });
    }
  }

  const db = getDB();
  if (!db) {
    // Local dev: skip email, just log the code
    return NextResponse.json({ ok: true, dev: true });
  }

  await getOrCreateUser(db, email);

  const result = await createOtp(db, email, purpose);
  if ("rateLimited" in result) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      await sendOtpEmail(email, result.code, resendApiKey);
    } catch {
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }
  } else {
    // Dev: RESEND_API_KEY not set — log code to console
    console.info(`[DEV] OTP for ${email} (${purpose}): ${result.code}`);
  }

  return NextResponse.json({ ok: true });
}
