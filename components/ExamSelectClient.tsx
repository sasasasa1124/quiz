"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, ChevronRight } from "lucide-react";
import type { ExamMeta, QuizStats } from "@/lib/types";
import PageHeader from "./PageHeader";

interface Props {
  exams: ExamMeta[];
  mode: "quiz" | "review";
}

function loadStats(examId: string): QuizStats {
  try {
    const raw = JSON.parse(localStorage.getItem(`quiz-stats-${examId}`) ?? "{}");
    const out: QuizStats = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === 0 || v === 1) out[k] = v as 0 | 1;
    }
    return out;
  } catch { return {}; }
}

type LangFilter = "all" | "ja" | "en";

export default function ExamSelectClient({ exams, mode }: Props) {
  const router = useRouter();
  const [langFilter, setLangFilter] = useState<LangFilter>("all");
  const [statsMap, setStatsMap] = useState<Record<string, { pct: number | null; answered: number; total: number; wrongCount: number }>>({});

  useEffect(() => {
    const map: typeof statsMap = {};
    for (const exam of exams) {
      const stats = loadStats(exam.id);
      const keys = Object.keys(stats).filter((k) => stats[k] === 0 || stats[k] === 1);
      const correct = keys.filter((k) => stats[k] === 1).length;
      const wrongCount = keys.filter((k) => stats[k] === 0).length;
      map[exam.id] = {
        pct: keys.length > 0 ? Math.round((correct / exam.questionCount) * 100) : null,
        answered: keys.length,
        total: exam.questionCount,
        wrongCount,
      };
    }
    setStatsMap(map);
  }, [exams]);

  const filtered = exams.filter((e) => langFilter === "all" || e.language === langFilter);

  const modeLabel = mode === "quiz" ? "クイズ" : "フラッシュカード";

  const langToggle = (
    <div className="flex gap-1">
      {(["all", "ja", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLangFilter(l)}
          className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
            langFilter === l
              ? "bg-gray-900 text-white border-gray-900"
              : "border-gray-200 text-gray-500 hover:border-gray-400"
          }`}
        >
          {l === "all" ? "すべて" : l === "ja" ? "JA" : "EN"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
      <PageHeader back={{ href: "/" }} title={modeLabel} right={langToggle} />

      <div className="flex-1 px-8 py-6 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4 max-w-3xl mx-auto">
          {filtered.map((exam) => {
            const s = statsMap[exam.id];
            const pct = s?.pct ?? null;

            return (
              <div key={exam.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col">
                <button
                  onClick={() => router.push(`/quiz/${mode}/${exam.id}`)}
                  className="flex-1 text-left px-5 py-4 flex items-start gap-3 hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm leading-snug">{exam.name}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {exam.questionCount} 問
                      {s && s.answered > 0 && (
                        <span className="ml-2 text-gray-300">· {s.answered}/{s.total} 回答済</span>
                      )}
                    </p>
                    {s && s.answered > 0 && pct !== null && (
                      <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-rose-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    {pct !== null && (
                      <span className={`text-base font-bold tabular-nums ${pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-500" : "text-rose-500"}`}>
                        {pct}%
                      </span>
                    )}
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-400 transition-colors" />
                  </div>
                </button>

                {s && s.wrongCount > 0 && (
                  <div className="px-5 py-2.5 flex items-center gap-2 border-t border-gray-100">
                    <RotateCcw size={12} className="text-rose-300 shrink-0" />
                    <span className="text-xs text-rose-400">誤答 {s.wrongCount} 問</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
