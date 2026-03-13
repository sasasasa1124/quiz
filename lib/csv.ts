import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";
import type { Choice, ExamMeta, Question } from "./types";

const CSV_DIR = path.join(process.cwd(), "..");

const EXAM_NAMES: Record<string, string> = {
  experience_cloud_consultant_exam: "Experience Cloud Consultant",
  mule_dev_201_exam: "MuleSoft Developer I (DEV201)",
  plat_arch_202_exam: "Platform App Builder / Architect 202",
  platform_iam_architect_exam: "Platform Identity & Access Mgmt Architect",
  service_cloud_consultant_exam: "Service Cloud Consultant",
  ux_designer_exam: "UX Designer",
};

// Parse "A. some text | B. other text" into Choice[]
function parseChoices(raw: string): Choice[] {
  // Split on " | " separator
  const parts = raw.split(/\s*\|\s*/);
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
  const files = fs.readdirSync(CSV_DIR).filter((f) => f.endsWith(".csv"));
  const metas: ExamMeta[] = [];

  for (const file of files) {
    const id = file.replace(".csv", "");
    const isEn = id.endsWith("_en");
    const baseName = isEn ? id.slice(0, -3) : id;
    const displayName = EXAM_NAMES[baseName] ?? baseName;

    try {
      const content = fs.readFileSync(path.join(CSV_DIR, file), "utf-8");
      const records = parse(content, { columns: true, skip_empty_lines: true });
      metas.push({
        id,
        name: displayName,
        language: isEn ? "en" : "ja",
        questionCount: records.length,
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
  const filePath = path.join(CSV_DIR, `${examId}.csv`);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, "utf-8");
  const records = parse(content, { columns: true, skip_empty_lines: true }) as Record<string, string>[];

  return records.map((row): Question => {
    const choices = parseChoices(row["選択肢"] ?? row["choices"] ?? "");
    const answers = parseAnswers(row["解答"] ?? row["answer"] ?? row["answers"] ?? "");
    return {
      id: parseInt(row["#"] ?? "0", 10),
      question: row["質問"] ?? row["question"] ?? "",
      choices,
      answers,
      explanation: row["解説"] ?? row["explanation"] ?? "",
      source: row["ソース"] ?? row["source"] ?? "",
      isDuplicate: !!(row["重複"] ?? row["duplicate"] ?? "").trim(),
      choiceCount: choices.length,
      isMultiple: answers.length > 1,
    };
  });
}
