import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";
import type { Choice, ExamMeta, Question } from "./types";

function getCSVDir(): string { return process.cwd(); }

const EXAM_NAMES: Record<string, string> = {
  // ── 日本語版 ──────────────────────────────────────────────────────────────
  experience_cloud_consultant_exam:                "Salesforce 認定 Experience Cloud コンサルタント",
  mulesoft_developer_exam:                         "Salesforce 認定 MuleSoft デベロッパー",
  mulesoft_platform_integration_architect_exam:    "Salesforce 認定 MuleSoft Platform Integration アーキテクト",
  platform_iam_architect_exam:                     "Salesforce 認定 Platform Identity and Access Management アーキテクト",
  service_cloud_consultant_exam:                   "Salesforce 認定 Service Cloud コンサルタント",
  ux_designer_exam:                                "Salesforce 認定 User Experience (UX) デザイナー",
  // ── 英語版 ────────────────────────────────────────────────────────────────
  experience_cloud_consultant_exam_en:               "Salesforce Certified Experience Cloud Consultant",
  mulesoft_developer_exam_en:                        "Salesforce Certified MuleSoft Developer",
  mulesoft_platform_integration_architect_exam_en:   "Salesforce Certified MuleSoft Platform Integration Architect",
  platform_iam_architect_exam_en:                    "Salesforce Certified Platform Identity and Access Management Architect",
  service_cloud_consultant_exam_en:                  "Salesforce Certified Service Cloud Consultant",
  ux_designer_exam_en:                               "Salesforce Certified Platform User Experience Designer",
};

const EXAM_TAGS: Record<string, string[]> = {
  experience_cloud_consultant_exam:               ["Salesforce"],
  mulesoft_developer_exam:                        ["Salesforce", "MuleSoft"],
  mulesoft_platform_integration_architect_exam:   ["Salesforce", "MuleSoft"],
  platform_iam_architect_exam:                    ["Salesforce"],
  service_cloud_consultant_exam:                  ["Salesforce"],
  ux_designer_exam:                               ["Salesforce"],
  experience_cloud_consultant_exam_en:            ["Salesforce"],
  mulesoft_developer_exam_en:                     ["Salesforce", "MuleSoft"],
  mulesoft_platform_integration_architect_exam_en:["Salesforce", "MuleSoft"],
  platform_iam_architect_exam_en:                 ["Salesforce"],
  service_cloud_consultant_exam_en:               ["Salesforce"],
  ux_designer_exam_en:                            ["Salesforce"],
};

// Detect language from parsed CSV records via character-code majority vote.
export function detectLanguage(records: Record<string, string>[]): "ja" | "en" {
  if (records.length === 0) return "ja";

  // Character-code majority vote across question/explanation values.
  // Note: column headers are intentionally ignored because _en CSVs use
  // Japanese header names while containing English question text.
  const jaRe = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]/g;
  const enRe = /[A-Za-z]/g;

  let jaQ = 0, enQ = 0;
  for (const row of records) {
    const text = Object.values(row).join(" ");
    const ja = (text.match(jaRe) ?? []).length;
    const en = (text.match(enRe) ?? []).length;
    if (ja > en) jaQ++; else enQ++;
  }
  return jaQ >= enQ ? "ja" : "en";
}

// Parse "A. some text | B. other text" (or newline-separated) into Choice[]
function parseChoices(raw: string): Choice[] {
  // Split on " | " or newline — supports both formats
  const parts = raw.split(/\n|\s*\|\s*/).filter((p) => p.trim());
  const choices: Choice[] = [];

  for (const part of parts) {
    // Match label like "A.", "B.", "A)", "B)" etc.
    const match = part.match(/^([A-Z])[.)]\s*([\s\S]+)$/);
    if (match) {
      choices.push({ label: match[1], text: match[2].trim() });
    } else if (part.trim()) {
      // fallback: treat the whole thing as text
      choices.push({ label: String.fromCharCode(65 + choices.length), text: part.trim() });
    }
  }
  return choices;
}

// Parse answer string "A,C,E" or "B" into string[]
function parseAnswers(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]$/.test(s));
}

export function getExamList(): ExamMeta[] {
  const files = fs.readdirSync(getCSVDir()).filter((f) => f.endsWith(".csv"));
  const metas: ExamMeta[] = [];

  for (const file of files) {
    const id = file.replace(".csv", "");
    // Strip known _en suffix for display name lookup, but don't rely on it for language
    const displayName = EXAM_NAMES[id] ?? id;

    try {
      const content = fs.readFileSync(path.join(getCSVDir(), file), "utf-8");
      const records = parse(content, { columns: true, skip_empty_lines: true });
      const language = detectLanguage(records as Record<string, string>[]);
      const duplicateCount = (records as Record<string, string>[])
        .filter((r) => !!(r["duplicate"] ?? "").trim()).length;
      metas.push({
        id,
        name: displayName,
        language,
        questionCount: records.length,
        duplicateCount,
        tags: EXAM_TAGS[id] ?? ["Salesforce"],
      });
    } catch {
      // skip malformed CSVs
    }
  }

  // Sort: JA first, then by name
  return metas.sort((a, b) => {
    if (a.language !== b.language) return a.language === "ja" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function getQuestions(examId: string): Question[] {
  const filePath = path.join(getCSVDir(), `${examId}.csv`);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, "utf-8");
  const records = parse(content, { columns: true, skip_empty_lines: true }) as Record<string, string>[];

  return records.map((row): Question => {
    const num = parseInt(row["#"] ?? "0", 10);
    const choices = parseChoices(row["choices"] ?? "");
    const answers = parseAnswers(row["answer"] ?? row["answers"] ?? "");
    const rawExpSources = row["explanation_sources"] ?? "";
    const explanationSources = rawExpSources
      ? rawExpSources.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean)
      : [];
    return {
      id: num,
      dbId: `${examId}__${num}`,
      question: row["question"] ?? "",
      choices,
      answers,
      explanation: row["explanation"] ?? "",
      coreConcept: "",
      source: row["source"] ?? "",
      explanationSources,
      isDuplicate: !!(row["duplicate"] ?? "").trim(),
      choiceCount: choices.length,
      isMultiple: answers.length > 1,
      version: 1,
      category: null,
      createdBy: "",
      createdAt: row["created_at"] ?? "",
      addedAt: row["added_at"] ?? "",
      updatedAt: "",
    };
  });
}
