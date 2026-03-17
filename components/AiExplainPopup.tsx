"use client";

import { Loader2, Sparkles, X, CheckCheck } from "lucide-react";
import type { AiExplainResponse } from "@/app/api/ai/explain/route";
import { useSettings } from "@/lib/settings-context";

interface Props {
  loading: boolean;
  result: AiExplainResponse | null;
  error: string | null;
  adopting: boolean;
  onAdopt: () => Promise<void>;
  onDismiss: () => void;
}

export default function AiExplainPopup({ loading, result, error, adopting, onAdopt, onDismiss }: Props) {
  const { t } = useSettings();

  return (
    <div className="fixed bottom-20 right-4 sm:right-8 z-60 w-80 sm:w-[22rem] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-white shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-violet-500" />
          <span className="text-sm font-semibold text-gray-800">{t("explain")}</span>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3 overflow-y-auto max-h-72">
        {loading && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 size={20} className="animate-spin text-violet-400" />
            <span className="text-xs text-gray-400">{t("aiExplaining")}</span>
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-500 leading-relaxed">{error}</p>
        )}

        {result && (
          <>
            {/* Suggested answers */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                {t("aiSuggestedAnswer")}
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {result.answers.map((a) => (
                  <span
                    key={a}
                    className="w-7 h-7 rounded-lg bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>

            {/* Explanation */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                {t("aiExplanation")}
              </p>
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                {result.explanation}
              </p>
            </div>

            {/* Reasoning */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                {t("aiReasoning")}
              </p>
              <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap">
                {result.reasoning}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {result && (
        <div className="px-4 pb-4 pt-2 flex gap-2 border-t border-gray-100 shrink-0">
          <button
            onClick={onDismiss}
            className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 transition-colors"
          >
            {t("dismiss")}
          </button>
          <button
            onClick={onAdopt}
            disabled={adopting}
            className="flex-1 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
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
    </div>
  );
}
