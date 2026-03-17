"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, RotateCcw } from "lucide-react";
import type { ExamMeta, QuizStats } from "@/lib/types";
import PageHeader from "./PageHeader";

interface Props {
  exams: ExamMeta[];
}

function loadStats(examId: string): QuizStats {
  try {
    const raw = JSON.parse(localStorage.getItem(`quiz-stats-${examId}`) ?? "{}");
    const out: QuizStats = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === 0 || v === 1) out[k] = v as 0 | 1;
    }
    return out;
  } catch { return {}; }
}

interface ExamStats {
  pct: number | null;
  answered: number;
  total: number;
  wrongCount: number;
}

export default function ProfileClient({ exams }: Props) {
  const router = useRouter();
  const [statsMap, setStatsMap] = useState<Record<string, ExamStats>>({});

  useEffect(() => {
    const map: Record<string, ExamStats> = {};
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

  // Aggregate stats
  const started = exams.filter((e) => (statsMap[e.id]?.answered ?? 0) > 0);
  const totalAnswered = Object.values(statsMap).reduce((sum, s) => sum + s.answered, 0);
  const totalCorrect = exams.reduce((sum, e) => {
    const s = statsMap[e.id];
    if (!s) return sum;
    const correct = Math.round((s.pct ?? 0) / 100 * e.questionCount);
    return sum + (s.pct !== null ? correct : 0);
  }, 0);
  const overallPct = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : null;

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
      <PageHeader back={{ href: "/" }} title="Profile" />

      <div className="flex-1 px-4 sm:px-8 py-6 max-w-3xl mx-auto w-full space-y-6">

        {/* Overall summary */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Overall</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{started.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Exams started</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{totalAnswered}</p>
              <p className="text-xs text-gray-400 mt-0.5">Answers total</p>
            </div>
            <div>
              {overallPct !== null ? (
                <p className={`text-2xl font-bold tabular-nums ${overallPct >= 80 ? "text-emerald-600" : overallPct >= 60 ? "text-amber-500" : "text-rose-500"}`}>
                  {overallPct}%
                </p>
              ) : (
                <p className="text-2xl font-bold text-gray-300">—</p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">Accuracy</p>
            </div>
          </div>
          {overallPct !== null && (
            <div className="mt-4 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] duration-700 ease-out ${overallPct >= 80 ? "bg-emerald-500" : overallPct >= 60 ? "bg-amber-400" : "bg-rose-400"}`}
                style={{ width: `${overallPct}%` }}
              />
            </div>
          )}
        </div>

        {/* Per-exam list */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Exams</h2>
          <div className="space-y-2">
            {exams.map((exam) => {
              const s = statsMap[exam.id];
              const pct = s?.pct ?? null;
              return (
                <div key={exam.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => router.push(`/exam/${exam.id}`)}
                    className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm leading-snug">{exam.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-xs text-gray-400">
                          {exam.questionCount} Q
                          {s && s.answered > 0 && (
                            <span className="ml-2 text-gray-300">· {s.answered}/{s.total} answered</span>
                          )}
                        </p>
                        {s && s.wrongCount > 0 && (
                          <span className="flex items-center gap-1 text-xs text-rose-400">
                            <RotateCcw size={11} className="shrink-0" />
                            {s.wrongCount}
                          </span>
                        )}
                      </div>
                      {s && s.answered > 0 && pct !== null && (
                        <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-rose-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {pct !== null ? (
                        <span className={`text-base font-bold tabular-nums ${pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-500" : "text-rose-500"}`}>
                          {pct}%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">Not started</span>
                      )}
                      <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-400 transition-colors" />
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
