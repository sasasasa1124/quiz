#!/usr/bin/env node
/**
 * Applies PostgreSQL migrations to RDS on container startup.
 * Only runs when DATABASE_URL is set (AWS/Node.js environment).
 * Uses IF NOT EXISTS so it is idempotent.
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

  console.log("[migrate] Connecting to PostgreSQL...");
  const sql = postgres(url, { max: 1, connect_timeout: 30 });

  try {
    const migrationPath = path.join(
      __dirname,
      "../migrations/drizzle/0000_init_complete.sql"
    );
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");

    const statements = migrationSQL
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    console.log(`[migrate] Running ${statements.length} statements...`);
    for (const stmt of statements) {
      await sql.unsafe(stmt);
    }
    console.log("[migrate] Migrations applied successfully");
  } finally {
    await sql.end();
  }
}

migrate().catch((e) => {
  console.error("[migrate] FAILED:", e.message);
  process.exit(1);
});
