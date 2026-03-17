"use client";

import { Check, X } from "lucide-react";
import type { Question, QuizStat } from "@/lib/types";

interface Props {
  question: Question;
  selected: Set<string>;
  onToggle: (label: string) => void;
  submitted: boolean;
  stat?: QuizStat;
  reviewMode?: boolean;
}

export default function QuizQuestion({
  question,
  selected,
  onToggle,
  submitted,
  stat,
  reviewMode = false,
}: Props) {
  const lastResult = stat; // 0 | 1 | undefined

  return (
    <div className="flex flex-col h-full">
      {/* Meta badges */}
      <div className="flex items-center gap-2 mb-4 shrink-0">
        {question.isMultiple && (
          <span className="text-xs font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
            Select {question.answers.length}
          </span>
        )}
        {!reviewMode && lastResult !== undefined && (
          <span className={`flex items-center justify-center w-5 h-5 rounded-full ${
            lastResult === 1 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
          }`}>
            {lastResult === 1 ? <Check size={11} strokeWidth={2.5} /> : <X size={11} strokeWidth={2.5} />}
          </span>
        )}
      </div>

      {/* Question text */}
      <div className="bg-gray-50 rounded-xl px-5 py-4 mb-4 shrink-0">
        <div
          className="text-gray-900 text-sm leading-relaxed font-medium whitespace-pre-wrap [&_img]:max-w-full [&_img]:rounded-lg [&_img]:mt-2"
          dangerouslySetInnerHTML={{ __html: question.question }}
        />
      </div>

      {/* Choices — scrollable if many */}
      <div className="space-y-2 overflow-y-auto flex-1 pr-1">
        {question.choices.map((choice, i) => {
          const isSelected = selected.has(choice.label);
          const isAnswer = question.answers.includes(choice.label);

          let ring = "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50";
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
          }

          return (
            <button
              key={choice.label}
              onClick={() => onToggle(choice.label)}
              disabled={submitted}
              className={`w-full text-left border rounded-xl px-4 py-3 transition-all duration-100 active:scale-[0.97] ${ring} ${submitted ? "cursor-default option-reveal" : "cursor-pointer"}`}
              style={submitted ? { animationDelay: `${i * 50}ms`, animationFillMode: "both" } : undefined}
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
    </div>
  );
}
