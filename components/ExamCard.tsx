"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ExamMeta } from "@/lib/types";
import { useSettings } from "@/lib/settings-context";

interface Props {
  exam: ExamMeta;
  stats?: { correct: number; answered: number; total: number };
  mode: "quiz" | "review";
}

export default function ExamCard({ exam, stats, mode }: Props) {
  const router = useRouter();
  const { t } = useSettings();
  const pct = stats && stats.answered > 0
    ? Math.round((stats.correct / stats.total) * 100)
    : null;

  const go = (filter: "all" | "wrong") =>
    router.push(`/quiz/${exam.id}?mode=${mode}&filter=${filter}`);

  const hasWrong = stats && stats.answered > 0;

  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarWidth(pct ?? 0));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-gray-300">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 text-sm leading-snug">{exam.name}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{exam.questionCount} Q</p>
        </div>
        {pct !== null && (
          <div className="text-right shrink-0">
            <div className={`text-2xl font-bold ${pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-500" : "text-rose-500"}`}>
              {pct}%
            </div>
            <div className="text-xs text-gray-400">{stats!.answered}/{stats!.total}</div>
          </div>
        )}
      </div>

      {stats && stats.answered > 0 && (
        <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out ${pct! >= 80 ? "bg-emerald-500" : pct! >= 60 ? "bg-amber-400" : "bg-rose-400"}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => go("all")}
          className="flex-1 py-2 text-sm font-medium rounded-xl bg-gray-900 text-white hover:bg-gray-700 transition-colors"
        >
          {t("startAll")}
        </button>
        <button
          onClick={() => go("wrong")}
          disabled={!hasWrong}
          className="flex-1 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {t("wrong")}
        </button>
      </div>
    </div>
  );
}
