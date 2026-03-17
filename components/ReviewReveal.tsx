"use client";

import { ChevronRight, CheckCircle2, Sparkles } from "lucide-react";
import type { Question } from "@/lib/types";

interface Props {
  question: Question;
  onNext: () => void;
  isLast: boolean;
  onAiExplain?: () => void;
}

export default function ReviewReveal({ question, onNext, isLast, onAiExplain }: Props) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Answer</p>
          {onAiExplain && (
            <button onClick={onAiExplain} className="text-gray-300 hover:text-violet-500 transition-colors" title="AI Explain">
              <Sparkles size={12} />
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2 mb-6">
          {question.choices
            .filter((c) => question.answers.includes(c.label))
            .map((c) => (
              <div key={c.label} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="shrink-0 w-6 h-6 rounded-md bg-emerald-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {question.choices.findIndex(ch => ch.label === c.label) + 1}
                </span>
                <span className="text-sm text-emerald-900 leading-snug">{c.text}</span>
              </div>
            ))
          }
        </div>

        {question.explanation && (
          <>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Explanation</p>
            <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{question.explanation}</p>
          </>
        )}
        {question.source && <p className="text-xs text-gray-300 mt-4">Source: {question.source}</p>}
      </div>

      {/* Next */}
      <div className="shrink-0 px-4 sm:px-8 py-4 border-t border-gray-100">
        <button
          onClick={onNext}
          className="w-full h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors flex items-center justify-center gap-1.5"
        >
          {isLast ? <CheckCircle2 size={16} /> : <><ChevronRight size={15} /> <span className="text-xs opacity-40 hidden sm:inline">Enter</span></>}
        </button>
      </div>
    </div>
  );
}
