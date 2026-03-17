/**
 * Get an environment variable that works in both local dev and Cloudflare edge.
 * - Local (DEPLOY_TARGET=local): reads from process.env
 * - Cloudflare: reads from Workers env bindings via getOptionalRequestContext
 */
export async function getEnv(key: string): Promise<string | undefined> {
  if (process.env.DEPLOY_TARGET === "local") {
    return process.env[key];
  }
  const { getOptionalRequestContext } = await import("@cloudflare/next-on-pages");
  const cfEnv = getOptionalRequestContext()?.env as Record<string, string> | undefined;
  return cfEnv?.[key];
}
