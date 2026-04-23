"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, ChevronRight, Download, Upload, Plus, X, Loader2, Search, Sparkles } from "lucide-react";
import type { ExamMeta } from "@/lib/types";
import { t, type Locale } from "@/lib/i18n";
import { useSetHeader } from "@/lib/header-context";
import { useSettings } from "@/lib/settings-context";

const LANG_LABELS: Record<Locale, string> = { en: "EN", ja: "JA", zh: "ZH", ko: "KO" };

interface Props {
  exams: ExamMeta[];
  mode: "quiz" | "review" | "answers";
}

type UploadStatus = "idle" | "uploading" | "done" | "error";

const CSV_TEMPLATE = `duplicate,#,question,choices,answer,explanation,source
,1,Enter question text here,A. Choice A | B. Choice B | C. Choice C | D. Choice D,A,Enter explanation here,Source URL
,2,Multiple answer example,A. Choice A | B. Choice B | C. Choice C | D. Choice D | E. Choice E,"A,C",Enter explanation here,Source URL
`;

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "quiz_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function uploadFile(file: File): Promise<ExamMeta> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) throw new Error(await res.text());
  const { exam } = await res.json() as { exam: ExamMeta };
  return exam;
}

export default function ExamSelectClient({ exams: initialExams, mode }: Props) {
  const router = useRouter();
  const { settings } = useSettings();
  const [exams, setExams] = useState<ExamMeta[]>(initialExams);
  const [statsMap, setStatsMap] = useState<Record<string, { pct: number | null; answered: number; total: number; wrongCount: number }>>({});
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [translateSearch, setTranslateSearch] = useState("");
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/scores")
      .then((r) => r.json() as Promise<{ statsMap: Record<string, Record<string, 0 | 1>> }>)
      .then(({ statsMap: remote }) => {
        const map: typeof statsMap = {};
        for (const exam of exams) {
          const stats = remote[exam.id] ?? {};
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
      })
      .catch(() => {
        // Fallback: localStorage
        const map: typeof statsMap = {};
        for (const exam of exams) {
          try {
            const raw = JSON.parse(localStorage.getItem(`quiz-stats-${exam.id}`) ?? "{}");
            const keys = Object.keys(raw).filter((k) => raw[k] === 0 || raw[k] === 1);
            const correct = keys.filter((k) => raw[k] === 1).length;
            const wrongCount = keys.filter((k) => raw[k] === 0).length;
            map[exam.id] = {
              pct: keys.length > 0 ? Math.round((correct / exam.questionCount) * 100) : null,
              answered: keys.length,
              total: exam.questionCount,
              wrongCount,
            };
          } catch { map[exam.id] = { pct: null, answered: 0, total: exam.questionCount, wrongCount: 0 }; }
        }
        setStatsMap(map);
      });
  }, [exams]);

  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    // Only template CSVs are handled here. Excel / arbitrary files go through /admin/import.
    const csvFiles = files.filter((f) => f.name.toLowerCase().endsWith(".csv"));
    if (csvFiles.length === 0) return;

    setShowAdd(true);
    setUploadStatus("uploading");
    setUploadProgress({ done: 0, total: csvFiles.length });

    let hasError = false;
    for (let i = 0; i < csvFiles.length; i++) {
      try {
        const exam = await uploadFile(csvFiles[i]);
        setExams((prev) => {
          const exists = prev.find((e) => e.id === exam.id);
          return exists ? prev.map((e) => (e.id === exam.id ? exam : e)) : [...prev, exam];
        });
      } catch {
        hasError = true;
      }
      setUploadProgress({ done: i + 1, total: csvFiles.length });
    }

    setUploadStatus(hasError ? "error" : "done");
    setUploadProgress(null);
    setTimeout(() => setUploadStatus("idle"), 2000);
    if (fileRef.current) fileRef.current.value = "";
  }, [router]);

  // Exams in other languages available for translation
  const translatableExams = useMemo(() => {
    const lang = settings.language;
    return exams.filter((e) => {
      if (e.language === lang) return false;
      // Hide if a translated version already exists
      const translatedId = `${e.id}_${lang}`;
      return !exams.some((x) => x.id === translatedId);
    });
  }, [exams, settings.language]);

  const filteredTranslatable = useMemo(() => {
    if (!translateSearch.trim()) return translatableExams;
    const q = translateSearch.toLowerCase();
    return translatableExams.filter((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
  }, [translatableExams, translateSearch]);

  const handleTranslate = useCallback(async (exam: ExamMeta) => {
    const targetLang = settings.language;
    setTranslatingId(exam.id);
    try {
      const res = await fetch(`/api/admin/exams/${encodeURIComponent(exam.id)}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLanguage: targetLang }),
      });
      if (!res.ok) throw new Error(await res.text());

      // Consume SSE to track progress, final event has newExamId
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let newExamId: string | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(part.slice(6)) as { newExamId?: string; error?: string };
            if (evt.error) throw new Error(evt.error);
            if (evt.newExamId) newExamId = evt.newExamId;
          } catch (e) {
            if (e instanceof Error && e.message !== "parse failed") throw e;
          }
        }
      }

      if (newExamId) {
        router.refresh();
      }
    } catch {
      // silently fail for now
    } finally {
      setTranslatingId(null);
    }
  }, [settings.language]);

  // No global drag&drop: arbitrary files go through /admin/import where the UX handles preview/edit.

  const modeLabel = mode === "quiz" ? "Quiz" : mode === "review" ? "Flashcard" : "Answers";
  useSetHeader({ back: { href: "/" }, title: modeLabel }, [modeLabel]);

  const uploadStatusText =
    uploadStatus === "uploading"
      ? uploadProgress && uploadProgress.total > 1
        ? `${uploadProgress.done}/${uploadProgress.total}...`
        : "Uploading..."
      : uploadStatus === "done" ? "Added"
      : uploadStatus === "error" ? "Error"
      : null;

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col relative pt-14">
      <div className="flex-1 px-4 sm:px-8 py-6 overflow-y-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
          {/* Existing exam cards */}
          {exams.map((exam) => {
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
                      {exam.duplicateCount && exam.duplicateCount > 0
                        ? <>{exam.questionCount - exam.duplicateCount} Q <span className="text-gray-300">({exam.questionCount} total)</span></>
                        : <>{exam.questionCount} Q</>
                      }
                      {s && s.answered > 0 && (
                        <span className="ml-2 text-gray-300">· {s.answered}/{s.total}</span>
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
                    <span className="text-xs text-rose-400">{s.wrongCount}</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add entries: two distinct paths (CSV template vs AI convert) */}
          {!showAdd ? (
            <>
              <button
                onClick={() => setShowAdd(true)}
                className="bg-white rounded-2xl border border-dashed border-gray-300 px-5 py-4 flex items-center gap-3 text-gray-500 hover:border-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all group text-left"
              >
                <div className="w-8 h-8 rounded-lg border border-dashed border-gray-300 group-hover:border-gray-400 flex items-center justify-center shrink-0 transition-colors">
                  <Plus size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t(settings.language, "addExamFromTemplate")}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">{t(settings.language, "addExamTemplateHint")}</p>
                </div>
              </button>
              <button
                onClick={() => router.push("/admin/import")}
                className="bg-white rounded-2xl border border-scholion-200 px-5 py-4 flex items-center gap-3 hover:border-scholion-400 hover:bg-scholion-50/40 transition-all group text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-scholion-50 group-hover:bg-scholion-100 flex items-center justify-center shrink-0 transition-colors">
                  <Sparkles size={16} className="text-scholion-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700">{t(settings.language, "addExamConvertAny")}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">{t(settings.language, "addExamConvertDesc")}</p>
                </div>
                <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
              </button>
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">{t(settings.language, "addExamTitle")}</p>
                <button onClick={() => setShowAdd(false)} className="text-gray-300 hover:text-gray-500 transition-colors">
                  <X size={15} />
                </button>
              </div>

              {/* Template section */}
              <div>
                <p className="text-xs text-gray-400 mb-2">{t(settings.language, "addExamFromTemplate")}</p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => downloadTemplate()}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-all"
                  >
                    <Download size={12} /> CSV Template
                  </button>
                  <input ref={fileRef} type="file" accept=".csv" multiple className="hidden" onChange={(e) => processFiles(Array.from(e.target.files ?? []))} />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadStatus === "uploading"}
                    className={`w-full py-3 rounded-xl border-2 border-dashed text-sm transition-all ${
                      uploadStatus === "done" ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                      : uploadStatus === "error" ? "border-rose-300 bg-rose-50 text-rose-500"
                      : uploadStatus === "uploading" ? "border-scholion-300 bg-scholion-50 text-scholion-500"
                      : "border-gray-200 text-gray-400 hover:border-gray-400 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Upload size={16} strokeWidth={1.5} />
                      <span>{uploadStatusText ?? t(settings.language, "addExamTemplateHint")}</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Translate from another language */}
              {translatableExams.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">{t(settings.language, "addExamTranslate")}</p>
                  {translatableExams.length > 4 && (
                    <div className="relative mb-2">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
                      <input
                        type="text"
                        value={translateSearch}
                        onChange={(e) => setTranslateSearch(e.target.value)}
                        placeholder="Search..."
                        className="w-full h-8 pl-7 pr-3 rounded-lg border border-gray-200 text-xs text-gray-600 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
                      />
                    </div>
                  )}
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-100">
                    {filteredTranslatable.map((exam) => (
                      <button
                        key={exam.id}
                        onClick={() => handleTranslate(exam)}
                        disabled={translatingId !== null}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0 disabled:opacity-50"
                      >
                        {translatingId === exam.id ? (
                          <Loader2 size={12} className="text-scholion-500 animate-spin shrink-0" />
                        ) : null}
                        <span className="flex-1 text-xs text-gray-700 truncate">{exam.name}</span>
                        <span className="text-[10px] font-semibold text-gray-300 uppercase shrink-0">
                          {LANG_LABELS[exam.language] ?? exam.language}
                        </span>
                      </button>
                    ))}
                    {filteredTranslatable.length === 0 && (
                      <p className="text-xs text-gray-300 text-center py-3">No matches</p>
                    )}
                  </div>
                  <p className="text-xs text-gray-300 text-center mt-2">
                    Translate → {LANG_LABELS[settings.language]}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
