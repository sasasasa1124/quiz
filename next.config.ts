import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // All routes run on Cloudflare edge (Workers) runtime.
  // Individual pages still need `export const runtime = "edge"` for next-on-pages.
  // Tell Turbopack the workspace root includes the parent directory (for CSV files).
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  // csv-parse is Node.js-only; keep it out of edge bundles.
  serverExternalPackages: ["csv-parse", "csv-parse/sync"],
  webpack(config) {
    // For edge (Cloudflare Workers) bundles, provide empty fallbacks for Node.js
    // built-ins used by the `postgres` package.  The postgres code paths are
    // guarded by `DATABASE_URL` checks and are never executed on Cloudflare, so
    // replacing these modules with empty stubs is safe.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      net: false,
      tls: false,
      dns: false,
      fs: false,
      os: false,
      path: false,
      crypto: false,
      stream: false,
      perf_hooks: false,
    };
    return config;
  },
};

export default nextConfig;
