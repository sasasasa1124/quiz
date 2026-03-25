import type { QuizStats } from "./types";

const statsKey = (examId: string) => `quiz-stats-${examId}`;

export function loadLocalStats(examId: string): QuizStats {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(statsKey(examId)) ?? "{}");
    const migrated: QuizStats = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === 0 || v === 1) migrated[k] = v as 0 | 1;
    }
    return migrated;
  } catch { return {}; }
}

export function saveLocalStats(examId: string, stats: QuizStats) {
  localStorage.setItem(statsKey(examId), JSON.stringify(stats));
}
