"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, RotateCcw } from "lucide-react";
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
  const [statsMap, setStatsMap] = useState<Record<string, {
    pct: number | null; answered: number; total: number; wrongCount: number;
  }>>({});

  useEffect(() => {
    const map: typeof statsMap = {};
    for (const exam of exams) {
      const stats = loadStats(exam.id);
      const keys = Object.keys(stats).filter((k) => stats[k] === 0 || stats[k] === 1);
      const correct = keys.filter((k) => stats[k] === 1).length;
      const wrongCount = keys.filter((k) => stats[k] === 0).length;
      map[exam.id] = {
        pct: keys.length > 0 ? Math.round((correct / exam.questionCount) * 100) : null,
        answered: keys.length,
        total: exam.questionCount,
        wrongCount,
      };
    }
    setStatsMap(map);
  }, [exams]);

  const go = (examId: string, filter: "all" | "wrong") =>
    router.push(`/quiz/${examId}?mode=${mode}&filter=${filter}`);

  const accent = mode === "quiz" ? "blue" : "violet";

  return (
    <div>
      <Link
        href={`/select/${mode}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-8 transition-colors"
      >
        <ArrowLeft size={14} />
        戻る
      </Link>

      <p className="text-sm font-medium text-gray-500 mb-4">
        {lang === "ja" ? "日本語" : "English"} — 試験を選択
      </p>

      <div className="space-y-2.5">
        {exams.map((exam) => {
          const s = statsMap[exam.id];
          const pct = s?.pct ?? null;

          return (
            <div key={exam.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {/* Exam info row */}
              <button
                onClick={() => go(exam.id, "all")}
                className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm leading-snug">{exam.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {exam.questionCount} 問
                    {s && s.answered > 0 && (
                      <span className="ml-2 text-gray-300">·</span>
                    )}
                    {s && s.answered > 0 && (
                      <span className="ml-2">{s.answered}/{s.total} 回答済</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {pct !== null && (
                    <span className={`text-base font-bold tabular-nums ${
                      pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-500" : "text-rose-500"
                    }`}>
                      {pct}%
                    </span>
                  )}
                  <ChevronRight size={15} className="text-gray-300 group-hover:text-gray-400 transition-colors" />
                </div>
              </button>

              {/* Progress bar */}
              {s && s.answered > 0 && pct !== null && (
                <div className="h-0.5 bg-gray-100">
                  <div
                    className={`h-full transition-all ${
                      pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-rose-400"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}

              {/* Wrong answers row — only shown if there are wrong answers */}
              {s && s.wrongCount > 0 && (
                <button
                  onClick={() => go(exam.id, "wrong")}
                  className="w-full text-left px-5 py-3 flex items-center gap-2 border-t border-gray-100 hover:bg-rose-50 transition-colors group"
                >
                  <RotateCcw size={13} className="text-rose-400 shrink-0" />
                  <span className="text-xs text-rose-500 font-medium">
                    誤答 {s.wrongCount} 問を復習
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
