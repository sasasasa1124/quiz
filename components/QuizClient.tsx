"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Brain, Layers, AlertCircle } from "lucide-react";
import type { Question, QuizStats } from "@/lib/types";
import QuizQuestion from "./QuizQuestion";

interface Props {
  questions: Question[];
  examId: string;
  examName: string;
  initialFilter: "all" | "wrong";
  mode: "quiz" | "review";
  lang: "ja" | "en";
}

const statsKey = (id: string) => `quiz-stats-${id}`;

function loadStats(examId: string): QuizStats {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(statsKey(examId)) ?? "{}"); }
  catch { return {}; }
}

function saveStats(examId: string, stats: QuizStats) {
  localStorage.setItem(statsKey(examId), JSON.stringify(stats));
}

export default function QuizClient({ questions, examId, examName, initialFilter, mode, lang }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState<QuizStats>({});
  const [filter, setFilter] = useState<"all" | "wrong">(initialFilter);

  const backHref = `/select/${mode}/${lang}`;

  useEffect(() => { setStats(loadStats(examId)); }, [examId]);
  useEffect(() => { setCurrentIndex(0); }, [filter]);

  const handleAnswer = useCallback((questionId: number, correct: boolean) => {
    setStats((prev) => {
      const key = String(questionId);
      const cur = prev[key] ?? { attempts: 0, correct: 0 };
      const next = { ...prev, [key]: { attempts: cur.attempts + 1, correct: cur.correct + (correct ? 1 : 0) } };
      saveStats(examId, next);
      return next;
    });
  }, [examId]);

  const filteredQuestions = questions.filter((q) => {
    if (filter === "wrong") {
      const s = stats[String(q.id)];
      return s && s.correct < s.attempts;
    }
    return true;
  });

  const totalAnswered = questions.filter((q) => stats[String(q.id)]).length;
  const totalCorrect = questions.reduce((a, q) => a + (stats[String(q.id)]?.correct ?? 0), 0);
  const totalAttempts = questions.reduce((a, q) => a + (stats[String(q.id)]?.attempts ?? 0), 0);
  const overallRate = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : null;
  const wrongCount = questions.filter((q) => { const s = stats[String(q.id)]; return s && s.correct < s.attempts; }).length;

  const ModeIcon = mode === "quiz" ? Brain : BookOpen;
  const modeLabel = mode === "quiz" ? "クイズ" : "フラッシュカード";

  // Empty state
  if (filteredQuestions.length === 0) {
    return (
      <div className="max-w-lg mx-auto pt-8">
        <BackBar href={backHref} examName={examName} />
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center mt-6">
          <AlertCircle size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="font-semibold text-gray-700 mb-1">
            {filter === "wrong" ? "誤答問題がありません" : "問題がありません"}
          </p>
          <p className="text-sm text-gray-400 mb-6">
            {filter === "wrong" ? "すべて正解済みです" : "CSVを確認してください"}
          </p>
          {filter === "wrong" && (
            <button
              onClick={() => setFilter("all")}
              className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              全問に切り替え
            </button>
          )}
        </div>
      </div>
    );
  }

  const q = filteredQuestions[currentIndex];
  const isLast = currentIndex === filteredQuestions.length - 1;

  return (
    <div className="max-w-2xl mx-auto pt-6 pb-12">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <BackBar href={backHref} examName={examName} inline />
        {/* Filter pills */}
        <div className="flex items-center bg-white border border-gray-200 rounded-xl p-0.5 gap-0.5">
          <button
            onClick={() => setFilter("all")}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              filter === "all" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Layers size={12} />
            全問 {questions.length}
          </button>
          <button
            onClick={() => setFilter("wrong")}
            disabled={wrongCount === 0}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              filter === "wrong" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <AlertCircle size={12} />
            誤答 {wrongCount}
          </button>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <ModeIcon size={13} strokeWidth={1.75} />
          <span>{modeLabel}</span>
          <span className="text-gray-200 mx-1">·</span>
          <span>{examName}</span>
        </div>
        {overallRate !== null && (
          <span className={`text-xs font-semibold tabular-nums ${
            overallRate >= 80 ? "text-emerald-600" : overallRate >= 60 ? "text-amber-500" : "text-rose-500"
          }`}>
            総合 {overallRate}%
            <span className="font-normal text-gray-400 ml-1.5">{totalAnswered}/{questions.length}</span>
          </span>
        )}
      </div>

      <QuizQuestion
        question={q}
        examId={examId}
        currentIndex={currentIndex}
        total={filteredQuestions.length}
        stat={stats[String(q.id)]}
        onAnswer={(correct) => handleAnswer(q.id, correct)}
        onNext={() => setCurrentIndex((i) => Math.min(i + 1, filteredQuestions.length - 1))}
        onPrev={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
        hasPrev={currentIndex > 0}
        hasNext={!isLast}
        isLast={isLast}
        reviewMode={mode === "review"}
      />

      {/* Keyboard hint */}
      <p className="text-center text-xs text-gray-300 mt-6">
        {mode === "review"
          ? "← 知らない　→ / Enter 知っている"
          : "1–9 で選択　Enter で回答 / 次へ　← → で前後"}
      </p>
    </div>
  );
}

function BackBar({ href, examName, inline }: { href: string; examName: string; inline?: boolean }) {
  if (inline) {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft size={14} />
        戻る
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-3 mb-6">
      <Link href={href} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft size={14} />
        戻る
      </Link>
      <span className="text-gray-200">·</span>
      <span className="text-sm text-gray-600 truncate">{examName}</span>
    </div>
  );
}
