"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, ChevronRight, Download, Upload, Plus, X } from "lucide-react";
import type { ExamMeta } from "@/lib/types";
import { useSetHeader } from "@/lib/header-context";

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
  const [exams, setExams] = useState<ExamMeta[]>(initialExams);
  const [statsMap, setStatsMap] = useState<Record<string, { pct: number | null; answered: number; total: number; wrongCount: number }>>({});
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCountRef = useRef(0);

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
    const csvFiles = files.filter((f) => f.name.endsWith(".csv"));
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
  }, []);

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
      {/* Drag & drop overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scholion-500/10 backdrop-blur-[1px] pointer-events-none">
          <div className="flex flex-col items-center gap-3 bg-white border-2 border-dashed border-scholion-400 rounded-2xl px-10 py-8 shadow-xl">
            <Upload size={32} className="text-scholion-500" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-scholion-600">Drop CSV here</p>
            <p className="text-xs text-scholion-300">Multiple files supported</p>
          </div>
        </div>
      )}

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

              {/* Template download */}
              <div>
                <p className="text-xs text-gray-400 mb-2">Template</p>
                <button
                  onClick={() => downloadTemplate()}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-all"
                >
                  <Download size={12} /> CSV Template
                </button>
              </div>

              {/* Drop zone */}
              <div>
                <p className="text-xs text-gray-400 mb-2">Upload</p>
                <input ref={fileRef} type="file" accept=".csv" multiple className="hidden" onChange={(e) => processFiles(Array.from(e.target.files ?? []))} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadStatus === "uploading"}
                  className={`w-full py-4 rounded-xl border-2 border-dashed text-sm transition-all ${
                    uploadStatus === "done" ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                    : uploadStatus === "error" ? "border-rose-300 bg-rose-50 text-rose-500"
                    : uploadStatus === "uploading" ? "border-scholion-300 bg-scholion-50 text-scholion-500"
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
