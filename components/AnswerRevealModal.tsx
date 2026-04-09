"use client";

import { useEffect, useRef, useCallback } from "react";
import { CheckCircle2, XCircle, ChevronRight, Sparkles } from "lucide-react";
import type { Choice, Question } from "@/lib/types";
import { useSettings } from "@/lib/settings-context";
import SuggestPanel from "@/components/SuggestPanel";
import { RichText } from "@/components/RichText";

interface Props {
  question: Question;
  isCorrect: boolean;
  isLast: boolean;
  onNext: () => void;
  onAiExplain: () => void;
  questionDbId: string;
  choices: Choice[];
  anyPopupOpen?: boolean;
}

export default function AnswerRevealModal({ question, isCorrect, isLast, onNext, onAiExplain, questionDbId, choices, anyPopupOpen }: Props) {
  const { t } = useSettings();
  // Keyboard: Escape / N / Enter → next
  // 150ms guard prevents the same keydown that triggered Submit from instantly dismissing the modal
  useEffect(() => {
    const ready = Date.now();
    const handler = (e: KeyboardEvent) => {
      if (anyPopupOpen) return; // AI popup handles its own keys
      if (Date.now() - ready < 150) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!e.isComposing && (e.key === "Escape" || e.key === "n" || e.key === "N" || e.key === "Enter" || e.key === "ArrowRight")) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNext, anyPopupOpen]);

  const correctChoices = question.choices.filter((c) => question.answers.includes(c.label));

  const swipeTouchStartX = useRef<number | null>(null);
  const onSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    swipeTouchStartX.current = e.touches[0].clientX;
  }, []);
  const onSwipeTouchEnd = useCallback((e: React.TouchEvent) => {
    if (swipeTouchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeTouchStartX.current;
    swipeTouchStartX.current = null;
    if (Math.abs(dx) >= 50 && dx < 0) onNext(); // swipe left = next
  }, [onNext]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onNext}
        onTouchStart={onSwipeTouchStart}
        onTouchEnd={onSwipeTouchEnd}
      />

      {/* Modal card — centered on sm+, bottom-sheet on mobile */}
      <div className={`
        modal-slide-up
        relative w-full max-w-lg
        rounded-t-2xl sm:rounded-2xl
        shadow-2xl
        flex flex-col
        max-h-[85vh]
        mt-auto sm:mt-0
        ${isCorrect ? "bg-white" : "bg-coral-50"}
      `}>
        {/* Header */}
        <div className={`shrink-0 flex items-center gap-3 px-6 pt-5 pb-4 border-b ${isCorrect ? "bg-emerald-50 border-emerald-100 rounded-t-2xl sm:rounded-t-2xl" : "border-coral-100"}`}>
          <div className={`icon-bounce w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCorrect ? "bg-emerald-100" : "bg-coral-100"}`}>
            {isCorrect
              ? <CheckCircle2 size={22} className="text-emerald-500" strokeWidth={2.5} />
              : <XCircle size={22} className="text-coral-500" strokeWidth={2.5} />
            }
          </div>
          <div>
            <p className={`font-bold text-lg leading-none ${isCorrect ? "text-emerald-600" : "text-coral-600"}`}>
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
          {/* Correct answers — only shown when incorrect */}
          {!isCorrect && (
            <div>
              <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider mb-2">{t("correctAnswer")}</p>
              <div className="flex flex-col gap-2">
                {correctChoices.map((c) => (
                  <div key={c.label} className="flex items-start gap-3 px-4 py-3 lg:px-5 lg:py-4 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="shrink-0 w-6 h-6 lg:w-7 lg:h-7 rounded-lg bg-emerald-500 text-white text-xs lg:text-sm font-bold flex items-center justify-center mt-0.5">
                      {c.label}
                    </span>
                    <RichText text={c.text} block className="text-sm lg:text-base text-emerald-900 leading-snug" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Core Concept */}
          {question.coreConcept && (
            <div className="rounded-xl bg-scholion-50 border border-scholion-200 px-4 py-3">
              <p className="text-[10px] font-semibold text-scholion-500 uppercase tracking-wide mb-1">Core Concept</p>
              <p className="text-xs font-medium text-scholion-700 leading-relaxed">{question.coreConcept}</p>
            </div>
          )}

          {/* Explanation */}
          <div>
            <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider mb-2">{t("aiExplanation")}</p>
            {question.explanation ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4">
                <RichText text={question.explanation} block className="text-sm leading-relaxed text-amber-900" />
              </div>
            ) : (
              <p className="text-sm text-gray-300">—</p>
            )}
          </div>

          {/* Sources */}
          {question.explanationSources && question.explanationSources.length > 0 && (
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
          {/* Timestamps */}
          {(question.addedAt || question.createdAt) && (
            <p className="text-xs text-gray-400">
              {question.addedAt && <>Added: {new Date(question.addedAt).toLocaleDateString()}</>}
              {question.createdAt && question.createdAt !== question.addedAt && (
                <> &middot; Created: {new Date(question.createdAt).toLocaleDateString()}</>
              )}
            </p>
          )}

          <SuggestPanel questionId={questionDbId} choices={choices} />
        </div>

        {/* Footer */}
        <div className={`shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t ${isCorrect ? "border-gray-100" : "border-coral-100"}`}>
          <button
            onClick={onAiExplain}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:text-scholion-500 hover:border-scholion-200 transition-colors"
          >
            <Sparkles size={13} />
            {t("explain")}
          </button>
          <button
            onClick={onNext}
            className="flex items-center gap-1.5 h-10 px-5 bg-scholion-500 text-white text-sm font-semibold rounded-xl hover:bg-scholion-600 transition-colors"
          >
            {isLast ? "Finish" : <><ChevronRight size={15} /> Next</>}
          </button>
        </div>
      </div>
    </div>
  );
}
