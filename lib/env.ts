import { getRequestContext } from "@cloudflare/next-on-pages";

/**
 * Get an environment variable that works in both local dev and Cloudflare edge.
 * - Local (DEPLOY_TARGET=local): reads from process.env
 * - Cloudflare: reads from Workers env bindings via getRequestContext
 */
export function getEnv(key: string): string | undefined {
  if (process.env.DEPLOY_TARGET === "local") {
    return process.env[key];
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getRequestContext() as any).env[key] as string | undefined;
  } catch {
    return process.env[key];
  }
}
