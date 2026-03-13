"use client";

import { useState, useEffect, useCallback } from "react";
import type { Question, QuizStats } from "@/lib/types";
import QuizQuestion from "./QuizQuestion";
import Link from "next/link";

interface Props {
  questions: Question[];
  examId: string;
  examName: string;
  initialFilter: "all" | "wrong";
  mode: "quiz" | "review";
  lang: "ja" | "en";
}

function statsKey(examId: string) {
  return `quiz-stats-${examId}`;
}

function loadStats(examId: string): QuizStats {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(statsKey(examId)) ?? "{}");
  } catch {
    return {};
  }
}

function saveStats(examId: string, stats: QuizStats) {
  localStorage.setItem(statsKey(examId), JSON.stringify(stats));
}

export default function QuizClient({ questions, examId, examName, initialFilter, mode, lang }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState<QuizStats>({});
  const [filter, setFilter] = useState<"all" | "wrong">(initialFilter);

  useEffect(() => {
    setStats(loadStats(examId));
  }, [examId]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [filter]);

  const handleAnswer = useCallback(
    (questionId: number, correct: boolean) => {
      setStats((prev) => {
        const key = String(questionId);
        const cur = prev[key] ?? { attempts: 0, correct: 0 };
        const next = {
          ...prev,
          [key]: { attempts: cur.attempts + 1, correct: cur.correct + (correct ? 1 : 0) },
        };
        saveStats(examId, next);
        return next;
      });
    },
    [examId]
  );

  const filteredQuestions = questions.filter((q) => {
    if (filter === "wrong") {
      const s = stats[String(q.id)];
      return s && s.correct < s.attempts;
    }
    return true;
  });

  const totalAnswered = questions.filter((q) => stats[String(q.id)]).length;
  const totalCorrect = questions.reduce((acc, q) => acc + (stats[String(q.id)]?.correct ?? 0), 0);
  const totalAttempts = questions.reduce((acc, q) => acc + (stats[String(q.id)]?.attempts ?? 0), 0);
  const overallRate = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : null;
  const wrongCount = questions.filter((q) => {
    const s = stats[String(q.id)];
    return s && s.correct < s.attempts;
  }).length;

  const backHref = `/select/${mode}/${lang}`;

  if (filteredQuestions.length === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        <BackBar examName={examName} href={backHref} />
        <div className="text-center py-20 border border-gray-200 rounded-xl bg-white">
          <p className="text-4xl mb-3">🎉</p>
          <p className="text-gray-700 font-medium mb-1">
            {filter === "wrong" ? "誤答問題がありません" : "問題がありません"}
          </p>
          <p className="text-sm text-gray-400 mb-6">
            {filter === "wrong" ? "すべて正解しています！" : "CSVを確認してください"}
          </p>
          <div className="flex gap-3 justify-center">
            {filter === "wrong" && (
              <button onClick={() => setFilter("all")} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                全問に切り替え
              </button>
            )}
            <Link href="/" className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-300">
              ホームへ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const q = filteredQuestions[currentIndex];
  const isLast = currentIndex === filteredQuestions.length - 1;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href={backHref} className="text-sm text-gray-500 hover:text-gray-800">← 試験選択</Link>
          <span className="text-gray-300">|</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            mode === "quiz" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
          }`}>
            {mode === "quiz" ? "🧠 クイズ" : "📖 フラッシュカード"}
          </span>
        </div>
        {/* Filter toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setFilter("all")}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              filter === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            全問 {questions.length}
          </button>
          <button
            onClick={() => setFilter("wrong")}
            disabled={wrongCount === 0}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              filter === "wrong" ? "bg-white text-red-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            誤答 {wrongCount}
          </button>
        </div>
      </div>

      {/* Exam name + stats */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-gray-700 truncate max-w-xs">{examName}</span>
        {overallRate !== null && (
          <span className="text-xs text-gray-500">
            正答率{" "}
            <span className={`font-bold ${overallRate >= 80 ? "text-green-600" : overallRate >= 60 ? "text-yellow-600" : "text-red-500"}`}>
              {overallRate}%
            </span>
            {" "}| {totalAnswered}/{questions.length} 済
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
    </div>
  );
}

function BackBar({ examName, href }: { examName: string; href: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <Link href={href} className="text-sm text-gray-500 hover:text-gray-800">← 試験選択</Link>
      <span className="text-gray-300">|</span>
      <span className="text-sm font-medium text-gray-700 truncate">{examName}</span>
    </div>
  );
}
