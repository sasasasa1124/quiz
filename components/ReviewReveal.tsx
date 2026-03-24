"use client";

import { ChevronRight, CheckCircle2, Sparkles } from "lucide-react";
import type { Choice, Question } from "@/lib/types";
import { useSettings } from "@/lib/settings-context";
import SuggestPanel from "@/components/SuggestPanel";
import { RichText } from "@/components/RichText";

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
        <div className="max-w-3xl mx-auto w-full">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Answer</p>
            {onAiExplain && (
              <button onClick={onAiExplain} className="flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:text-scholion-500 hover:border-scholion-200 transition-colors">
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
                  <RichText text={c.text} className="text-sm lg:text-base text-emerald-900 leading-snug" />
                </div>
              ))
            }
          </div>

          {question.explanation && (
            <>
              <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider mb-2">Explanation</p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4">
                <RichText text={question.explanation} block className="text-sm leading-relaxed text-amber-900" />
              </div>
            </>
          )}
          {/* Sources */}
          {question.explanationSources?.length > 0 && (
            <div className="mt-4">
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
      </div>

      {/* Next */}
      <div className="shrink-0 px-4 sm:px-8 py-4 border-t border-gray-100">
        <div className="max-w-3xl mx-auto w-full">
          <button
            onClick={onNext}
            className="w-full h-10 rounded-xl bg-scholion-500 text-white text-sm font-semibold hover:bg-scholion-600 transition-colors flex items-center justify-center gap-1.5"
          >
            {isLast ? <CheckCircle2 size={16} /> : <><ChevronRight size={15} /> <span className="text-xs opacity-40 hidden sm:inline">→ Enter</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}
