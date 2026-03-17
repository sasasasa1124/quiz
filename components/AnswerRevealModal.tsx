"use client";

import { useEffect } from "react";
import { CheckCircle2, XCircle, ChevronRight, Sparkles } from "lucide-react";
import type { Question } from "@/lib/types";

interface Props {
  question: Question;
  isCorrect: boolean;
  isLast: boolean;
  onNext: () => void;
  onAiExplain: () => void;
}

export default function AnswerRevealModal({ question, isCorrect, isLast, onNext, onAiExplain }: Props) {
  // Keyboard: Escape / N / Enter → next
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "n" || e.key === "N" || e.key === "Enter") {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNext]);

  const correctChoices = question.choices.filter((c) => question.answers.includes(c.label));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onNext}
      />

      {/* Modal card — centered on sm+, bottom-sheet on mobile */}
      <div className="
        modal-slide-up
        relative bg-white w-full max-w-lg
        rounded-t-2xl sm:rounded-2xl
        shadow-2xl
        flex flex-col
        max-h-[85vh]
        mt-auto sm:mt-0
      ">
        {/* Header */}
        <div className={`shrink-0 flex items-center gap-3 px-6 pt-5 pb-4 border-b border-gray-100`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCorrect ? "bg-emerald-100" : "bg-rose-100"}`}>
            {isCorrect
              ? <CheckCircle2 size={22} className="text-emerald-500" strokeWidth={2.5} />
              : <XCircle size={22} className="text-rose-500" strokeWidth={2.5} />
            }
          </div>
          <div>
            <p className={`font-bold text-lg leading-none ${isCorrect ? "text-emerald-600" : "text-rose-600"}`}>
              {isCorrect ? "Correct!" : "Incorrect"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {isCorrect
                ? "Great job!"
                : `Correct: ${question.answers.join(", ")}`
              }
            </p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {/* Correct answers */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Correct Answer</p>
            <div className="flex flex-col gap-2">
              {correctChoices.map((c) => (
                <div key={c.label} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="shrink-0 w-6 h-6 rounded-md bg-emerald-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {c.label}
                  </span>
                  <span className="text-sm text-emerald-900 leading-snug">{c.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Explanation */}
          {question.explanation && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Explanation</p>
              <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{question.explanation}</p>
            </div>
          )}

          {question.source && (
            <p className="text-xs text-gray-300">Source: {question.source}</p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onAiExplain}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:text-violet-500 hover:border-violet-200 transition-colors"
          >
            <Sparkles size={13} />
            AI Explain
          </button>
          <button
            onClick={onNext}
            autoFocus
            className="flex items-center gap-1.5 px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors"
          >
            {isLast ? "Finish" : <><ChevronRight size={15} /> Next</>}
          </button>
        </div>
      </div>
    </div>
  );
}
