"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, RotateCcw, Upload, Download, Plus, X, User, Search, Flame } from "lucide-react";
import Link from "next/link";
import type { ExamMeta } from "@/lib/types";
import { useSettings } from "@/lib/settings-context";
import PageHeader from "./PageHeader";
import OnboardingGuide from "./OnboardingGuide";

interface Props {
  exams: ExamMeta[];
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

async function uploadFile(file: File, language: "ja" | "en"): Promise<ExamMeta> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("language", language);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) throw new Error(await res.text());
  const { exam } = await res.json() as { exam: ExamMeta };
  return exam;
}

export default function ExamListClient({ exams: initialExams }: Props) {
  const router = useRouter();
  const { settings, updateSettings } = useSettings();
  const [exams, setExams] = useState<ExamMeta[]>(initialExams);
  const [statsMap, setStatsMap] = useState<Record<string, { pct: number | null; answered: number; total: number; wrongCount: number }>>({});
  const availableLangs = Array.from(new Set(initialExams.map((e) => e.language)));
  const langOptions = (
    [
      { value: "en" as const, label: "EN" },
      { value: "ja" as const, label: "JA" },
      { value: "zh" as const, label: "ZH" },
      { value: "ko" as const, label: "KO" },
    ] as { value: "en" | "ja" | "zh" | "ko"; label: string }[]
  ).filter((opt) => availableLangs.includes(opt.value));
  const langFilter = availableLangs.includes(settings.language)
    ? settings.language
    : (availableLangs[0] ?? "en");
  const [search, setSearch] = useState("");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadLang, setUploadLang] = useState<"ja" | "en">(
    settings.language === "ja" ? "ja" : "en"
  );
  const [isDragging, setIsDragging] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [dailyProgress, setDailyProgress] = useState<{ todayCount: number; streak: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [translateSourceId, setTranslateSourceId] = useState<string | null>(null);
  const [translateStatus, setTranslateStatus] = useState<"idle" | "translating" | "done" | "error">("idle");
  const [translateProgress, setTranslateProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCountRef = useRef(0);

  useEffect(() => {
    fetch("/api/sessions/summary")
      .then((r) => r.json() as Promise<{ todayCount: number; streak: number }>)
      .then(setDailyProgress)
      .catch(() => {});
  }, []);

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
        setStatsLoading(false);
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
        setStatsLoading(false);
      });
  }, [exams]);

  const processFiles = useCallback(async (files: File[]) => {
    const csvFiles = files.filter((f) => f.name.endsWith(".csv"));
    if (csvFiles.length === 0) return;

    setShowAdd(true);
    setUploadStatus("uploading");
    setUploadProgress({ done: 0, total: csvFiles.length });

    let hasError = false;
    for (let i = 0; i < csvFiles.length; i++) {
      try {
        const exam = await uploadFile(csvFiles[i], uploadLang);
        setExams((prev) => {
          const exists = prev.find((e) => e.id === exam.id);
          return exists ? prev.map((e) => (e.id === exam.id ? exam : e)) : [...prev, exam];
        });
      } catch { hasError = true; }
      setUploadProgress({ done: i + 1, total: csvFiles.length });
    }

    setUploadStatus(hasError ? "error" : "done");
    setUploadProgress(null);
    setTimeout(() => setUploadStatus("idle"), 2000);
    if (fileRef.current) fileRef.current.value = "";
  }, [uploadLang]);

  // Global drag & drop
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      dragCountRef.current++;
      setIsDragging(true);
    };
    const onDragLeave = () => {
      dragCountRef.current--;
      if (dragCountRef.current === 0) setIsDragging(false);
    };
    const onDragOver = (e: DragEvent) => { e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCountRef.current = 0;
      setIsDragging(false);
      processFiles(Array.from(e.dataTransfer?.files ?? []));
    };
    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [processFiles]);

  const uploadStatusText =
    uploadStatus === "uploading"
      ? uploadProgress && uploadProgress.total > 1
        ? `${uploadProgress.done}/${uploadProgress.total}...`
        : "Uploading..."
      : uploadStatus === "done" ? "Added"
      : uploadStatus === "error" ? "Error"
      : null;

  const translateExam = useCallback(async (sourceId: string) => {
    setTranslateStatus("translating");
    setTranslateProgress(null);
    try {
      const res = await fetch(`/api/admin/exams/${sourceId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLanguage: langFilter }),
      });
      if (!res.ok || !res.body) { setTranslateStatus("error"); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as { done?: number; total?: number; exam?: ExamMeta; error?: string };
            if (evt.done != null && evt.total != null) setTranslateProgress({ done: evt.done, total: evt.total });
            if (evt.exam) {
              setExams((prev) => [...prev.filter((e) => e.id !== evt.exam!.id), evt.exam!]);
              setTranslateStatus("done");
              setTimeout(() => { setTranslateStatus("idle"); setTranslateSourceId(null); }, 2000);
            }
            if (evt.error) setTranslateStatus("error");
          } catch { /* ignore parse errors */ }
        }
      }
    } catch { setTranslateStatus("error"); }
  }, [langFilter]);

  const otherLangExams = exams.filter((e) => e.language !== langFilter);

  const filteredExams = exams
    .filter((e) => {
      if (search.trim()) return e.name.toLowerCase().includes(search.trim().toLowerCase());
      return true;
    })
    .sort((a, b) => {
      const aMatch = a.language === langFilter ? 0 : 1;
      const bMatch = b.language === langFilter ? 0 : 1;
      return aMatch - bMatch;
    });

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col relative">
      <OnboardingGuide />
      {/* Drag & drop overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-500/10 backdrop-blur-[1px] pointer-events-none">
          <div className="flex flex-col items-center gap-3 bg-white border-2 border-dashed border-blue-400 rounded-2xl px-10 py-8 shadow-xl">
            <Upload size={32} className="text-blue-500" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-blue-700">Drop CSV here</p>
            <p className="text-xs text-blue-400">Multiple files supported</p>
          </div>
        </div>
      )}

      <PageHeader
        title="Exams"
        right={
          <>
            {langOptions.length > 1 && (
              <div className="flex items-center gap-0.5">
                {langOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateSettings({ language: opt.value })}
                    className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
                      langFilter === opt.value
                        ? "bg-gray-900 text-white"
                        : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            <Link
              href="/profile"
              className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Profile"
            >
              <User size={14} />
            </Link>
          </>
        }
      />

      {/* Controls: search */}
      <div className="px-4 sm:px-8 pt-5 pb-3 max-w-3xl mx-auto w-full">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
          <input
            type="text"
            placeholder="Search exams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-8 pr-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Daily progress banner */}
      {dailyProgress && (dailyProgress.todayCount > 0 || dailyProgress.streak > 0) && (() => {
        const goal = settings.dailyGoal ?? 20;
        const { todayCount, streak } = dailyProgress;
        const pct = Math.min(100, Math.round((todayCount / goal) * 100));
        const done = todayCount >= goal;
        return (
          <div className="px-4 sm:px-8 pb-3 max-w-3xl mx-auto w-full">
            <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${done ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold ${done ? "text-emerald-700" : "text-gray-500"}`}>
                    Today: {todayCount}/{goal}
                  </span>
                  {done && <span className="text-xs text-emerald-600 font-medium">Goal reached</span>}
                </div>
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${done ? "bg-emerald-500" : "bg-gray-400"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              {streak > 0 && (
                <div className={`flex items-center gap-1 shrink-0 ${streak >= 7 ? "text-amber-500" : "text-gray-400"}`}>
                  <Flame size={13} strokeWidth={2} />
                  <span className="text-xs font-semibold tabular-nums">{streak}d</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div className="flex-1 px-4 sm:px-8 pb-6 overflow-y-auto">
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto transition-opacity duration-300 ${statsLoading ? "opacity-60" : "opacity-100"}`}>
          {filteredExams.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-2 py-12 text-gray-300">
              <Search size={24} strokeWidth={1.5} />
              <p className="text-sm">No exams found</p>
              <button onClick={() => { setSearch(""); }} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                Clear filters
              </button>
            </div>
          )}
          {filteredExams.map((exam) => {
            const s = statsMap[exam.id];
            const pct = s?.pct ?? null;
            return (
              <div key={exam.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col">
                <button
                  onClick={() => router.push(`/exam/${exam.id}`)}
                  className="flex-1 text-left px-5 py-4 flex items-start gap-3 hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm leading-snug mb-1">{exam.name}</p>
                    <p className="text-xs text-gray-400">
                      {exam.questionCount} Q
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

          {/* Add card */}
          {!showAdd ? (
            <button
              onClick={() => setShowAdd(true)}
              className="bg-white rounded-2xl border border-dashed border-gray-300 px-5 py-4 flex items-center gap-3 text-gray-400 hover:border-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all group"
            >
              <div className="w-8 h-8 rounded-lg border border-dashed border-gray-300 group-hover:border-gray-400 flex items-center justify-center transition-colors">
                <Plus size={16} />
              </div>
              <span className="text-sm font-medium">Add</span>
            </button>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Add Exam</p>
                <button onClick={() => setShowAdd(false)} className="text-gray-300 hover:text-gray-500 transition-colors">
                  <X size={15} />
                </button>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-2">Template</p>
                <button
                  onClick={() => downloadTemplate()}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-all"
                >
                  <Download size={12} /> CSV Template
                </button>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-2">Language</p>
                <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5 mb-3">
                  {(["ja", "en"] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setUploadLang(lang)}
                      className={`flex-1 text-xs font-medium py-1 rounded-md transition-colors ${
                        uploadLang === lang ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {lang === "ja" ? "JP" : "EN"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-2">Upload</p>
                <input ref={fileRef} type="file" accept=".csv" multiple className="hidden" onChange={(e) => processFiles(Array.from(e.target.files ?? []))} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadStatus === "uploading"}
                  className={`w-full py-4 rounded-xl border-2 border-dashed text-sm transition-all ${
                    uploadStatus === "done" ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                    : uploadStatus === "error" ? "border-rose-300 bg-rose-50 text-rose-500"
                    : uploadStatus === "uploading" ? "border-blue-300 bg-blue-50 text-blue-500"
                    : "border-gray-200 text-gray-400 hover:border-gray-400 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <Upload size={18} strokeWidth={1.5} />
                    <span>{uploadStatusText ?? "Click or drag & drop"}</span>
                    {uploadStatus === "idle" && <span className="text-xs text-gray-300">Multiple files</span>}
                  </div>
                </button>
              </div>
              {otherLangExams.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">Translate from another language</p>
                  <select
                    value={translateSourceId ?? ""}
                    onChange={(e) => setTranslateSourceId(e.target.value || null)}
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white mb-2 focus:outline-none"
                  >
                    <option value="">Select source exam…</option>
                    {otherLangExams.map((e) => (
                      <option key={e.id} value={e.id}>{e.name} ({e.language.toUpperCase()})</option>
                    ))}
                  </select>
                  <button
                    onClick={() => translateSourceId && translateExam(translateSourceId)}
                    disabled={!translateSourceId || translateStatus === "translating"}
                    className={`w-full py-2 rounded-lg border text-xs font-medium transition-all disabled:opacity-40 ${
                      translateStatus === "done" ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                      : translateStatus === "error" ? "border-rose-300 bg-rose-50 text-rose-500"
                      : translateStatus === "translating" ? "border-blue-300 bg-blue-50 text-blue-500"
                      : "border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50"
                    }`}
                  >
                    {translateStatus === "translating"
                      ? translateProgress ? `Translating ${translateProgress.done}/${translateProgress.total}…` : "Translating…"
                      : translateStatus === "done" ? "Done"
                      : translateStatus === "error" ? "Error — retry?"
                      : `Translate → ${langOptions.find((o) => o.value === langFilter)?.label ?? langFilter}`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
