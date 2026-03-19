import { currentUser } from "@clerk/nextjs/server";

/**
 * Returns the authenticated user's email.
 * Falls back to "local@dev" in local development without Clerk configured.
 */
export async function getUserEmail(): Promise<string> {
  try {
    const user = await currentUser();
    return user?.emailAddresses[0]?.emailAddress ?? "local@dev";
  } catch {
    return "local@dev";
  }
}
