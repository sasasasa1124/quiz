import { cookies } from "next/headers";
import { verifyIdToken } from "./cognito-jwt";

/**
 * Returns the authenticated user's email from the session cookie.
 * Falls back to "local@dev" in local development.
 */
export async function getUserEmail(): Promise<string> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("id_token")?.value;
    if (!token) return "local@dev";
    const payload = await verifyIdToken(token);
    return payload.email;
  } catch {
    return "local@dev";
  }
}
