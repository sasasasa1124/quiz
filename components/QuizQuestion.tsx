"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown } from "lucide-react";
import type { Question, QuizStat } from "@/lib/types";

interface Props {
  question: Question;
  examId: string;
  onNext?: () => void;
  onPrev?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  isLast?: boolean;
  currentIndex: number;
  total: number;
  stat?: QuizStat;
  onAnswer?: (correct: boolean) => void;
  reviewMode?: boolean;
}

export default function QuizQuestion({
  question,
  examId,
  onNext,
  onPrev,
  hasPrev,
  hasNext,
  isLast,
  currentIndex,
  total,
  stat,
  onAnswer,
  reviewMode = false,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(reviewMode);

  useEffect(() => {
    setSelected(new Set());
    setSubmitted(reviewMode);
  }, [question.id, examId, reviewMode]);

  const toggleChoice = useCallback((label: string) => {
    if (submitted) return;
    setSelected((prev) => {
      if (question.isMultiple) {
        const next = new Set(prev);
        next.has(label) ? next.delete(label) : next.add(label);
        return next;
      }
      return new Set([label]);
    });
  }, [submitted, question.isMultiple]);

  const handleSubmit = useCallback(() => {
    if (selected.size === 0) return;
    if (question.isMultiple && selected.size !== question.answers.length) {
      alert(`${question.answers.length}つ選択してください`);
      return;
    }
    setSubmitted(true);
    const correct =
      question.answers.length === selected.size &&
      question.answers.every((a) => selected.has(a));
    onAnswer?.(correct);
  }, [selected, question, onAnswer]);

  // Keyboard navigation
  useEffect(() => {
    const labels = question.choices.map((c) => c.label);

    const handleKey = (e: KeyboardEvent) => {
      // Digit keys 1–9 → select choice
      const num = parseInt(e.key);
      if (!isNaN(num) && num >= 1 && num <= labels.length) {
        toggleChoice(labels[num - 1]);
        return;
      }
      if (reviewMode) {
        // Flashcard: → or Enter = 知っている, ← = 知らない
        if (e.key === "ArrowRight" || e.key === "Enter") { onAnswer?.(true);  onNext?.(); return; }
        if (e.key === "ArrowLeft")                        { onAnswer?.(false); onNext?.(); return; }
        return;
      }
      // Enter → submit or advance
      if (e.key === "Enter") {
        if (!submitted) { handleSubmit(); } else { onNext?.(); }
        return;
      }
      // ArrowRight / ArrowLeft
      if (e.key === "ArrowRight" && submitted) { onNext?.(); return; }
      if (e.key === "ArrowLeft") { onPrev?.(); return; }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [question, submitted, toggleChoice, handleSubmit, onNext, onPrev]);

  const correctRate = stat && stat.attempts > 0
    ? Math.round((stat.correct / stat.attempts) * 100)
    : null;

  const isCorrect = submitted && !reviewMode
    ? question.answers.length === selected.size && question.answers.every((a) => selected.has(a))
    : null;

  return (
    <div>
      {/* Progress header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs tabular-nums text-gray-400">
          {currentIndex + 1} / {total}
        </span>
        {correctRate !== null && !reviewMode && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            correctRate >= 80 ? "bg-emerald-50 text-emerald-600" :
            correctRate >= 60 ? "bg-amber-50 text-amber-600" :
            "bg-rose-50 text-rose-500"
          }`}>
            {correctRate}%
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-gray-100 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-gray-900 rounded-full transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
        />
      </div>

      {/* Question */}
      <div className="bg-white rounded-2xl border border-gray-200 px-6 py-5 mb-4">
        {question.isMultiple && (
          <span className="inline-block text-xs font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full mb-3">
            {question.answers.length}つ選択
          </span>
        )}
        <p className="text-gray-900 text-sm md:text-base leading-relaxed font-medium whitespace-pre-wrap">
          {question.question}
        </p>
      </div>

      {/* Choices */}
      <div className="space-y-2 mb-5">
        {question.choices.map((choice, i) => {
          const isSelected = selected.has(choice.label);
          const isAnswer = question.answers.includes(choice.label);

          let ring = "border-gray-200 bg-white";
          let badge = "border-gray-200 bg-white text-gray-400";
          let textColor = "text-gray-800";

          if (submitted) {
            if (isAnswer) {
              ring = "border-emerald-300 bg-emerald-50";
              badge = "border-emerald-500 bg-emerald-500 text-white";
              textColor = "text-emerald-900";
            } else if (isSelected) {
              ring = "border-rose-300 bg-rose-50";
              badge = "border-rose-500 bg-rose-500 text-white";
              textColor = "text-rose-800";
            } else {
              ring = "border-gray-100 bg-gray-50";
              textColor = "text-gray-400";
            }
          } else if (isSelected) {
            ring = "border-blue-400 bg-blue-50";
            badge = "border-blue-500 bg-blue-500 text-white";
          } else {
            ring += " hover:border-gray-300 hover:bg-gray-50";
          }

          return (
            <button
              key={choice.label}
              onClick={() => toggleChoice(choice.label)}
              disabled={submitted}
              className={`w-full text-left border rounded-xl px-4 py-3.5 transition-all duration-100 ${ring} ${submitted ? "cursor-default" : "cursor-pointer"}`}
            >
              <div className="flex items-start gap-3">
                <span className={`shrink-0 w-6 h-6 rounded-lg border text-xs font-bold flex items-center justify-center transition-all ${badge}`}>
                  {i + 1}
                </span>
                <span className={`text-sm leading-relaxed pt-0.5 whitespace-pre-wrap ${textColor}`}>
                  {choice.text}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Submit (quiz mode) */}
      {!submitted && !reviewMode && (
        <button
          onClick={handleSubmit}
          disabled={selected.size === 0}
          className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-25 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors mb-4"
        >
          回答する
          <span className="ml-2 text-xs font-normal opacity-50">Enter</span>
        </button>
      )}

      {/* Result + Explanation */}
      {submitted && (
        <div className={`rounded-2xl border px-5 py-4 mb-4 ${
          reviewMode
            ? "border-gray-200 bg-white"
            : isCorrect
              ? "border-emerald-200 bg-emerald-50"
              : "border-rose-200 bg-rose-50"
        }`}>
          {!reviewMode && (
            <div className="flex items-center gap-2 mb-3">
              {isCorrect ? (
                <><CheckCircle2 size={17} className="text-emerald-500 shrink-0" /><span className="font-semibold text-emerald-700 text-sm">正解</span></>
              ) : (
                <><XCircle size={17} className="text-rose-500 shrink-0" /><span className="font-semibold text-rose-600 text-sm">不正解</span><span className="text-xs text-gray-500 ml-1">正答: {question.answers.join(", ")}</span></>
              )}
            </div>
          )}
          {reviewMode && (
            <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
              正答: {question.answers.join(", ")}
            </p>
          )}
          {question.explanation && (
            <p className={`text-sm leading-relaxed text-gray-700 whitespace-pre-wrap ${!reviewMode ? "border-t border-black/5 pt-3 mt-1" : ""}`}>
              {question.explanation}
            </p>
          )}
          {question.source && (
            <p className="text-xs text-gray-300 mt-3">出典: {question.source}</p>
          )}
        </div>
      )}

      {/* Navigation — quiz mode */}
      {submitted && !reviewMode && (
        <div className="flex gap-2">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="flex items-center justify-center w-12 h-11 rounded-xl border border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-20 transition-all"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="flex-1 h-11 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-20 hover:bg-gray-700 transition-colors flex items-center justify-center gap-1.5"
          >
            {isLast ? "完了" : "次へ"}
            {!isLast && <ChevronRight size={16} />}
            {!isLast && <span className="text-xs font-normal opacity-40 ml-1">Enter</span>}
          </button>
        </div>
      )}

      {/* Navigation — flashcard mode */}
      {reviewMode && (
        <div className="flex gap-2">
          <button
            onClick={() => { onAnswer?.(false); onNext?.(); }}
            disabled={!hasNext && !isLast}
            className="flex-1 h-12 rounded-xl border-2 border-rose-200 text-rose-500 bg-rose-50 hover:bg-rose-100 hover:border-rose-300 font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-30"
          >
            <ThumbsDown size={15} strokeWidth={2} />
            知らない
            <span className="text-xs font-normal opacity-50 ml-0.5">←</span>
          </button>
          <button
            onClick={() => { onAnswer?.(true); onNext?.(); }}
            disabled={!hasNext && !isLast}
            className="flex-1 h-12 rounded-xl border-2 border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300 font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-30"
          >
            <ThumbsUp size={15} strokeWidth={2} />
            知っている
            <span className="text-xs font-normal opacity-50 ml-0.5">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
