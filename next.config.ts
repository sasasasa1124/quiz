import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // All routes run on Cloudflare edge (Workers) runtime
  // Individual pages still need `export const runtime = "edge"` for next-on-pages
  // Tell Turbopack the workspace root includes the parent directory (for CSV files)
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  // csv-parse and fs are Node.js-only; keep them out of edge/Worker bundles
  serverExternalPackages: ["csv-parse", "csv-parse/sync"],
  webpack(config) {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    return config;
  },
};

export default nextConfig;
