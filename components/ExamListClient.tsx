"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, RotateCcw, Upload, Download, Plus, X, User, Search, Flame, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import type { ExamMeta } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { LANG_OPTIONS } from "@/lib/i18n";
import { useSettings } from "@/lib/settings-context";
import { useSetHeader } from "@/lib/header-context";
import OnboardingGuide from "./OnboardingGuide";

interface Props {
  exams: ExamMeta[];
}

type UploadStatus = "idle" | "uploading" | "importing" | "done" | "error";

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

function isExcelFile(f: File): boolean {
  return /\.(xlsx?|xls)$/i.test(f.name);
}

function fileToExamId(name: string): string {
  return name
    .replace(/\.(xlsx?|csv)$/i, "")
    .replace(/[^a-zA-Z0-9\u3040-\u9FFF_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase()
    .slice(0, 64);
}

interface ImportEvent {
  step: string;
  message?: string;
  done?: number;
  total?: number;
  examId?: string;
  count?: number;
}

async function importExcelFile(
  file: File,
  lang: string,
  onProgress: (evt: ImportEvent) => void
): Promise<ExamMeta | null> {
  const examId = fileToExamId(file.name);
  const examName = file.name.replace(/\.(xlsx?|csv)$/i, "");

  const form = new FormData();
  form.append("file", file);
  form.append("examId", examId);
  form.append("examName", examName);
  form.append("lang", lang);

  const res = await fetch("/api/admin/import", { method: "POST", body: form });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const b = await res.json() as { error?: string }; msg = b.error ?? msg; } catch { /* */ }
    throw new Error(msg);
  }

  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let resultExamId: string | undefined;
  let resultCount: number | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      try {
        const evt = JSON.parse(part.slice(6)) as ImportEvent;
        onProgress(evt);
        if (evt.step === "done") {
          resultExamId = evt.examId;
          resultCount = evt.count;
        }
        if (evt.step === "error") {
          throw new Error(evt.message ?? "Import failed");
        }
      } catch (e) {
        if (e instanceof Error && e.message !== "Import failed") continue;
        throw e;
      }
    }
  }

  if (!resultExamId) return null;
  return {
    id: resultExamId,
    name: file.name.replace(/\.(xlsx?|csv)$/i, ""),
    questionCount: resultCount ?? 0,
    language: lang as Locale,
    tags: [],
  };
}

export default function ExamListClient({ exams: initialExams }: Props) {
  const router = useRouter();
  const { settings, updateSettings } = useSettings();
  const [exams, setExams] = useState<ExamMeta[]>(initialExams);
  const [statsMap, setStatsMap] = useState<Record<string, { pct: number | null; answered: number; total: number; wrongCount: number }>>({});
  const langFilter = settings.language;
  const [search, setSearch] = useState("");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [fillStatus, setFillStatus] = useState<"idle" | "filling" | "done" | "error">("idle");
  const [fillProgress, setFillProgress] = useState<{ done: number; total: number } | null>(null);
  const [fillResult, setFillResult] = useState<{ filled: number; skipped: number } | null>(null);
  const [uploadedExam, setUploadedExam] = useState<ExamMeta | null>(null);
  const [previewName, setPreviewName] = useState("");
  const [previewLang, setPreviewLang] = useState<Locale>("en");
  const [previewTags, setPreviewTags] = useState<string[]>(["Salesforce"]);
  const [previewTagInput, setPreviewTagInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [dailyProgress, setDailyProgress] = useState<{ todayCount: number; streak: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [translateSourceId, setTranslateSourceId] = useState<string | null>(null);
  const [translateStatus, setTranslateStatus] = useState<"idle" | "translating" | "done" | "error">("idle");
  const [translateProgress, setTranslateProgress] = useState<{ done: number; total: number } | null>(null);
  const [translateSearch, setTranslateSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCountRef = useRef(0);

  const headerRight = useMemo(() => (
    <>
      <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg">
        {LANG_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => updateSettings({ language: opt.value })}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              settings.language === opt.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <Link
        href="/profile"
        className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        title="Profile"
      >
        <User size={14} />
      </Link>
    </>
  ), [settings.language, updateSettings]);

  useSetHeader({ right: headerRight }, [headerRight]);

  useEffect(() => {
    fetch("/api/sessions/summary")
      .then((r) => r.json() as Promise<{ todayCount: number; streak: number }>)
      .then(setDailyProgress)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/scores")
      .then((r) => r.json() as Promise<{ statsMap: Record<string, { answered: number; correct: number }> }>)
      .then(({ statsMap: remote }) => {
        const map: typeof statsMap = {};
        for (const exam of exams) {
          const s = remote[exam.id] ?? { answered: 0, correct: 0 };
          const wrongCount = s.answered - s.correct;
          map[exam.id] = {
            pct: s.answered > 0 ? Math.round((s.correct / exam.questionCount) * 100) : null,
            answered: s.answered,
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
    const supported = files.filter((f) => /\.(csv|xlsx?|xls)$/i.test(f.name));
    if (supported.length === 0) return;

    setShowAdd(true);
    setUploadErrorMsg(null);
    setFillStatus("idle");
    setFillProgress(null);
    setFillResult(null);

    const csvFiles = supported.filter((f) => !isExcelFile(f));
    const excelFiles = supported.filter(isExcelFile);

    // CSV: existing fast upload
    if (csvFiles.length > 0) {
      setUploadStatus("uploading");
      setUploadProgress({ done: 0, total: csvFiles.length });
      let hasError = false;
      let lastExam: ExamMeta | null = null;
      for (let i = 0; i < csvFiles.length; i++) {
        try {
          const exam = await uploadFile(csvFiles[i]);
          lastExam = exam;
          setExams((prev) => {
            const exists = prev.find((e) => e.id === exam.id);
            return exists ? prev.map((e) => (e.id === exam.id ? exam : e)) : [...prev, exam];
          });
        } catch (e) {
          hasError = true;
          let msg = e instanceof Error ? e.message : String(e);
          try { msg = JSON.parse(msg).error ?? msg; } catch { /* keep raw */ }
          setUploadErrorMsg(msg);
        }
        setUploadProgress({ done: i + 1, total: csvFiles.length });
      }
      if (hasError) {
        setUploadStatus("error");
      } else if (lastExam) {
        setUploadStatus("done");
        setUploadedExam(lastExam);
        setPreviewName(lastExam.name);
        setPreviewLang(lastExam.language);
        setPreviewTags(["Salesforce"]);
        setPreviewTagInput("");
      }
      setUploadProgress(null);
      if (excelFiles.length === 0) setTimeout(() => setUploadStatus("idle"), 2000);
    }

    // Excel: AI code execution import
    for (const ef of excelFiles) {
      setUploadStatus("importing");
      setUploadProgress(null);
      setUploadErrorMsg(null);
      try {
        const exam = await importExcelFile(ef, langFilter, (evt) => {
          if (evt.message) {
            setUploadErrorMsg(null); // clear any previous message
          }
          if (evt.done != null && evt.total != null) {
            setUploadProgress({ done: evt.done, total: evt.total });
          }
        });
        if (exam) {
          setExams((prev) => {
            const exists = prev.find((e) => e.id === exam.id);
            return exists ? prev.map((e) => (e.id === exam.id ? exam : e)) : [...prev, exam];
          });
          setUploadedExam(exam);
          setPreviewName(exam.name);
          setPreviewLang(exam.language);
          setPreviewTags(["Salesforce"]);
          setPreviewTagInput("");
          setUploadStatus("done");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setUploadErrorMsg(msg);
        setUploadStatus("error");
      }
    }

    setTimeout(() => setUploadStatus("idle"), 3000);
    if (fileRef.current) fileRef.current.value = "";
  }, [langFilter]);

  const startFill = useCallback(async (examId: string) => {
    setFillStatus("filling");
    setFillProgress(null);
    setFillResult(null);
    try {
      const res = await fetch(`/api/admin/exams/${examId}/fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPrompt: settings.aiPrompt }),
      });
      if (!res.body) { setFillStatus("error"); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const evt = JSON.parse(part.slice(6)) as { error?: string; done?: number; total?: number; filled?: number; skipped?: number };
          if (evt.error) { setFillStatus("error"); return; }
          if (evt.total !== undefined) setFillProgress({ done: evt.done ?? 0, total: evt.total });
          if (evt.filled !== undefined) setFillResult({ filled: evt.filled, skipped: evt.skipped ?? 0 });
        }
      }
      setFillStatus("done");
    } catch {
      setFillStatus("error");
    }
  }, [settings.aiPrompt]);

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
      : uploadStatus === "importing"
      ? uploadProgress
        ? `Importing ${uploadProgress.done}/${uploadProgress.total}...`
        : "Importing..."
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
    <div className="min-h-screen bg-canvas flex flex-col relative pt-14">
      <OnboardingGuide />
      {/* Drag & drop overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scholion-500/10 backdrop-blur-[1px] pointer-events-none">
          <div className="flex flex-col items-center gap-3 bg-white border-2 border-dashed border-scholion-400 rounded-2xl px-10 py-8 shadow-xl">
            <Upload size={32} className="text-scholion-500" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-scholion-600">Drop files here</p>
            <p className="text-xs text-scholion-300">CSV / Excel supported</p>
          </div>
        </div>
      )}

      {/* Controls: search */}
      <div className="px-4 sm:px-8 pt-3 pb-3 max-w-3xl mx-auto w-full">
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
        const goal = settings.dailyGoal ?? 100;
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
                    className={`h-full rounded-full transition-all ${done ? "bg-emerald-500" : "bg-scholion-400"}`}
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
              <div key={exam.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col group/card">
                <button
                  onClick={() => router.push(`/exam/${exam.id}`)}
                  className="flex-1 text-left px-5 py-4 flex items-start gap-3 hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-1">
                      <p className="flex-1 font-semibold text-gray-900 text-sm leading-snug">{exam.name}</p>
                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-gray-100 text-[10px] text-gray-500 font-medium leading-none mt-0.5">
                        {exam.language.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {exam.questionCount} Q
                      {s && s.answered > 0 && (
                        <span className="ml-2 text-gray-300">· {s.answered}/{s.total} answered</span>
                      )}
                    </p>
                    {exam.tags && exam.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {exam.tags.map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] text-gray-500 font-medium leading-none">{tag}</span>
                        ))}
                      </div>
                    )}
                    {s && s.answered > 0 && pct !== null && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-coral-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {s.wrongCount > 0 && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-coral-50 text-[10px] text-coral-500 font-medium leading-none shrink-0">
                            <RotateCcw size={8} />
                            {s.wrongCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    {pct !== null && (
                      <span className={`text-base font-bold tabular-nums ${pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-500" : "text-coral-500"}`}>
                        {pct}%
                      </span>
                    )}
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-400 transition-colors" />
                  </div>
                </button>
                <div className="opacity-0 group-hover/card:opacity-100 transition-opacity px-3 pb-2 flex justify-end">
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete "${exam.name}"? This will remove all questions, scores, and sessions.`)) return;
                      await fetch(`/api/admin/exams/${exam.id}`, { method: "DELETE" });
                      setExams((prev) => prev.filter((e) => e.id !== exam.id));
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-gray-300 hover:text-rose-400 hover:bg-rose-50 transition-colors text-xs"
                    title="Delete exam"
                  >
                    <Trash2 size={11} />
                    Delete
                  </button>
                </div>
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
                <button onClick={() => { setShowAdd(false); setUploadedExam(null); }} className="text-gray-300 hover:text-gray-500 transition-colors">
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
                <p className="text-xs text-gray-400 mb-2">Upload</p>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" multiple className="hidden" onChange={(e) => processFiles(Array.from(e.target.files ?? []))} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadStatus === "uploading" || uploadStatus === "importing"}
                  className={`w-full py-4 rounded-xl border-2 border-dashed text-sm transition-all ${
                    uploadStatus === "done" ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                    : uploadStatus === "error" ? "border-rose-300 bg-rose-50 text-rose-500"
                    : uploadStatus === "uploading" || uploadStatus === "importing" ? "border-scholion-300 bg-scholion-50 text-scholion-500"
                    : "border-gray-200 text-gray-400 hover:border-gray-400 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <Upload size={18} strokeWidth={1.5} />
                    <span>{uploadStatusText ?? "Click or drag & drop"}</span>
                    {uploadStatus === "idle" && <span className="text-xs text-gray-300">CSV / Excel</span>}
                  </div>
                </button>
                {uploadStatus === "error" && uploadErrorMsg && (
                  <p className="mt-2 text-xs text-rose-500 text-center">{uploadErrorMsg}</p>
                )}
              </div>

              {/* Upload preview panel */}
              {uploadedExam && (
                <div className="border border-gray-200 rounded-xl p-3 flex flex-col gap-2.5">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Preview</p>
                  <input
                    value={previewName}
                    onChange={(e) => setPreviewName(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-lg border border-gray-200 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300"
                    placeholder="Exam name"
                  />
                  <div className="flex gap-1">
                    {LANG_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setPreviewLang(opt.value)}
                        className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors ${
                          previewLang === opt.value
                            ? "bg-scholion-500 text-white"
                            : "border border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1 min-h-[20px] p-1.5 border border-gray-200 rounded-lg">
                    {previewTags.map((tag) => (
                      <span key={tag} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 text-[10px] text-gray-600 leading-none">
                        {tag}
                        <button onClick={() => setPreviewTags((prev) => prev.filter((t) => t !== tag))} className="text-gray-400 hover:text-gray-600 ml-0.5">
                          <X size={9} />
                        </button>
                      </span>
                    ))}
                    <input
                      value={previewTagInput}
                      onChange={(e) => setPreviewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === ",") && previewTagInput.trim()) {
                          e.preventDefault();
                          setPreviewTags((prev) => [...new Set([...prev, previewTagInput.trim()])]);
                          setPreviewTagInput("");
                        }
                      }}
                      placeholder="Add tag..."
                      className="h-5 text-[10px] px-0.5 border-0 outline-none bg-transparent text-gray-600 placeholder:text-gray-300 min-w-[50px]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await fetch(`/api/admin/exams/${uploadedExam.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name: previewName, language: previewLang, tags: previewTags }),
                        });
                        setExams((prev) => prev.map((e) => e.id === uploadedExam.id
                          ? { ...e, name: previewName, language: previewLang, tags: previewTags }
                          : e
                        ));
                        setUploadedExam(null);
                      }}
                      className="flex-1 h-8 rounded-lg bg-scholion-500 text-white text-xs font-semibold hover:bg-scholion-600 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setUploadedExam(null)}
                      className="flex-1 h-8 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      Skip
                    </button>
                  </div>
                  <div className="border-t border-gray-100 pt-2.5 flex flex-col gap-2">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">AI Fill</p>
                    {fillStatus === "idle" && (
                      <button
                        onClick={() => startFill(uploadedExam.id)}
                        className="w-full h-8 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Sparkles size={12} />
                        Fill missing fields
                      </button>
                    )}
                    {fillStatus === "filling" && (
                      <p className="text-xs text-gray-400 text-center">
                        {fillProgress ? `${fillProgress.done} / ${fillProgress.total}` : "Starting..."}
                      </p>
                    )}
                    {fillStatus === "done" && fillResult && (
                      <p className="text-xs text-emerald-600 text-center">
                        Filled {fillResult.filled} · Skipped {fillResult.skipped}
                      </p>
                    )}
                    {fillStatus === "error" && (
                      <p className="text-xs text-rose-500 text-center">Fill failed</p>
                    )}
                  </div>
                </div>
              )}

              {otherLangExams.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">Translate from another language</p>
                  <div className="border border-gray-200 rounded-lg overflow-hidden mb-2">
                    <div className="relative border-b border-gray-100">
                      <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                      <input
                        type="text"
                        value={translateSearch}
                        onChange={(e) => setTranslateSearch(e.target.value)}
                        placeholder="Search..."
                        className="w-full h-8 pl-7 pr-2.5 text-xs text-gray-700 placeholder:text-gray-300 focus:outline-none bg-transparent"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {otherLangExams
                        .filter((e) => !translateSearch.trim() || e.name.toLowerCase().includes(translateSearch.trim().toLowerCase()))
                        .map((e) => (
                          <button
                            key={e.id}
                            onClick={() => setTranslateSourceId(e.id === translateSourceId ? null : e.id)}
                            className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                              translateSourceId === e.id
                                ? "bg-gray-100 text-gray-900 font-medium"
                                : "text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            <span className="truncate">{e.name}</span>
                            <span className="shrink-0 ml-2 text-[10px] text-gray-400 uppercase">{e.language}</span>
                          </button>
                        ))}
                      {otherLangExams.filter((e) => !translateSearch.trim() || e.name.toLowerCase().includes(translateSearch.trim().toLowerCase())).length === 0 && (
                        <p className="px-3 py-3 text-xs text-gray-300 text-center">No results</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => translateSourceId && translateExam(translateSourceId)}
                    disabled={!translateSourceId || translateStatus === "translating"}
                    className={`w-full py-2 rounded-lg border text-xs font-medium transition-all disabled:opacity-40 ${
                      translateStatus === "done" ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                      : translateStatus === "error" ? "border-rose-300 bg-rose-50 text-rose-500"
                      : translateStatus === "translating" ? "border-scholion-300 bg-scholion-50 text-scholion-500"
                      : "border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50"
                    }`}
                  >
                    {translateStatus === "translating"
                      ? translateProgress ? `Translating ${translateProgress.done}/${translateProgress.total}…` : "Translating…"
                      : translateStatus === "done" ? "Done"
                      : translateStatus === "error" ? "Error — retry?"
                      : `Translate → ${LANG_OPTIONS.find((o) => o.value === langFilter)?.label ?? langFilter}`}
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
