import { cookies } from "next/headers";
import { verifyIdToken } from "./cognito-jwt";

/**
 * Checks if the current request is from an admin user.
 * Returns null if authorized, or a 401/403 Response if not.
 */
export async function requireAdmin(): Promise<Response | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("id_token")?.value;
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload = await verifyIdToken(token);
    const email = payload.email;

    const adminEmailsRaw = process.env.ADMIN_EMAILS;
    if (!adminEmailsRaw) return null; // Not configured — allow all authenticated users

    const adminEmails = adminEmailsRaw.split(",").map((s) => s.trim().toLowerCase());
    if (!adminEmails.includes(email.toLowerCase())) {
      return new Response(JSON.stringify({ error: "Forbidden: admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    return null;
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
}
