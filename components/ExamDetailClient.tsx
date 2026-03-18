"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Brain, BookOpen, BookOpenCheck,
  ChevronRight, AlertCircle, TrendingUp, Tag, Timer,
} from "lucide-react";
import type { CategoryStat, ExamMeta } from "@/lib/types";
import PageHeader from "./PageHeader";

interface Props {
  exam: ExamMeta;
  categoryStats: CategoryStat[];
  userEmail: string;
}

function pctColor(pct: number) {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 60) return "bg-amber-400";
  return "bg-rose-400";
}

function pctTextColor(pct: number) {
  if (pct >= 80) return "text-emerald-600";
  if (pct >= 60) return "text-amber-500";
  return "text-rose-500";
}

export default function ExamDetailClient({ exam, categoryStats: initialStats }: Props) {
  const [stats, setStats] = useState<CategoryStat[]>(initialStats);
  const [selectedMode, setSelectedMode] = useState<"quiz" | "review">("quiz");

  // Refresh category stats from API when page loads (picks up any in-flight score updates)
  useEffect(() => {
    fetch(`/api/category-stats?examId=${encodeURIComponent(exam.id)}`)
      .then((r) => r.json() as Promise<CategoryStat[]>)
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setStats(data);
      })
      .catch(() => {});
  }, [exam.id]);

  const totalQuestions = stats.reduce((s, c) => s + c.total, 0);
  const totalAttempted = stats.reduce((s, c) => s + c.attempted, 0);
  const totalCorrect = stats.reduce((s, c) => s + c.correct, 0);
  const overallPct = totalAttempted > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null;

  const weakCategories = stats.filter(
    (c) => c.attempted > 0 && c.attempted > 0 && Math.round((c.correct / c.total) * 100) < 60
  );

  const modeHref = (category?: string | null) => {
    const params = new URLSearchParams({ mode: selectedMode });
    if (category) params.set("category", category);
    return `/quiz/${exam.id}?${params.toString()}`;
  };

  const answersHref = (category?: string | null) => {
    const params = new URLSearchParams({ mode: "answers" });
    if (category) params.set("category", category);
    return `/quiz/${exam.id}?${params.toString()}`;
  };

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
      <PageHeader back={{ href: "/" }} title={exam.name} />

      <main className="flex-1 px-4 sm:px-8 py-6 max-w-2xl mx-auto w-full">

        {/* ── Overall progress ── */}
        {overallPct !== null && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={15} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Progress</span>
              </div>
              <span className={`text-2xl font-bold tabular-nums ${pctTextColor(overallPct)}`}>
                {overallPct}%
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pctColor(overallPct)}`}
                style={{ width: `${overallPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {totalCorrect}/{totalQuestions} correct · {totalAttempted} answered
            </p>
          </div>
        )}

        {/* ── Weak areas summary ── */}
        {weakCategories.length > 0 && (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle size={14} className="text-rose-400" />
              <span className="text-sm font-semibold text-rose-700">Weak Areas</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {weakCategories.map((c) => (
                <Link
                  key={c.category}
                  href={modeHref(c.category)}
                  className="text-xs bg-white border border-rose-200 text-rose-600 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-colors flex items-center gap-1.5"
                >
                  {c.category ?? "Uncategorized"}
                  <span className="text-rose-400">
                    {Math.round((c.correct / c.total) * 100)}%
                  </span>
                  <ChevronRight size={11} />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Category breakdown ── */}
        {stats.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-4">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
              <Tag size={14} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-700">Score by Category</span>
            </div>
            <div className="divide-y divide-gray-50">
              {stats.map((cat) => {
                const pct = cat.attempted > 0
                  ? Math.round((cat.correct / cat.total) * 100)
                  : null;
                const catName = cat.category ?? "Uncategorized";
                return (
                  <Link
                    key={catName}
                    href={modeHref(cat.category)}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-gray-700 truncate pr-2">{catName}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-400 tabular-nums">
                            {cat.attempted}/{cat.total}
                          </span>
                          {pct !== null && (
                            <span className={`text-sm font-bold tabular-nums w-10 text-right ${pctTextColor(pct)}`}>
                              {pct}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        {pct !== null ? (
                          <div
                            className={`h-full rounded-full ${pctColor(pct)}`}
                            style={{ width: `${pct}%` }}
                          />
                        ) : (
                          <div className="h-full w-0" />
                        )}
                      </div>
                    </div>
                    <ChevronRight size={13} className="text-gray-200 group-hover:text-gray-400 transition-colors shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Study modes ── */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-700">Start</span>
          </div>

          {/* Mode selector */}
          <div className="px-5 pt-4 pb-2">
            <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl">
              <button
                onClick={() => setSelectedMode("quiz")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedMode === "quiz" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Brain size={14} strokeWidth={1.75} /> Quiz
              </button>
              <button
                onClick={() => setSelectedMode("review")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedMode === "review" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <BookOpen size={14} strokeWidth={1.75} /> Flashcard
              </button>
            </div>
          </div>

          {/* Start buttons */}
          <div className="px-5 pb-5 pt-3 flex flex-col gap-2.5">
            <Link
              href={modeHref(null)}
              className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
            >
              Start all {exam.questionCount}
              <ChevronRight size={15} />
            </Link>

            <Link
              href={`${modeHref(null)}&filter=wrong`}
              className="w-full py-3 rounded-xl border-2 border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <AlertCircle size={14} /> Wrong only
            </Link>

            <Link
              href={answersHref(null)}
              className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            >
              <BookOpenCheck size={14} /> Answer Sheet
            </Link>

            <Link
              href={`/quiz/${encodeURIComponent(exam.id)}?mode=mock`}
              className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            >
              <Timer size={14} /> Mock Exam
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
