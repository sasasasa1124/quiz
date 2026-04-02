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

  const migrationsDir = path.join(__dirname, "../migrations/drizzle");
  const sqlFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log("[migrate] Connecting to PostgreSQL...");
  const ssl = url.includes("rds.amazonaws.com") ? { rejectUnauthorized: false } : false;
  const sql = postgres(url, { max: 1, connect_timeout: 30, ssl });

  try {
    for (const file of sqlFiles) {
      const filePath = path.join(migrationsDir, file);
      console.log(`[migrate] Running ${file}...`);
      const content = fs.readFileSync(filePath, "utf8");

      // 0000_init_complete.sql uses --> statement-breakpoint separators
      // 0001_seed_exams.sql is plain semicolon-terminated statements
      const statements = file.includes("init")
        ? content
            .split("--> statement-breakpoint")
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && !s.startsWith("--"))
        : content
            .split(/;\s*\n/)
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
