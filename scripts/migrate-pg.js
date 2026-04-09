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

  // SQLite-specific patterns that are incompatible with PostgreSQL
  const SQLITE_PATTERNS = [/\bAUTOINCREMENT\b/i, /\bdatetime\s*\(/i, /\bstrftime\s*\(/i];

  try {
    for (let i = 0; i < sqlFiles.length; i++) {
      const file = sqlFiles[i];
      const filePath = sqlPaths[i];
      console.log(`[migrate] Running ${file}...`);
      const content = fs.readFileSync(filePath, "utf8");

      // Skip entire files that contain SQLite-only syntax (these are D1 migrations)
      if (SQLITE_PATTERNS.some((p) => p.test(content))) {
        console.log(`[migrate]   skipped (SQLite-only file): ${file}`);
        continue;
      }

      // Statement splitting strategy:
      //   - Files with "--> statement-breakpoint": split on that marker (drizzle schema files)
      //   - drizzle/ seed files (0001_seed_exams.sql): one SQL statement per line — split by \n
      //     (semicolon-split is unsafe because values contain semicolons inside quoted strings)
      //   - root incremental migrations: safe to split by ; (short ALTER TABLE / CREATE INDEX)
      const stripLeadingComments = (s) => s.replace(/^([ \t]*--[^\n]*\n)*/g, "").trim();
      const isDrizzleFile = filePath.includes("/drizzle/");
      let statements;
      if (content.includes("--> statement-breakpoint")) {
        statements = content
          .split("--> statement-breakpoint")
          .map((s) => stripLeadingComments(s))
          .filter((s) => s.length > 0);
      } else if (isDrizzleFile) {
        // Drizzle seed files: one statement per line, safe to split by newline
        statements = content
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.startsWith("--"));
      } else {
        // Root incremental migrations: short statements, split by semicolon
        statements = content
          .split(";")
          .map((s) => s.replace(/^([ \t]*--[^\n]*\n)*/g, "").trim())
          .filter((s) => s.length > 0 && !s.startsWith("--"));
      }

      console.log(`[migrate]   ${statements.length} statements`);
      for (const stmt of statements) {
        try {
          await sql.unsafe(stmt);
        } catch (e) {
          // Tolerate already-applied incremental migrations:
          //   42701 = duplicate_column (ALTER TABLE ADD COLUMN already exists)
          //   42P07 = duplicate_table  (CREATE TABLE already exists, non-IF-NOT-EXISTS)
          //   42710 = duplicate_object (CREATE INDEX already exists, non-IF-NOT-EXISTS)
          const code = e.code ?? "";
          if (code === "42701" || code === "42P07" || code === "42710") {
            console.log(`[migrate]   skipped (already applied): ${e.message.split("\n")[0]}`);
          } else {
            throw e;
          }
        }
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
