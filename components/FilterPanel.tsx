"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { FilterConfig, RichQuizStats } from "@/lib/types";
import { DEFAULT_FILTER_CONFIG } from "@/lib/types";
import type { Question } from "@/lib/types";
import { useSettings } from "@/lib/settings-context";

interface FilterPanelProps {
  filterConfig: FilterConfig;
  onApply: (config: FilterConfig) => void;
  questions: Question[];
  richStats: RichQuizStats;
}

function countMatching(questions: Question[], config: FilterConfig, richStats: RichQuizStats): number {
  const today = new Date().toISOString().slice(0, 10);
  return questions.filter((q) => {
    const s = richStats[String(q.id)];
    if (!s) {
      // Never attempted
      if (config.neverAttempted) return true;
      if (config.notSeenInDays !== null) return true; // never answered = infinitely old
      return false;
    }
    const acc = s.attempts > 0 ? (s.correctCount / s.attempts) * 100 : 0;
    if (config.dueForReview && !(s.nextReviewAt && s.nextReviewAt <= today)) return false;
    if (config.maxAttempts !== null && s.attempts > config.maxAttempts) return false;
    if (config.maxAccuracy !== null && acc > config.maxAccuracy) return false;
    if (config.notSeenInDays !== null) {
      if (!s.updatedAt) return true;
      const days = (Date.now() - new Date(s.updatedAt).getTime()) / 86_400_000;
      if (days < config.notSeenInDays) return false;
    }
    return true;
  }).length;
}

export default function FilterPanel({ filterConfig, onApply, questions, richStats }: FilterPanelProps) {
  const { t } = useSettings();
  const [draft, setDraft] = useState<FilterConfig>(filterConfig);

  const previewCount = countMatching(questions, draft, richStats);

  const update = <K extends keyof FilterConfig>(key: K, value: FilterConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-72">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">{t("customFilter")}</p>

      {/* Never attempted */}
      <label className="flex items-center gap-2.5 mb-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.neverAttempted}
          onChange={(e) => update("neverAttempted", e.target.checked)}
          className="rounded border-gray-300 accent-gray-800"
        />
        <span className="text-sm text-gray-700">{t("includeUnattempted")}</span>
      </label>

      {/* Due for review */}
      <label className="flex items-center gap-2.5 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.dueForReview}
          onChange={(e) => update("dueForReview", e.target.checked)}
          className="rounded border-gray-300 accent-gray-800"
        />
        <span className="text-sm text-gray-700">{t("sm2ReviewDue")}</span>
      </label>

      {/* Max attempts */}
      <div className="mb-3">
        <label className="text-sm text-gray-700 block mb-1">{t("attemptsMax")}</label>
        <input
          type="number"
          min={1}
          placeholder={t("noLimit")}
          value={draft.maxAttempts ?? ""}
          onChange={(e) => update("maxAttempts", e.target.value === "" ? null : Number(e.target.value))}
          className="w-full h-8 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
      </div>

      {/* Max accuracy */}
      <div className="mb-3">
        <label className="text-sm text-gray-700 block mb-1">{t("accuracyMax")}</label>
        <input
          type="number"
          min={0}
          max={100}
          placeholder={t("noLimit")}
          value={draft.maxAccuracy ?? ""}
          onChange={(e) => update("maxAccuracy", e.target.value === "" ? null : Number(e.target.value))}
          className="w-full h-8 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
      </div>

      {/* Not seen in N days */}
      <div className="mb-4">
        <label className="text-sm text-gray-700 block mb-1">{t("notSeenInDays")}</label>
        <input
          type="number"
          min={1}
          placeholder={t("noLimit")}
          value={draft.notSeenInDays ?? ""}
          onChange={(e) => update("notSeenInDays", e.target.value === "" ? null : Number(e.target.value))}
          className="w-full h-8 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setDraft(DEFAULT_FILTER_CONFIG)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <RotateCcw size={11} />
          {t("reset")}
        </button>
        <button
          onClick={() => onApply(draft)}
          className="h-8 px-4 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 transition-colors"
        >
          {t("apply")} ({previewCount})
        </button>
      </div>
    </div>
  );
}
