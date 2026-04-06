import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/sign-up", "/unauthorized", "/api/auth"];

/**
 * Decode JWT payload without signature verification (Edge-safe).
 * Full verification is done in API routes (Node.js runtime via lib/cognito-jwt.ts).
 */
function decodeTokenEmail(token: string): string | null {
  try {
    const [, payload] = token.split(".");
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (decoded.exp && decoded.exp < Date.now() / 1000) return null;
    return (decoded.email as string) ?? null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get("id_token")?.value;
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const email = decodeTokenEmail(token);
  if (!email) {
    const response = NextResponse.redirect(new URL("/login", req.url));
    response.cookies.delete("id_token");
    response.cookies.delete("user_email");
    return response;
  }

  if (!email.endsWith("@salesforce.com")) {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
