import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { isEmailAllowed, validateAuthSession } from "@/lib/auth";
import type { D1Database } from "@/lib/db";

// Paths that are always public (no auth required)
const PUBLIC_PREFIXES = [
  "/login",
  "/verify",
  "/unauthorized",
  "/api/auth/",
  "/_next/",
  "/favicon.ico",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function getDB(): D1Database | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getRequestContext() as any).env.DB as D1Database ?? null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // ── Local dev: no D1 available, skip auth ─────────────────────────────
  const db = getDB();
  if (!db) {
    // Still check CF Access header for domain restriction when present
    const cfEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
    if (cfEmail !== null && !isEmailAllowed(cfEmail)) {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }
    return NextResponse.next();
  }

  // ── Session cookie auth ───────────────────────────────────────────────
  const token = request.cookies.get("__session")?.value;
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const session = await validateAuthSession(db, token);
  if (!session) {
    // Stale/expired token — clear cookie and redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete("__session");
    return res;
  }

  // ── First-time email verification gate ───────────────────────────────
  if (!session.emailVerified && pathname !== "/verify") {
    return NextResponse.redirect(new URL("/verify", request.url));
  }

  // ── Inject user email for downstream Server Components / API routes ──
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-email", session.userEmail);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    // Match all paths except Next.js static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
