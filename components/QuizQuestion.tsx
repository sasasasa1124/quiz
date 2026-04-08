"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";
import type { Question, QuizStat } from "@/lib/types";
import { RichText } from "@/components/RichText";

interface Props {
  question: Question;
  selected: Set<string>;
  onToggle: (label: string) => void;
  submitted: boolean;
  stat?: QuizStat;
  reviewMode?: boolean;
}

/** Split question text into context (scenario) + final question sentence(s). */
function splitQuestion(text: string): { context: string; finalQuestion: string } {
  // Normalize missing space after period: "past.What" → "past. What"
  const normalized = text.replace(/\.([A-Z'"])/g, ". $1");
  const sentences = normalized.split(/(?<=[.!?])\s+/);

  if (sentences.length <= 1) return { context: "", finalQuestion: text };

  // Walk backward to find the first sentence in the trailing question run
  let qStart = sentences.length - 1;
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i].trim();
    if (/\?/.test(s) || /^(What|Which|How|When|Who|Where|Why|Select)\b/i.test(s)) {
      qStart = i;
    } else {
      break;
    }
  }

  const context = sentences.slice(0, qStart).join(" ").trim();
  const finalQuestion = sentences.slice(qStart).join(" ").trim();
  return { context, finalQuestion };
}

/** Extract abbreviations like (UC), (API), (DMO) from the question text. */
function extractKeywords(text: string): string[] {
  const keywords = new Set<string>();
  const re = /\(([A-Z][A-Z0-9]{1,})\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    keywords.add(m[1]);
  }
  return [...keywords];
}

export default function QuizQuestion({
  question,
  selected,
  onToggle,
  submitted,
  stat,
  reviewMode = false,
}: Props) {
  const lastResult = stat;

  const { context, finalQuestion } = useMemo(
    () => splitQuestion(question.question),
    [question.question]
  );
  const keywords = useMemo(
    () => extractKeywords(question.question),
    [question.question]
  );

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

      {/* Question text — capped height, scrollable if very long */}
      <div className="bg-gray-50 rounded-xl px-5 py-4 lg:px-6 lg:py-5 mb-4 shrink-0 max-h-[25vh] sm:max-h-[40vh] overflow-y-auto border-l-4 border-scholion-300">
        {context ? (
          <>
            <RichText
              text={context}
              block
              keywords={keywords}
              className="text-gray-700 text-sm lg:text-base leading-relaxed [&_img]:max-w-full [&_img]:rounded-lg [&_img]:mt-2"
            />
            <div className="mt-3 pt-3 border-t border-gray-200">
              <RichText
                text={finalQuestion}
                block
                keywords={keywords}
                className="text-gray-900 text-sm lg:text-base leading-relaxed font-medium"
              />
            </div>
          </>
        ) : (
          <RichText
            text={question.question}
            block
            keywords={keywords}
            className="text-gray-900 text-sm lg:text-base leading-relaxed font-medium [&_img]:max-w-full [&_img]:rounded-lg [&_img]:mt-2"
          />
        )}
        {question.source && (
          <a href={question.source} target="_blank" rel="noopener noreferrer" className="hidden sm:block text-[10px] text-gray-300 hover:text-blue-400 mt-2 truncate" title={question.source}>
            Source: {question.source}
          </a>
        )}
        <span className="hidden sm:block text-[10px] text-gray-400 mt-1">
          {question.addedAt ? `Added ${new Date(question.addedAt).toLocaleDateString()}` : ""}
          {question.updatedAt && question.updatedAt !== question.addedAt && (
            <span className="text-sky-500"> · Updated {new Date(question.updatedAt).toLocaleDateString()}</span>
          )}
        </span>
      </div>

      {/* Choices — scrollable if many */}
      <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
        {question.choices.map((choice, i) => {
          const isSelected = selected.has(choice.label);
          const isAnswer = question.answers.includes(choice.label);

          let ring = "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50";
          let badge = "border-gray-200 bg-white text-gray-400";
          let textColor = "text-gray-800";

          if (submitted) {
            if (isAnswer) {
              ring = "border-emerald-500 bg-emerald-100";
              badge = "border-emerald-600 bg-emerald-600 text-white";
              textColor = "text-emerald-950";
            } else if (isSelected) {
              ring = "border-coral-500 bg-coral-50";
              badge = "border-coral-600 bg-coral-600 text-white";
              textColor = "text-coral-900";
            } else {
              ring = "border-gray-100 bg-gray-50/60";
              textColor = "text-gray-300";
            }
          } else if (isSelected) {
            ring = "border-scholion-500 bg-scholion-50";
            badge = "border-scholion-500 bg-scholion-500 text-white";
          }

          return (
            <button
              key={choice.label}
              onClick={() => onToggle(choice.label)}
              disabled={submitted}
              className={`w-full text-left border rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 lg:px-5 lg:py-4 transition-all duration-150 active:scale-[0.97] ${ring} ${submitted ? "cursor-default option-reveal" : "cursor-pointer hover:shadow-sm"}`}
              style={submitted ? { animationDelay: `${i * 50}ms`, animationFillMode: "both" } : undefined}
            >
              <div className="flex items-start gap-2 sm:gap-3">
                <span className={`shrink-0 w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 rounded-lg border text-[10px] sm:text-xs lg:text-sm font-bold flex items-center justify-center transition-all duration-150 ${badge}`}>
                  {choice.label}
                </span>
                <RichText text={choice.text} block className={`text-sm lg:text-base leading-relaxed pt-0.5 ${textColor}`} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
