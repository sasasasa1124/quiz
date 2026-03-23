import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const ALLOWED_DOMAINS = ["salesforce.com"];

const isPublicRoute = createRouteMatcher(["/login", "/sign-in", "/unauthorized"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId, sessionClaims } = await auth.protect();

  if (userId) {
    const email = (sessionClaims?.email ?? "") as string;
    const allowed = ALLOWED_DOMAINS.some((d) => email.endsWith(`@${d}`));
    if (!allowed) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
  }
});

export const config = {
  matcher: [
    // Match all paths except Next.js static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
