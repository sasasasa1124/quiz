#!/usr/bin/env node
/**
 * Generates migrations/drizzle/0001_seed_exams.sql from all CSV files.
 * Run from the quiz/ directory: node scripts/generate-seed-sql.mjs
 */
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUIZ_DIR = path.join(__dirname, "..");

const EXAM_NAMES = {
  "Salesforce認定PlatformDataアーキテクト":              "Salesforce 認定 Platform Data アーキテクト",
  "Salesforce認定PlatformIntegrationアーキテクト":       "Salesforce 認定 Platform Integration アーキテクト",
  "Salesforce認定PlatformSharingAndVisibilityアーキテクト": "Salesforce 認定 Platform Sharing and Visibility アーキテクト",
  "Salesforce認定DataCloudコンサルタント":                "Salesforce 認定 Data Cloud コンサルタント",
  "Salesforce認定SalesCloudコンサルタント":               "Salesforce 認定 Sales Cloud コンサルタント",
  "Salesforce認定ServiceCloudコンサルタント":             "Salesforce 認定 Service Cloud コンサルタント",
  "Salesforce認定SalesCloudコンサルタント_v2":            "Salesforce 認定 Sales Cloud コンサルタント（v2）",
  "Salesforce認定Platformアドミニストレーター上級":        "Salesforce 認定 Platform アドミニストレーター上級",
  "Salesforce認定Platformアドミニストレーター":           "Salesforce 認定 Platform アドミニストレーター",
  experience_cloud_consultant_exam:                "Salesforce 認定 Experience Cloud コンサルタント",
  experience_cloud_consultant_exam_en:             "Salesforce Certified Experience Cloud Consultant",
  mulesoft_developer_exam:                         "Salesforce 認定 MuleSoft デベロッパー",
  mulesoft_developer_exam_en:                      "Salesforce Certified MuleSoft Developer",
  mulesoft_developer_ii_exam_en:                   "Salesforce Certified MuleSoft Developer II",
  mulesoft_platform_integration_architect_exam:    "Salesforce 認定 MuleSoft Platform Integration アーキテクト",
  mulesoft_platform_integration_architect_exam_en: "Salesforce Certified MuleSoft Platform Integration Architect",
  platform_iam_architect_exam:                     "Salesforce 認定 Platform Identity and Access Management アーキテクト",
  platform_iam_architect_exam_en:                  "Salesforce Certified Platform Identity and Access Management Architect",
  service_cloud_consultant_exam:                   "Salesforce 認定 Service Cloud コンサルタント",
  service_cloud_consultant_exam_en:                "Salesforce Certified Service Cloud Consultant",
  ux_designer_exam:                                "Salesforce 認定 User Experience (UX) デザイナー",
  ux_designer_exam_en:                             "Salesforce Certified Platform User Experience Designer",
  agentforce_specialist_exam_en:                   "Salesforce Certified Agentforce Specialist",
};

function detectLang(records) {
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

function parseChoices(raw) {
  const parts = (raw || "").split(/\n|\s*\|\s*/).filter(p => p.trim());
  const choices = [];
  for (const part of parts) {
    const m = part.match(/^([A-Z])[.)]\s*([\s\S]+)$/);
    if (m) choices.push({ label: m[1], text: m[2].trim() });
    else if (part.trim()) choices.push({ label: String.fromCharCode(65 + choices.length), text: part.trim() });
  }
  return choices;
}

function parseAnswers(raw) {
  return (raw || "").split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(s => /^[A-Z]$/.test(s));
}

function esc(s) { return (s || "").replace(/'/g, "''"); }

// Collect CSVs from quiz/ and parent dir, deduplicated by examId
const dirs = [QUIZ_DIR, path.join(QUIZ_DIR, "..")];
const seen = new Set();
const csvFiles = [];
for (const dir of dirs) {
  let files;
  try { files = fs.readdirSync(dir); } catch { continue; }
  for (const f of files) {
    if (!f.endsWith(".csv")) continue;
    const examId = f.replace(".csv", "");
    if (examId.includes("template") || seen.has(examId)) continue;
    seen.add(examId);
    csvFiles.push(path.join(dir, f));
  }
}

const lines = [
  "-- Auto-generated seed for exams and questions",
  "-- Idempotent: ON CONFLICT DO NOTHING",
  "",
];
let totalExams = 0, totalQuestions = 0;

for (const filePath of csvFiles.sort()) {
  const examId = path.basename(filePath, ".csv");
  const name = EXAM_NAMES[examId] || examId;
  let records;
  try {
    records = parse(fs.readFileSync(filePath, "utf-8"), { columns: true, skip_empty_lines: true });
  } catch (e) {
    console.error(`Skip ${examId}: ${e.message}`);
    continue;
  }
  const lang = detectLang(records);
  lines.push(`INSERT INTO exams (id, name, lang) VALUES ('${esc(examId)}', '${esc(name)}', '${lang}') ON CONFLICT (id) DO NOTHING;`);
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const num = parseInt(row["#"] || String(i + 1), 10);
    const id = `${examId}__${num}`;
    const questionText = esc(row["question"] || "");
    const choices = parseChoices(row["choices"] || "");
    const answers = parseAnswers(row["answer"] || row["answers"] || "");
    const explanation = esc(row["explanation"] || "");
    const source = esc(row["source"] || "");
    const isDuplicate = !!(row["duplicate"] || "").trim() ? 1 : 0;
    lines.push(
      `INSERT INTO questions (id, exam_id, num, question_text, options, answers, explanation, source, is_duplicate) VALUES ` +
      `('${id}', '${esc(examId)}', ${num}, '${questionText}', '${esc(JSON.stringify(choices))}', '${esc(JSON.stringify(answers))}', '${explanation}', '${source}', ${isDuplicate}) ON CONFLICT (id) DO NOTHING;`
    );
    totalQuestions++;
  }
  console.log(`  ${examId}: ${records.length} questions`);
  totalExams++;
}

const outPath = path.join(QUIZ_DIR, "migrations/drizzle/0001_seed_exams.sql");
fs.writeFileSync(outPath, lines.join("\n") + "\n");
console.log(`\nGenerated: ${totalExams} exams, ${totalQuestions} questions`);
console.log(`Wrote: ${outPath}`);
