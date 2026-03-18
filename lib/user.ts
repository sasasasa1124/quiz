import { headers } from "next/headers";

/**
 * Returns the authenticated user's email.
 * Priority:
 *   1. x-user-email  — injected by middleware after session validation
 *   2. Cf-Access-Authenticated-User-Email — Cloudflare Access (legacy / local CF tunnel)
 *   3. "local@dev"   — local development fallback
 */
export async function getUserEmail(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-user-email") ??
    h.get("Cf-Access-Authenticated-User-Email") ??
    "local@dev"
  );
}
