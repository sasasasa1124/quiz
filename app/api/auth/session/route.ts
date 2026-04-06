import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/cognito-jwt";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { idToken: string };
    const { idToken } = body;
    const payload = await verifyIdToken(idToken);

    if (!payload.email.endsWith("@salesforce.com")) {
      return NextResponse.json({ error: "Unauthorized domain" }, { status: 403 });
    }

    const cookieStore = await cookies();
    const secure = process.env.NODE_ENV === "production";

    cookieStore.set("id_token", idToken, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });
    // Non-httpOnly cookie for client-side display only
    cookieStore.set("user_email", payload.email, {
      httpOnly: false,
      secure,
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    return NextResponse.json({ ok: true, email: payload.email });
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("id_token");
  cookieStore.delete("user_email");
  return NextResponse.json({ ok: true });
}
