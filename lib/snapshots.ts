import type { ExamSnapshot, QuizStats } from "./types";

const SNAPSHOTS_KEY = "quiz-snapshots";

function loadAllSnapshots(): Record<string, ExamSnapshot[]> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) ?? "{}");
  } catch { return {}; }
}

function saveAllSnapshots(data: Record<string, ExamSnapshot[]>) {
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(data));
}

export function getExamSnapshots(examId: string): ExamSnapshot[] {
  return loadAllSnapshots()[examId] ?? [];
}

export function getAllSnapshots(): Record<string, ExamSnapshot[]> {
  return loadAllSnapshots();
}

export function recordDailySnapshot(
  examId: string,
  stats: QuizStats,
  totalQuestions: number,
) {
  if (typeof window === "undefined") return;
  const today = new Date().toDateString();
  const all = loadAllSnapshots();
  const list = all[examId] ?? [];

  const correct = Object.values(stats).filter((v) => v === 1).length;
  const accuracy = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;
  const snap: ExamSnapshot = { ts: Date.now(), correct, total: totalQuestions, accuracy };

  const last = list[list.length - 1];
  if (last && new Date(last.ts).toDateString() === today) {
    list[list.length - 1] = snap; // overwrite today's entry
  } else {
    list.push(snap);
    if (list.length > 60) list.splice(0, list.length - 60);
  }

  all[examId] = list;
  saveAllSnapshots(all);
}
