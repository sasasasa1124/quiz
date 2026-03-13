"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ExamMeta, QuizStats } from "@/lib/types";

interface Props {
  exams: ExamMeta[];
  mode: "quiz" | "review";
  lang: "ja" | "en";
}

function loadStats(examId: string): QuizStats {
  try {
    return JSON.parse(localStorage.getItem(`quiz-stats-${examId}`) ?? "{}");
  } catch {
    return {};
  }
}

export default function ExamSelectClient({ exams, mode, lang }: Props) {
  const router = useRouter();
  const [statsMap, setStatsMap] = useState<Record<string, { pct: number | null; answered: number; total: number; wrongCount: number }>>({});

  useEffect(() => {
    const map: typeof statsMap = {};
    for (const exam of exams) {
      const stats = loadStats(exam.id);
      const keys = Object.keys(stats);
      const attempts = keys.reduce((a, k) => a + stats[k].attempts, 0);
      const correct = keys.reduce((a, k) => a + stats[k].correct, 0);
      const wrongCount = keys.filter((k) => stats[k].correct < stats[k].attempts).length;
      map[exam.id] = {
        pct: attempts > 0 ? Math.round((correct / attempts) * 100) : null,
        answered: keys.length,
        total: exam.questionCount,
        wrongCount,
      };
    }
    setStatsMap(map);
  }, [exams]);

  const go = (examId: string, filter: "all" | "wrong") =>
    router.push(`/quiz/${examId}?mode=${mode}&filter=${filter}`);

  const modeLabel = mode === "quiz" ? "🧠 クイズ" : "📖 フラッシュカード";

  return (
    <div>
      <Link href={`/select/${mode}`} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-2">
        ← {modeLabel}
      </Link>
      <h2 className="text-base font-bold text-gray-800 mb-5">
        {lang === "ja" ? "🇯🇵 日本語" : "🇺🇸 English"} — 試験を選ぶ
      </h2>

      <div className="space-y-3">
        {exams.map((exam) => {
          const s = statsMap[exam.id];
          const pct = s?.pct ?? null;
          return (
            <div key={exam.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <p className="font-semibold text-gray-900 text-sm leading-snug">{exam.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {exam.questionCount} 問
                    {s && s.answered > 0 && ` · ${s.answered}/${s.total} 済`}
                  </p>
                </div>
                {pct !== null && (
                  <span className={`text-lg font-bold shrink-0 ${pct >= 80 ? "text-green-600" : pct >= 60 ? "text-yellow-600" : "text-red-500"}`}>
                    {pct}%
                  </span>
                )}
              </div>

              {s && s.answered > 0 && pct !== null && (
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full rounded-full ${pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-400" : "bg-red-400"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => go(exam.id, "all")}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                    mode === "quiz"
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-purple-600 text-white hover:bg-purple-700"
                  }`}
                >
                  全問スタート
                </button>
                <button
                  onClick={() => go(exam.id, "wrong")}
                  disabled={!s || s.wrongCount === 0}
                  className="flex-1 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  誤答 {s?.wrongCount ? `(${s.wrongCount})` : ""}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
