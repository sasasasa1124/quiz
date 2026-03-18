"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Brain, BookOpen, BookOpenCheck,
  ChevronRight, AlertCircle, TrendingUp, Tag, Timer, History,
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
  const [statsLoading, setStatsLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<"quiz" | "review">("quiz");
  const [selectedScope, setSelectedScope] = useState<"all" | "continue" | "wrong">("all");
  const [hasContinue, setHasContinue] = useState(false);

  // Check for saved position in localStorage
  useEffect(() => {
    const savedId = localStorage.getItem(`quiz-last-index-${exam.id}`);
    setHasContinue(savedId !== null && Number.isFinite(Number(savedId)));
  }, [exam.id]);

  // Refresh category stats from API when page loads (picks up any in-flight score updates)
  useEffect(() => {
    fetch(`/api/category-stats?examId=${encodeURIComponent(exam.id)}`)
      .then((r) => r.json() as Promise<CategoryStat[]>)
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setStats(data);
        setStatsLoading(false);
      })
      .catch(() => { setStatsLoading(false); });
  }, [exam.id]);

  const totalQuestions = stats.reduce((s, c) => s + c.total, 0);
  const totalAttempted = stats.reduce((s, c) => s + c.attempted, 0);
  const totalCorrect = stats.reduce((s, c) => s + c.correct, 0);
  const overallPct = totalAttempted > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null;

  const wrongCount = stats.reduce((s, c) => s + (c.attempted - c.correct), 0);

  // Reset scope if the selected option becomes unavailable
  useEffect(() => {
    if (selectedScope === "wrong" && wrongCount === 0) setSelectedScope("all");
    if (selectedScope === "continue" && !hasContinue) setSelectedScope("all");
  }, [wrongCount, hasContinue, selectedScope]);

  const startHref = (() => {
    const params = new URLSearchParams({ mode: selectedMode });
    if (selectedScope !== "all") params.set("filter", selectedScope);
    return `/quiz/${encodeURIComponent(exam.id)}?${params.toString()}`;
  })();

  const startLabel =
    selectedScope === "wrong" ? `Start ${wrongCount} wrong` :
    selectedScope === "continue" ? "Continue" :
    `Start all ${exam.questionCount}`;

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

      <main className={`flex-1 px-4 sm:px-8 py-6 max-w-2xl mx-auto w-full transition-opacity duration-300 ${statsLoading ? "opacity-60" : "opacity-100"}`}>

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

          <div className="px-5 pt-4 pb-5 flex flex-col gap-4">

            {/* Questions — scope */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Questions</span>
              <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => setSelectedScope("all")}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedScope === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  All {exam.questionCount}
                </button>
                <button
                  onClick={() => hasContinue && setSelectedScope("continue")}
                  disabled={!hasContinue}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                    selectedScope === "continue" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <History size={13} /> 続きから
                </button>
                <button
                  onClick={() => wrongCount > 0 && setSelectedScope("wrong")}
                  disabled={wrongCount === 0}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                    selectedScope === "wrong" ? "bg-white text-rose-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <AlertCircle size={13} /> {wrongCount > 0 ? wrongCount : "Wrong"}
                </button>
              </div>
            </div>

            {/* Mode */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Mode</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedMode("quiz")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    selectedMode === "quiz"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <Brain size={14} strokeWidth={1.75} /> Quiz
                </button>
                <button
                  onClick={() => setSelectedMode("review")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    selectedMode === "review"
                      ? "border-purple-500 bg-purple-50 text-purple-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <BookOpen size={14} strokeWidth={1.75} /> Flashcard
                </button>
              </div>
            </div>

            {/* Primary CTA */}
            <Link
              href={startHref}
              className="w-full h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
            >
              {startLabel}
              <ChevronRight size={15} />
            </Link>

            {/* Secondary — Answer Sheet + Mock Exam */}
            <div className="border-t border-gray-100 pt-3 flex gap-2">
              <Link
                href={answersHref(null)}
                className="flex-1 h-10 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <BookOpenCheck size={14} /> Answer Sheet
              </Link>
              <Link
                href={`/quiz/${encodeURIComponent(exam.id)}?mode=mock`}
                className="flex-1 h-10 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <Timer size={14} /> Mock Exam
              </Link>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
