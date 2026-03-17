import { NextRequest, NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/auth";

export function middleware(request: NextRequest) {
  // Avoid redirect loop on the unauthorized page itself
  if (request.nextUrl.pathname.startsWith("/unauthorized")) {
    return NextResponse.next();
  }

  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!isEmailAllowed(email)) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
