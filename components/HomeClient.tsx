"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Download, Upload, Plus, CheckCircle2, XCircle, Loader2, FilePlus } from "lucide-react";
import type { ExamMeta } from "@/lib/types";
import ExamCard from "./ExamCard";

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

interface Props {
  exams: ExamMeta[];
}

type Mode = "quiz" | "review";
type UploadStatus = "idle" | "uploading" | "done" | "error";

async function uploadFile(file: File, appendTo?: string): Promise<{ exam: ExamMeta; appended?: number }> {
  const formData = new FormData();
  formData.append("file", file);
  if (appendTo) formData.append("appendTo", appendTo);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ exam: ExamMeta; appended?: number }>;
}

export default function HomeClient({ exams: initialExams }: Props) {
  const [mode, setMode] = useState<Mode>("quiz");
  const [statsMap, setStatsMap] = useState<Record<string, { correct: number; answered: number; total: number }>>({});
  const [statsLoading, setStatsLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [exams, setExams] = useState<ExamMeta[]>(initialExams);
  const [isDragging, setIsDragging] = useState(false);
  const [appendOpen, setAppendOpen] = useState(false);
  const [appendTarget, setAppendTarget] = useState("");
  const [appendStatus, setAppendStatus] = useState<UploadStatus>("idle");
  const fileRef = useRef<HTMLInputElement>(null);
  const appendFileRef = useRef<HTMLInputElement>(null);
  const dragCountRef = useRef(0);

  useEffect(() => {
    fetch("/api/scores")
      .then((r) => r.json() as Promise<{ statsMap: Record<string, Record<string, 0 | 1>> }>)
      .then(({ statsMap: remote }) => {
        const map: typeof statsMap = {};
        for (const exam of exams) {
          const stats = remote[exam.id] ?? {};
          const keys = Object.keys(stats).filter((k) => stats[k] === 0 || stats[k] === 1);
          map[exam.id] = {
            answered: keys.length,
            total: exam.questionCount,
            correct: keys.filter((k) => stats[k] === 1).length,
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
            map[exam.id] = {
              answered: keys.length,
              total: exam.questionCount,
              correct: keys.filter((k) => raw[k] === 1).length,
            };
          } catch { map[exam.id] = { answered: 0, total: exam.questionCount, correct: 0 }; }
        }
        setStatsMap(map);
        setStatsLoading(false);
      });
  }, [exams]);

  const processFiles = useCallback(async (files: File[]) => {
    const csvFiles = files.filter((f) => f.name.endsWith(".csv"));
    if (csvFiles.length === 0) return;

    setUploadStatus("uploading");
    setUploadProgress({ done: 0, total: csvFiles.length });

    let hasError = false;
    for (let i = 0; i < csvFiles.length; i++) {
      try {
        const { exam } = await uploadFile(csvFiles[i]);
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

  const handleAppendFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !appendTarget) return;
    setAppendStatus("uploading");
    try {
      const { exam } = await uploadFile(file, appendTarget);
      setExams((prev) => prev.map((ex) => (ex.id === exam.id ? exam : ex)));
      setAppendStatus("done");
      setTimeout(() => { setAppendStatus("idle"); setAppendOpen(false); }, 1500);
    } catch {
      setAppendStatus("error");
      setTimeout(() => setAppendStatus("idle"), 2000);
    }
    if (appendFileRef.current) appendFileRef.current.value = "";
  }, [appendTarget]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    processFiles(files);
  }, [processFiles]);

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
      const files = Array.from(e.dataTransfer?.files ?? []);
      processFiles(files);
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


  return (
    <div className="relative">
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

      {/* Mode toggle — topmost choice */}
      <div className="mb-6">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-2">Mode</p>
        <div className="flex gap-2">
          <button
            onClick={() => setMode("quiz")}
            className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${
              mode === "quiz"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            Quiz
          </button>
          <button
            onClick={() => setMode("review")}
            className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${
              mode === "review"
                ? "border-purple-500 bg-purple-50 text-purple-700"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            Flashcard
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {mode === "quiz"
            ? "Choose answers — track score & accuracy"
            : "Read answers from the start"}
        </p>
      </div>

      {/* Upload row */}
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={downloadTemplate}
              title="Download CSV template"
              className="text-xs px-2.5 py-1.5 rounded-full border border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center"
            >
              <Download size={11} />
            </button>
            <input ref={fileRef} type="file" accept=".csv" multiple className="hidden" onChange={handleInputChange} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadStatus === "uploading"}
              title="New exam from CSV"
              className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors flex items-center justify-center gap-1 ${
                uploadStatus === "done" ? "border-green-400 text-green-600 bg-green-50"
                : uploadStatus === "error" ? "border-red-400 text-red-600 bg-red-50"
                : "border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600"
              }`}
            >
              {uploadStatus === "uploading"
                ? uploadProgress && uploadProgress.total > 1
                  ? <><Loader2 size={11} className="animate-spin" />{uploadProgress.done}/{uploadProgress.total}</>
                  : <Loader2 size={11} className="animate-spin" />
                : uploadStatus === "done" ? <CheckCircle2 size={11} />
                : uploadStatus === "error" ? <XCircle size={11} />
                : <><Plus size={11} />CSV</>
              }
            </button>
            {exams.length > 0 && (
              <button
                onClick={() => { setAppendOpen((v) => !v); setAppendTarget(exams[0]?.id ?? ""); }}
                title="Append CSV to existing exam"
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors flex items-center justify-center gap-1 ${
                  appendOpen
                    ? "border-amber-400 text-amber-600 bg-amber-50"
                    : "border-gray-300 text-gray-600 hover:border-amber-400 hover:text-amber-600"
                }`}
              >
                <FilePlus size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Append inline UI */}
        {appendOpen && (
          <div className="mt-2 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <select
              value={appendTarget}
              onChange={(e) => setAppendTarget(e.target.value)}
              className="flex-1 text-xs border border-amber-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.name} ({ex.questionCount})</option>
              ))}
            </select>
            <input ref={appendFileRef} type="file" accept=".csv" className="hidden" onChange={handleAppendFile} />
            <button
              onClick={() => appendFileRef.current?.click()}
              disabled={appendStatus === "uploading" || !appendTarget}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors flex items-center gap-1 ${
                appendStatus === "done" ? "border-green-400 text-green-600 bg-green-50"
                : appendStatus === "error" ? "border-red-400 text-red-600 bg-red-50"
                : "border-amber-400 text-amber-700 bg-white hover:bg-amber-100"
              }`}
            >
              {appendStatus === "uploading" ? <Loader2 size={11} className="animate-spin" />
                : appendStatus === "done" ? <CheckCircle2 size={11} />
                : appendStatus === "error" ? <XCircle size={11} />
                : <><Upload size={11} />Append</>
              }
            </button>
          </div>
        )}
      </div>

      {/* Exam list */}
      <div className={`grid gap-3 transition-opacity duration-300 ${statsLoading ? "opacity-60" : "opacity-100"}`}>
        {exams.map((exam) => (
          <ExamCard key={exam.id} exam={exam} stats={statsMap[exam.id]} mode={mode} />
        ))}
      </div>
    </div>
  );
}
