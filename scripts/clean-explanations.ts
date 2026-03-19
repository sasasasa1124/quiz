#!/usr/bin/env npx tsx
/**
 * Clean contaminated explanation texts in D1 production DB.
 * Removes embedded URLs (including those split across lines) that cause
 * Gemini to hallucinate sources from specific domains.
 *
 * Usage: npx tsx scripts/clean-explanations.ts [--dry-run]
 */

import { execSync } from "child_process";

const DRY_RUN = process.argv.includes("--dry-run");

function cleanExplanation(text: string): string {
  // 1. Collapse URLs that were split across lines
  //    e.g. "https://help.salesforce.\ncom/s/..." -> "https://help.salesforce.com/s/..."
  let result = text.replace(/(https?:\/\/[^\s]+)\n([^\s/][^\n]*)/g, "$1$2");

  // 2. Remove blob: URLs (Bing grounding artifacts)
  result = result.replace(/blob:https?:\/\/\S+/g, "");

  // 3. Remove Salesforce/Microsoft/Bing URLs that cause Gemini to hallucinate domain-specific sources.
  //    Deliberately NOT stripping generic example URLs (e.g. acme.com) that are part of explanation content.
  result = result.replace(
    /https?:\/\/[^\s　]*(?:salesforce\.com|trailhead\.com|bing\.com|microsoft\.com)[^\s　]*/gi,
    ""
  );

  // 4. Remove orphan URL path fragments left after stripping
  //    e.g. lines like "/articleView?id=...", "com/s/...", "htm&type=5", "admin"
  result = result
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      // Remove lines that look like URL fragments
      if (/^\/?articleView[?？]/.test(trimmed)) return false;
      if (/^\/docs\/atlas\./.test(trimmed)) return false;
      if (/^com\/s\//.test(trimmed)) return false;
      if (/^salesforce\.com\/s\//.test(trimmed)) return false;
      if (/^[a-z_]+\.htm(&type=\d+)?$/.test(trimmed)) return false;
      if (/^htm(&type=\d+)?$/.test(trimmed)) return false;
      if (/^id=[a-z_.]+\.htm/.test(trimmed)) return false;
      if (/^admin(_[a-z_]+\.htm)?(&type=\d+)?$/.test(trimmed)) return false;
      return true;
    })
    .join("\n");

  // 5. Remove trailing "参照:" / "参照：" sections (entire reference section at end)
  result = result.replace(/\n?参照[：:]\s*$/m, "");

  // 6. Clean up excessive whitespace
  result = result.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();

  return result;
}

function wrangler(cmd: string): string {
  return execSync(
    `npx wrangler d1 execute quiz-db --remote --json --command ${JSON.stringify(cmd)}`,
    { cwd: new URL("../", import.meta.url).pathname }
  ).toString();
}

// 1. Fetch rows with actual embedded URLs
console.log("Fetching rows with embedded URLs...");
const raw = wrangler(
  "SELECT id, explanation FROM questions WHERE explanation LIKE '%http://%' OR explanation LIKE '%https://%' OR explanation LIKE '%blob:http%'"
);

const result = JSON.parse(raw) as Array<{ results: Array<{ id: string; explanation: string }> }>;
const rows = result[0]?.results ?? [];
console.log(`Found ${rows.length} candidate rows.`);

// 2. Clean and update
let updated = 0;
for (const row of rows) {
  const cleaned = cleanExplanation(row.explanation);
  if (cleaned === row.explanation) continue;

  console.log(`\n--- ${row.id} ---`);
  console.log("BEFORE:", row.explanation.slice(0, 300));
  console.log("AFTER: ", cleaned.slice(0, 300));

  if (DRY_RUN) {
    updated++;
    continue;
  }

  const escaped = cleaned.replace(/'/g, "''");
  wrangler(`UPDATE questions SET explanation = '${escaped}' WHERE id = '${row.id}'`);
  updated++;
  console.log("✓ Updated");
}

console.log(`\n${DRY_RUN ? "[DRY RUN] Would update" : "Updated"} ${updated} rows.`);
