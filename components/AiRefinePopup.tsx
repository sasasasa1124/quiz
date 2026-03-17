"use client";

import { useState, useEffect } from "react";
import { Loader2, Wand2, X, CheckCheck, Pencil } from "lucide-react";
import { diffWords } from "diff";
import type { AiRefineResponse } from "@/app/api/ai/refine/route";
import type { Choice } from "@/lib/types";
import { useSettings } from "@/lib/settings-context";

interface Props {
  originalQuestion: string;
  originalChoices: Choice[];
  loading: boolean;
  result: AiRefineResponse | null;
  error: string | null;
  adopting: boolean;
  onAdopt: (edited: { question: string; choices: Choice[] }) => Promise<void>;
  onDismiss: () => void;
}

/** Renders a word-level diff with added/removed highlights */
function DiffText({ original, refined }: { original: string; refined: string }) {
  const parts = diffWords(original, refined);
  const hasChanges = parts.some((p) => p.added || p.removed);

  if (!hasChanges) {
    return <span className="text-gray-500 text-xs italic">—</span>;
  }

  return (
    <span className="text-xs leading-relaxed">
      {parts.map((part, i) => {
        if (part.removed) {
          return (
            <span key={i} className="bg-rose-100 text-rose-600 line-through rounded px-0.5">
              {part.value}
            </span>
          );
        }
        if (part.added) {
          return (
            <span key={i} className="bg-emerald-100 text-emerald-700 font-medium rounded px-0.5">
              {part.value}
            </span>
          );
        }
        return <span key={i} className="text-gray-700">{part.value}</span>;
      })}
    </span>
  );
}

function hasAnyChange(original: string, refined: string): boolean {
  return diffWords(original, refined).some((p) => p.added || p.removed);
}

export default function AiRefinePopup({
  originalQuestion,
  originalChoices,
  loading,
  result,
  error,
  adopting,
  onAdopt,
  onDismiss,
}: Props) {
  const { t } = useSettings();

  const [editMode, setEditMode] = useState(false);
  const [editedQuestion, setEditedQuestion] = useState("");
  const [editedChoices, setEditedChoices] = useState<Choice[]>([]);

  // Reset edit state when a new result arrives
  useEffect(() => {
    if (result) {
      setEditedQuestion(result.question);
      setEditedChoices(result.choices.map((c) => ({ ...c })));
      setEditMode(false);
    }
  }, [result]);

  const questionChanged = result ? hasAnyChange(originalQuestion, result.question) : false;
  const changedChoices = result
    ? result.choices.filter((c) => {
        const orig = originalChoices.find((o) => o.label === c.label);
        return orig ? hasAnyChange(orig.text, c.text) : false;
      })
    : [];
  const hasChanges = questionChanged || changedChoices.length > 0;

  return (
    <div className="fixed bottom-20 right-4 sm:right-8 z-60 w-80 sm:w-[26rem] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-white shrink-0">
        <div className="flex items-center gap-2">
          <Wand2 size={13} className="text-amber-500" />
          <span className="text-sm font-semibold text-gray-800">{t("refine")}</span>
        </div>
        <div className="flex items-center gap-1">
          {result && hasChanges && (
            <button
              onClick={() => setEditMode((v) => !v)}
              className={`p-1 rounded-lg transition-colors ${
                editMode
                  ? "bg-amber-100 text-amber-700"
                  : "text-gray-400 hover:bg-gray-100"
              }`}
              title={editMode ? "View diff" : "Edit"}
            >
              <Pencil size={12} />
            </button>
          )}
          <button
            onClick={onDismiss}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4 overflow-y-auto max-h-96">
        {loading && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 size={20} className="animate-spin text-amber-400" />
            <span className="text-xs text-gray-400">{t("aiRefining")}</span>
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-500 leading-relaxed">{error}</p>
        )}

        {result && !hasChanges && (
          <p className="text-xs text-gray-400 py-4 text-center">{t("aiRefineNoChanges")}</p>
        )}

        {result && hasChanges && (
          editMode ? (
            /* Edit mode */
            <div className="space-y-3">
              {questionChanged && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    {t("aiRefineQuestion")}
                  </p>
                  <textarea
                    value={editedQuestion}
                    onChange={(e) => setEditedQuestion(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                  />
                </div>
              )}
              {changedChoices.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    {t("aiRefineChoices")}
                  </p>
                  <div className="space-y-2">
                    {editedChoices.map((c, idx) => {
                      const isChanged = changedChoices.some((cc) => cc.label === c.label);
                      if (!isChanged) return null;
                      return (
                        <div key={c.label} className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-400 shrink-0">{c.label}.</span>
                          <input
                            type="text"
                            value={c.text}
                            onChange={(e) =>
                              setEditedChoices((prev) =>
                                prev.map((ec, i) => i === idx ? { ...ec, text: e.target.value } : ec)
                              )
                            }
                            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Diff view */
            <>
              {questionChanged && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    {t("aiRefineQuestion")}
                  </p>
                  <div className="bg-gray-50 rounded-xl p-3 leading-relaxed">
                    <DiffText original={originalQuestion} refined={result.question} />
                  </div>
                </div>
              )}

              {changedChoices.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    {t("aiRefineChoices")}
                  </p>
                  <div className="space-y-2">
                    {changedChoices.map((refined) => {
                      const orig = originalChoices.find((o) => o.label === refined.label)!;
                      return (
                        <div key={refined.label} className="bg-gray-50 rounded-xl p-3">
                          <span className="text-[10px] font-bold text-gray-400 mr-2">{refined.label}.</span>
                          <DiffText original={orig.text} refined={refined.text} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {result.changesSummary && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    {t("aiRefineChanges")}
                  </p>
                  <p className="text-xs text-gray-500 leading-relaxed">{result.changesSummary}</p>
                </div>
              )}
            </>
          )
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
            onClick={() => onAdopt({ question: editedQuestion, choices: editedChoices })}
            disabled={adopting || !hasChanges}
            className="flex-1 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
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
