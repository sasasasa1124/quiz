"use client";

import { useRouter } from "next/navigation";
import type { ExamMeta } from "@/lib/types";

interface Props {
  exam: ExamMeta;
  stats?: { correct: number; answered: number; total: number };
  mode: "quiz" | "review";
}

export default function ExamCard({ exam, stats, mode }: Props) {
  const router = useRouter();
  const pct = stats && stats.answered > 0
    ? Math.round((stats.correct / stats.total) * 100)
    : null;

  const go = (filter: "all" | "wrong") =>
    router.push(`/quiz/${exam.id}?mode=${mode}&filter=${filter}`);

  const hasWrong = stats && stats.answered > 0;

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 text-sm leading-snug">{exam.name}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{exam.questionCount} Q</p>
        </div>
        {pct !== null && (
          <div className="text-right shrink-0">
            <div className={`text-2xl font-bold ${pct >= 80 ? "text-green-600" : pct >= 60 ? "text-yellow-600" : "text-red-500"}`}>
              {pct}%
            </div>
            <div className="text-xs text-gray-400">{stats!.answered}/{stats!.total}</div>
          </div>
        )}
      </div>

      {stats && stats.answered > 0 && (
        <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full ${pct! >= 80 ? "bg-green-500" : pct! >= 60 ? "bg-yellow-400" : "bg-red-400"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => go("all")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            mode === "quiz"
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-purple-600 text-white hover:bg-purple-700"
          }`}
        >
          Start All
        </button>
        <button
          onClick={() => go("wrong")}
          disabled={!hasWrong}
          className="flex-1 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Wrong
        </button>
      </div>
    </div>
  );
}
