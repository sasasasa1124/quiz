#!/usr/bin/env node
/**
 * Applies PostgreSQL migrations to RDS on container startup.
 * Only runs when DATABASE_URL is set (AWS/Node.js environment).
 * Runs all *.sql files in migrations/drizzle/ in alphabetical order.
 * Uses ON CONFLICT DO NOTHING / IF NOT EXISTS so it is idempotent.
 */

const postgres = require("postgres");
const fs = require("fs");
const path = require("path");

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[migrate] DATABASE_URL not set — skipping");
    return;
  }

  // Collect SQL files from both drizzle/ (init schema) and root migrations/ (incremental)
  const drizzleDir = path.join(__dirname, "../migrations/drizzle");
  const rootDir = path.join(__dirname, "../migrations");

  const drizzleFiles = fs.existsSync(drizzleDir)
    ? fs.readdirSync(drizzleDir).filter((f) => f.endsWith(".sql")).map((f) => path.join(drizzleDir, f))
    : [];
  const rootFiles = fs.readdirSync(rootDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => path.join(rootDir, f));

  // Deduplicate and sort by basename
  const allFiles = [...drizzleFiles, ...rootFiles].sort((a, b) =>
    path.basename(a).localeCompare(path.basename(b))
  );
  const sqlFiles = allFiles.map((f) => path.basename(f));
  const sqlPaths = allFiles;

  console.log("[migrate] Connecting to PostgreSQL...");
  const ssl = url.includes("rds.amazonaws.com") ? { rejectUnauthorized: false } : false;
  const sql = postgres(url, { max: 1, connect_timeout: 30, ssl });

  try {
    for (let i = 0; i < sqlFiles.length; i++) {
      const file = sqlFiles[i];
      const filePath = sqlPaths[i];
      console.log(`[migrate] Running ${file}...`);
      const content = fs.readFileSync(filePath, "utf8");

      // 0000_init_complete.sql uses --> statement-breakpoint separators
      // 0001_seed_exams.sql is plain semicolon-terminated statements (one per line)
      // Strip leading SQL comments from each statement before checking emptiness.
      // A block may start with "-- comment\n\nCREATE TABLE..." — the CREATE TABLE must not be dropped.
      const stripLeadingComments = (s) => s.replace(/^([ \t]*--[^\n]*\n)*/g, "").trim();
      const statements = file.includes("init")
        ? content
            .split("--> statement-breakpoint")
            .map((s) => stripLeadingComments(s))
            .filter((s) => s.length > 0)
        : content
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && !s.startsWith("--"));

      console.log(`[migrate]   ${statements.length} statements`);
      for (const stmt of statements) {
        await sql.unsafe(stmt);
      }
      console.log(`[migrate] ${file} done`);
    }
    console.log("[migrate] All migrations applied successfully");
  } finally {
    await sql.end();
  }
}

migrate().catch((e) => {
  console.error("[migrate] FAILED:", e.message);
  process.exit(1);
});
