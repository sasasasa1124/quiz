"use client";

import { ChevronRight, CheckCircle2, Sparkles } from "lucide-react";
import type { Choice, Question } from "@/lib/types";
import { useSettings } from "@/lib/settings-context";
import SuggestPanel from "@/components/SuggestPanel";

interface Props {
  question: Question;
  onNext: () => void;
  isLast: boolean;
  onAiExplain?: () => void;
  questionDbId: string;
  choices: Choice[];
}

export default function ReviewReveal({ question, onNext, isLast, onAiExplain, questionDbId, choices }: Props) {
  const { t } = useSettings();
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Answer</p>
          {onAiExplain && (
            <button onClick={onAiExplain} className="flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:text-violet-500 hover:border-violet-200 transition-colors">
              <Sparkles size={11} />
              {t("explain")}
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2 mb-6">
          {question.choices
            .filter((c) => question.answers.includes(c.label))
            .map((c) => (
              <div key={c.label} className="flex items-start gap-3 px-4 py-3 lg:px-5 lg:py-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="shrink-0 w-6 h-6 lg:w-7 lg:h-7 rounded-lg bg-emerald-500 text-white text-xs lg:text-sm font-bold flex items-center justify-center mt-0.5">
                  {c.label}
                </span>
                <span className="text-sm lg:text-base text-emerald-900 leading-snug">{c.text}</span>
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
        {/* Sources */}
        {(question.source || question.explanationSources?.length > 0) && (
          <div className="mt-4 space-y-1">
            {question.source && (
              <p className="text-xs text-gray-300">
                Question source:{" "}
                <a href={question.source} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-500 underline break-all">
                  {question.source}
                </a>
              </p>
            )}
            {question.explanationSources?.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 font-medium mb-1">References:</p>
                <ul className="space-y-0.5">
                  {question.explanationSources.map((url, i) => (
                    <li key={i}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-500 underline break-all"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {/* Timestamps */}
        {(question.addedAt || question.createdAt) && (
          <p className="text-xs text-gray-400 mt-2">
            {question.addedAt && <>Added: {new Date(question.addedAt).toLocaleDateString()}</>}
            {question.createdAt && question.createdAt !== question.addedAt && (
              <> &middot; Created: {new Date(question.createdAt).toLocaleDateString()}</>
            )}
          </p>
        )}

        <SuggestPanel questionId={questionDbId} choices={choices} />
      </div>

      {/* Next */}
      <div className="shrink-0 px-4 sm:px-8 py-4 border-t border-gray-100">
        <button
          onClick={onNext}
          className="w-full h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors flex items-center justify-center gap-1.5"
        >
          {isLast ? <CheckCircle2 size={16} /> : <><ChevronRight size={15} /> <span className="text-xs opacity-40 hidden sm:inline">→ Enter</span></>}
        </button>
      </div>
    </div>
  );
}
