"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, RotateCcw, ChevronDown, Loader2 } from "lucide-react";
import type { ExamMeta, QuizStats, CategoryStat, ExamSnapshot, SessionRecord } from "@/lib/types";
import { useSetHeader } from "@/lib/header-context";
import ExamTrendChart from "./ExamTrendChart";
import CategoryChart from "./CategoryChart";
import { loadServerSnapshots } from "@/lib/snapshots";

interface Props {
  exams: ExamMeta[];
}

interface ExamStats {
  pct: number | null;
  answered: number;
  total: number;
  wrongCount: number;
}

export default function ProfileClient({ exams }: Props) {
  const router = useRouter();
  useSetHeader({ back: { href: "/" }, title: "Profile" }, []);
  const [statsMap, setStatsMap] = useState<Record<string, ExamStats>>({});
  const [expandedExamId, setExpandedExamId] = useState<string | null>(null);
  const [categoryCache, setCategoryCache] = useState<Record<string, CategoryStat[]>>({});
  const [categoryLoading, setCategoryLoading] = useState<Record<string, boolean>>({});
  const [snapshotsMap, setSnapshotsMap] = useState<Record<string, ExamSnapshot[]>>({});
  const [sessionCache, setSessionCache] = useState<Record<string, SessionRecord[]>>({});

  useEffect(() => {
    // Load stats from server (all exams at once)
    fetch("/api/scores")
      .then((r) => r.json() as Promise<{ statsMap: Record<string, QuizStats> }>)
      .then(({ statsMap: remote }) => {
        const map: Record<string, ExamStats> = {};
        for (const exam of exams) {
          const stats = remote[exam.id] ?? {};
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
      })
      .catch(() => {
        // Fallback: read from localStorage
        const map: Record<string, ExamStats> = {};
        for (const exam of exams) {
          try {
            const raw = JSON.parse(localStorage.getItem(`quiz-stats-${exam.id}`) ?? "{}");
            const keys = Object.keys(raw).filter((k) => raw[k] === 0 || raw[k] === 1);
            const correct = keys.filter((k) => raw[k] === 1).length;
            const wrongCount = keys.filter((k) => raw[k] === 0).length;
            map[exam.id] = {
              pct: keys.length > 0 ? Math.round((correct / exam.questionCount) * 100) : null,
              answered: keys.length,
              total: exam.questionCount,
              wrongCount,
            };
          } catch { map[exam.id] = { pct: null, answered: 0, total: exam.questionCount, wrongCount: 0 }; }
        }
        setStatsMap(map);
      });

    // Load snapshots from server
    loadServerSnapshots().then(setSnapshotsMap).catch(() => {});
  }, [exams]);

  function handleExamClick(examId: string) {
    if (expandedExamId === examId) {
      setExpandedExamId(null);
      return;
    }
    setExpandedExamId(examId);
    if (!categoryCache[examId]) {
      setCategoryLoading((prev) => ({ ...prev, [examId]: true }));
      fetch(`/api/category-stats?examId=${encodeURIComponent(examId)}`)
        .then((r) => r.json() as Promise<CategoryStat[]>)
        .then((data) => setCategoryCache((prev) => ({ ...prev, [examId]: data })))
        .catch(() => {})
        .finally(() => setCategoryLoading((prev) => ({ ...prev, [examId]: false })));
    }
    if (!sessionCache[examId]) {
      fetch(`/api/sessions?examId=${encodeURIComponent(examId)}`)
        .then((r) => r.json() as Promise<SessionRecord[]>)
        .then((data) => setSessionCache((prev) => ({ ...prev, [examId]: data })))
        .catch(() => {});
    }
  }

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
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col pt-14">

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
              const isExpanded = expandedExamId === exam.id;
              const snapshots = snapshotsMap[exam.id] ?? [];
              const catStats = categoryCache[exam.id] ?? [];
              const isLoadingCat = categoryLoading[exam.id] ?? false;
              const sessions = sessionCache[exam.id] ?? [];
              const hasCatData = catStats.some((c) => c.attempted > 0);

              return (
                <div key={exam.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => handleExamClick(exam.id)}
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
                      <ChevronDown
                        size={14}
                        className={`text-gray-300 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </div>
                  </button>

                  {/* Expanded section */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 py-4 space-y-5">

                      {/* Score trend */}
                      <div>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                          Score Trend (last 30 sessions)
                        </p>
                        <ExamTrendChart snapshots={snapshots} />
                      </div>

                      {/* Category chart */}
                      {isLoadingCat ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 size={18} className="text-gray-300 animate-spin" />
                        </div>
                      ) : hasCatData ? (
                        <div>
                          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                            Category Breakdown
                          </p>
                          <CategoryChart stats={catStats} />
                        </div>
                      ) : null}

                      {/* Session history */}
                      {sessions.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                            Session History
                          </p>
                          <div className="space-y-1">
                            {sessions.map((s) => {
                              const pct = s.correctCount != null
                                ? Math.round((s.correctCount / s.questionCount) * 100)
                                : null;
                              return (
                                <div key={s.id} className="flex items-center justify-between text-xs py-1.5 px-3 bg-gray-50 rounded-xl">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 font-medium uppercase">
                                      {s.mode}
                                    </span>
                                    <span className="text-gray-400">
                                      {new Date(s.startedAt + "Z").toLocaleDateString()}
                                    </span>
                                  </div>
                                  <span className={`font-semibold tabular-nums ${
                                    pct === null ? "text-gray-300"
                                    : pct >= 80 ? "text-emerald-600"
                                    : pct >= 60 ? "text-amber-500"
                                    : "text-rose-500"
                                  }`}>
                                    {s.correctCount != null
                                      ? `${s.correctCount}/${s.questionCount}`
                                      : `—/${s.questionCount}`}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => router.push(`/exam/${exam.id}`)}
                          className="flex-1 py-2 text-sm font-medium border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          View Exam
                        </button>
                        <button
                          onClick={() => router.push(`/quiz/${exam.id}?mode=quiz`)}
                          className="flex-1 py-2 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors flex items-center justify-center gap-1"
                        >
                          Start Quiz <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
