/**
 * Seed D1 from CSV files in the parent directory.
 *
 * Usage:
 *   npm run db:seed           # remote D1
 *   npm run db:seed:local     # local D1 (for development)
 *
 * Internally this generates a SQL file and runs it via wrangler:
 *   npx tsx scripts/seed-d1.ts [--local]
 */

import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const isLocal = process.argv.includes("--local");
const CSV_DIR = process.cwd();
const SQL_OUT = path.join(process.cwd(), "scripts", "_seed.sql");

const EXAM_NAMES: Record<string, string> = {
  // ── 日本語版 ──────────────────────────────────────────────────────────────
  "Salesforce認定PlatformDataアーキテクト":              "Salesforce 認定 Platform Data アーキテクト",
  "Salesforce認定PlatformIntegrationアーキテクト":       "Salesforce 認定 Platform Integration アーキテクト",
  "Salesforce認定PlatformSharingAndVisibilityアーキテクト": "Salesforce 認定 Platform Sharing and Visibility アーキテクト",
  "Salesforce認定DataCloudコンサルタント":                "Salesforce 認定 Data Cloud コンサルタント",
  "Salesforce認定SalesCloudコンサルタント":               "Salesforce 認定 Sales Cloud コンサルタント",
  "Salesforce認定ServiceCloudコンサルタント":              "Salesforce 認定 Service Cloud コンサルタント",
  "Salesforce認定SalesCloudコンサルタント_v2":             "Salesforce 認定 Sales Cloud コンサルタント（v2）",
  "Salesforce認定Platformアドミニストレーター上級":         "Salesforce 認定 Platform アドミニストレーター上級",
  "Salesforce認定Platformアドミニストレーター":            "Salesforce 認定 Platform アドミニストレーター",
  // ── 英語版・その他 ────────────────────────────────────────────────────────
  experience_cloud_consultant_exam:                "Salesforce 認定 Experience Cloud コンサルタント",
  experience_cloud_consultant_exam_en:             "Salesforce Certified Experience Cloud Consultant",
  mulesoft_developer_exam:                         "Salesforce 認定 MuleSoft デベロッパー",
  mulesoft_developer_exam_en:                      "Salesforce Certified MuleSoft Developer",
  mulesoft_platform_integration_architect_exam:    "Salesforce 認定 MuleSoft Platform Integration アーキテクト",
  mulesoft_platform_integration_architect_exam_en: "Salesforce Certified MuleSoft Platform Integration Architect",
  platform_iam_architect_exam:                     "Salesforce 認定 Platform Identity and Access Management アーキテクト",
  platform_iam_architect_exam_en:                  "Salesforce Certified Platform Identity and Access Management Architect",
  service_cloud_consultant_exam:                   "Salesforce 認定 Service Cloud コンサルタント",
  service_cloud_consultant_exam_en:                "Salesforce Certified Service Cloud Consultant",
  ux_designer_exam:                                "Salesforce 認定 User Experience (UX) デザイナー",
  ux_designer_exam_en:                             "Salesforce Certified Platform User Experience Designer",
};

interface Choice { label: string; text: string; }

function detectLang(records: Record<string, string>[]): "ja" | "en" {
  if (records.length === 0) return "ja";
  const jaRe = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g;
  const enRe = /[A-Za-z]/g;
  let ja = 0, en = 0;
  for (const row of records) {
    const text = Object.values(row).join(" ");
    if ((text.match(jaRe) ?? []).length > (text.match(enRe) ?? []).length) ja++; else en++;
  }
  return ja >= en ? "ja" : "en";
}

function parseChoices(raw: string): Choice[] {
  const parts = raw.split(/\n|\s*\|\s*/).filter((p) => p.trim());
  const choices: Choice[] = [];
  for (const part of parts) {
    const m = part.match(/^([A-Z])[.)]\s*([\s\S]+)$/);
    if (m) choices.push({ label: m[1], text: m[2].trim() });
    else if (part.trim()) choices.push({ label: String.fromCharCode(65 + choices.length), text: part.trim() });
  }
  return choices;
}

function parseAnswers(raw: string): string[] {
  return raw.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]$/.test(s));
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

const lines: string[] = [];

const csvFiles = fs.readdirSync(CSV_DIR).filter((f) => f.endsWith(".csv") && f !== "quiz_template.csv");

for (const file of csvFiles) {
  const examId = file.replace(".csv", "");
  const name = EXAM_NAMES[examId] ?? examId;

  let records: Record<string, string>[];
  try {
    const content = fs.readFileSync(path.join(CSV_DIR, file), "utf-8");
    records = parse(content, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  } catch {
    console.warn(`Skipping ${file} (parse error)`);
    continue;
  }

  const lang = detectLang(records);

  lines.push(
    `INSERT OR REPLACE INTO exams (id, name, lang) VALUES ('${esc(examId)}', '${esc(name)}', '${lang}');`
  );

  records.forEach((row, i) => {
    const num = parseInt(row["#"] ?? String(i + 1), 10);
    const id = `${examId}__${num}`;
    const questionText = esc(row["question"] ?? "");
    const choices = parseChoices(row["choices"] ?? "");
    const answers = parseAnswers(row["answer"] ?? row["answers"] ?? "");
    const explanation = esc(row["explanation"] ?? "");
    const source = esc(row["source"] ?? "");
    const isDuplicate = !!(row["duplicate"] ?? "").trim() ? 1 : 0;

    const optionsJson = esc(JSON.stringify(choices));
    const answersJson = esc(JSON.stringify(answers));

    lines.push(
      `INSERT OR IGNORE INTO questions (id, exam_id, num, question_text, options, answers, explanation, source, is_duplicate) ` +
      `VALUES ('${id}', '${esc(examId)}', ${num}, '${questionText}', '${optionsJson}', '${answersJson}', '${explanation}', '${source}', ${isDuplicate});`
    );
  });

  console.log(`  ${examId}: ${records.length} questions`);
}


fs.writeFileSync(SQL_OUT, lines.join("\n"), "utf-8");
console.log(`\nSQL written to ${SQL_OUT}`);

const localFlag = isLocal ? "--local" : "--remote";
const cmd = `wrangler d1 execute quiz-db ${localFlag} --file=scripts/_seed.sql`;
console.log(`Running: ${cmd}\n`);
execSync(cmd, { stdio: "inherit", cwd: process.cwd() });

// Cleanup
fs.unlinkSync(SQL_OUT);
console.log("\nDone.");
