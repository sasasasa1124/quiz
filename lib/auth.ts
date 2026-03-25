import { currentUser } from "@clerk/nextjs/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

/**
 * Checks if the current request is from an admin user.
 * Returns null if authorized, or a 401/403 Response if not.
 *
 * Admin emails are configured via the ADMIN_EMAILS Cloudflare env var
 * (comma-separated list, e.g. "alice@salesforce.com,bob@salesforce.com").
 * If ADMIN_EMAILS is not set, all authenticated users are allowed
 * (preserves existing behavior for deployments that haven't configured it yet).
 */
export async function requireAdmin(): Promise<Response | null> {
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? "";
  if (!email) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = getRequestContext() as any;
    const adminEmailsRaw = ctx.env?.ADMIN_EMAILS as string | undefined;
    if (!adminEmailsRaw) return null; // Not configured — allow all authenticated users

    const adminEmails = adminEmailsRaw.split(",").map((s: string) => s.trim().toLowerCase());
    if (!adminEmails.includes(email.toLowerCase())) {
      return new Response(JSON.stringify({ error: "Forbidden: admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch {
    // getRequestContext unavailable (local dev) — allow all authenticated users
    return null;
  }

  return null;
}
