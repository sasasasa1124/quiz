"use client";

import { Loader2, ShieldCheck, ShieldAlert, X, CheckCheck } from "lucide-react";
import type { AiFactCheckResponse } from "@/app/api/ai/factcheck/route";
import type { Choice } from "@/lib/types";
import { useSettings } from "@/lib/settings-context";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function HighlightedText({ text, phrases }: { text: string; phrases: string[] }) {
  if (!phrases || phrases.length === 0) return <>{text}</>;
  const escaped = phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) => {
        const isMatch = phrases.some((p) => p.toLowerCase() === part.toLowerCase());
        return isMatch
          ? <strong key={i} className="font-semibold text-gray-950">{part}</strong>
          : <span key={i}>{part}</span>;
      })}
    </>
  );
}

interface Props {
  loading: boolean;
  result: AiFactCheckResponse | null;
  error: string | null;
  adopting: boolean;
  currentAnswers: string[];
  onAdopt: (newAnswers: string[]) => Promise<void>;
  onDismiss: () => void;
  question?: string;
  choices?: Choice[];
}

const confidenceLabel: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const confidenceClass: Record<string, string> = {
  high: "text-emerald-600 bg-emerald-50",
  medium: "text-amber-600 bg-amber-50",
  low: "text-rose-600 bg-rose-50",
};

export default function AiFactCheckPopup({
  loading,
  result,
  error,
  adopting,
  currentAnswers,
  onAdopt,
  onDismiss,
  question = "",
  choices = [],
}: Props) {
  const { t } = useSettings();

  const answersChanged = result
    ? JSON.stringify([...result.correctAnswers].sort()) !== JSON.stringify([...currentAnswers].sort())
    : false;

  return (
    <div className="fixed bottom-20 right-4 sm:right-8 z-60 w-80 sm:w-[26rem] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-white shrink-0">
        <div className="flex items-center gap-2">
          {result && !result.isCorrect
            ? <ShieldAlert size={13} className="text-rose-500" />
            : <ShieldCheck size={13} className="text-indigo-500" />
          }
          <span className="text-sm font-semibold text-gray-800">{t("factCheck")}</span>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4 overflow-y-auto max-h-96">
        {loading && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 size={20} className="animate-spin text-indigo-400" />
            <span className="text-xs text-gray-400">{t("aiFactChecking")}</span>
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-500 leading-relaxed">{error}</p>
        )}

        {result && (
          <>
            {/* Status banner */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${
              result.isCorrect
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}>
              {result.isCorrect
                ? <ShieldCheck size={14} />
                : <ShieldAlert size={14} />
              }
              <span>{result.isCorrect ? t("aiFactCheckCorrect") : t("aiFactCheckWrong")}</span>
              {result.confidence && (
                <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${confidenceClass[result.confidence] ?? "text-gray-500 bg-gray-100"}`}>
                  {confidenceLabel[result.confidence] ?? result.confidence}
                </span>
              )}
            </div>

            {/* Key Phrases */}
            {question && result.highlights && result.highlights.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Key Phrases
                </p>
                <p className="text-xs text-gray-700 leading-relaxed">
                  <HighlightedText text={stripHtml(question)} phrases={result.highlights} />
                </p>
              </div>
            )}

            {/* AI suggested answers (if different) */}
            {answersChanged && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Suggested Answer
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.correctAnswers.map((a) => (
                    <span key={a} className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500 text-white text-xs font-bold">
                      {a}
                    </span>
                  ))}
                  <span className="text-xs text-gray-400 self-center ml-1">
                    (current: {currentAnswers.join(", ")})
                  </span>
                </div>
              </div>
            )}

            {/* Issues */}
            {result.issues && result.issues.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Issues
                </p>
                <ul className="space-y-1">
                  {result.issues.map((issue, i) => (
                    <li key={i} className="text-xs text-rose-600 leading-relaxed flex gap-1.5">
                      <span className="shrink-0 mt-0.5">•</span>
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Explanation */}
            {result.explanation && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Explanation
                </p>
                <p className="text-xs text-gray-700 leading-relaxed">{result.explanation}</p>
              </div>
            )}

            {/* Sources */}
            {result.sources && result.sources.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Sources
                </p>
                <ul className="space-y-1">
                  {result.sources.map((src, i) => (
                    <li key={i}>
                      <span className="text-xs text-indigo-500 break-all leading-relaxed">{src}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer — only show adopt button when answers differ */}
      {result && answersChanged && (
        <div className="px-4 pb-4 pt-2 flex gap-2 border-t border-gray-100 shrink-0">
          <button
            onClick={onDismiss}
            className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 transition-colors"
          >
            {t("dismiss")}
          </button>
          <button
            onClick={() => onAdopt(result.correctAnswers)}
            disabled={adopting}
            className="flex-1 py-2 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
          >
            {adopting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <CheckCheck size={13} />
            )}
            {t("adopt")}
          </button>
        </div>
      )}
      {result && !answersChanged && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 shrink-0">
          <button
            onClick={onDismiss}
            className="w-full py-2 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 transition-colors"
          >
            {t("dismiss")}
          </button>
        </div>
      )}
    </div>
  );
}
