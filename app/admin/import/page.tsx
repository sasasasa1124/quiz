"use client";

import { useState, useRef } from "react";
import { Upload, FileText, ChevronDown, ChevronUp, Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";

type Lang = "ja" | "en" | "zh" | "ko";
type ImportStep = "upload" | "inspect" | "convert" | "saving" | "done" | "error";
type FeedbackStep = "analyzing" | "fixing" | "done" | "error";

interface ImportEvent {
  step: ImportStep;
  message?: string;
  done?: number;
  total?: number;
  examId?: string;
  count?: number;
}

interface FeedbackEvent {
  step: FeedbackStep;
  message?: string;
  done?: number;
  total?: number;
  fixed?: number;
}

interface LogLine {
  text: string;
  type: "info" | "error" | "success";
}

// ── SSE consumer ─────────────────────────────────────────────────────────────

async function consumeSSE<T>(
  res: Response,
  onEvent: (evt: T) => void
): Promise<void> {
  const reader = res.body!.getReader();
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
      try {
        onEvent(JSON.parse(part.slice(6)) as T);
      } catch { /* skip malformed */ }
    }
  }
}

// ── Components ────────────────────────────────────────────────────────────────

function LogPanel({ lines }: { lines: LogLine[] }) {
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Agent log ({lines.length})
      </button>
      {open && (
        <div className="mt-1 p-3 rounded-xl bg-gray-50 border border-gray-100 font-mono text-xs text-gray-600 max-h-48 overflow-y-auto whitespace-pre-wrap">
          {lines.map((l, i) => (
            <div
              key={i}
              className={l.type === "error" ? "text-rose-500" : l.type === "success" ? "text-emerald-600" : ""}
            >
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressRow({
  label,
  active,
  done,
  error,
}: {
  label: string;
  active: boolean;
  done: boolean;
  error?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {error ? (
        <AlertCircle size={15} className="text-rose-500 shrink-0" />
      ) : done ? (
        <CheckCircle size={15} className="text-emerald-500 shrink-0" />
      ) : active ? (
        <Loader2 size={15} className="text-gray-400 animate-spin shrink-0" />
      ) : (
        <div className="w-[15px] h-[15px] rounded-full border border-gray-200 shrink-0" />
      )}
      <span className={done ? "text-gray-700" : active ? "text-gray-900 font-medium" : "text-gray-400"}>
        {label}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [examId, setExamId] = useState("");
  const [examName, setExamName] = useState("");
  const [lang, setLang] = useState<Lang>("ja");
  const [sheetHint, setSheetHint] = useState("");

  // Import state
  const [importing, setImporting] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep | null>(null);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importedExamId, setImportedExamId] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [agentLog, setAgentLog] = useState<LogLine[]>([]);

  // Feedback state
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackStep, setFeedbackStep] = useState<FeedbackStep | null>(null);
  const [feedbackProgress, setFeedbackProgress] = useState<{ done: number; total: number } | null>(null);
  const [feedbackResult, setFeedbackResult] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Import handler ──────────────────────────────────────────────────────────

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !examId.trim()) return;

    setImporting(true);
    setImportStep(null);
    setImportProgress(null);
    setImportedExamId(null);
    setImportedCount(null);
    setImportError(null);
    setAgentLog([]);

    const form = new FormData();
    form.append("file", file);
    form.append("examId", examId.trim());
    form.append("examName", examName.trim() || examId.trim());
    form.append("lang", lang);
    if (sheetHint.trim()) form.append("sheetHint", sheetHint.trim());

    try {
      const res = await fetch("/api/admin/import", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setImportError(body.error ?? `HTTP ${res.status}`);
        return;
      }

      await consumeSSE<ImportEvent>(res, (evt) => {
        setImportStep(evt.step);
        if (evt.done != null && evt.total != null) {
          setImportProgress({ done: evt.done, total: evt.total });
        }
        if (evt.message) {
          setAgentLog((prev) => [...prev, {
            text: evt.message!,
            type: evt.step === "error" ? "error" : "info",
          }]);
        }
        if (evt.step === "done") {
          setImportedExamId(evt.examId ?? null);
          setImportedCount(evt.count ?? null);
        }
        if (evt.step === "error") {
          setImportError(evt.message ?? "Unknown error");
        }
      });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  // ── Feedback handler ────────────────────────────────────────────────────────

  async function handleFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!importedExamId || !feedbackText.trim() || feedbackBusy) return;

    setFeedbackBusy(true);
    setFeedbackStep(null);
    setFeedbackProgress(null);
    setFeedbackResult(null);
    setFeedbackError(null);

    try {
      const res = await fetch(`/api/admin/import/${encodeURIComponent(importedExamId)}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: feedbackText.trim() }),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setFeedbackError(body.error ?? `HTTP ${res.status}`);
        return;
      }

      await consumeSSE<FeedbackEvent>(res, (evt) => {
        setFeedbackStep(evt.step);
        if (evt.done != null && evt.total != null) {
          setFeedbackProgress({ done: evt.done, total: evt.total });
        }
        if (evt.step === "done") {
          setFeedbackResult(`${evt.fixed ?? 0} question${(evt.fixed ?? 0) !== 1 ? "s" : ""} updated`);
          setFeedbackText("");
        }
        if (evt.step === "error") {
          setFeedbackError(evt.message ?? "Unknown error");
        }
      });
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : String(err));
    } finally {
      setFeedbackBusy(false);
    }
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const importDone = importStep === "done";
  const importFailed = importStep === "error" || !!importError;

  const STEP_LABELS: Record<ImportStep, string> = {
    upload: "Uploading file to Gemini",
    inspect: "Analyzing file structure",
    convert: "Converting questions",
    saving: "Saving to database",
    done: "Done",
    error: "Error",
  };

  const stepOrder: ImportStep[] = ["upload", "inspect", "convert", "saving", "done"];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-10 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Import Exam from File</h1>
          <p className="text-sm text-gray-400 mt-1">
            Upload any Excel or CSV file — the agent will figure out the structure automatically.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleImport} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">

          {/* File picker */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
              File
            </label>
            <div
              className="flex items-center gap-3 h-10 px-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} className="text-gray-400" />
              <span className="text-sm text-gray-600 truncate flex-1">
                {file ? file.name : "Choose .xlsx / .xls / .csv"}
              </span>
              {file && (
                <FileText size={14} className="text-emerald-500 shrink-0" />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Exam ID + Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                Exam ID
              </label>
              <input
                type="text"
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
                placeholder="my_exam_en"
                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                placeholder="My Exam (optional)"
                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
          </div>

          {/* Lang + Sheet hint */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                Language
              </label>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                <option value="ja">Japanese</option>
                <option value="en">English</option>
                <option value="zh">Chinese</option>
                <option value="ko">Korean</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                Sheet hint <span className="normal-case font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={sheetHint}
                onChange={(e) => setSheetHint(e.target.value)}
                placeholder="Sheet1"
                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={importing || !file || !examId.trim()}
            className="w-full h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {importing ? (
              <><Loader2 size={15} className="animate-spin" /> Importing...</>
            ) : (
              "Import"
            )}
          </button>
        </form>

        {/* Progress panel */}
        {(importing || importDone || importFailed) && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Progress</p>

            {stepOrder.map((step) => {
              const idx = stepOrder.indexOf(step);
              const currentIdx = importStep ? stepOrder.indexOf(importStep) : -1;
              const isDone = importDone ? true : currentIdx > idx;
              const isActive = importStep === step;
              const isError = isActive && importFailed;

              let label = STEP_LABELS[step];
              if (step === "saving" && importProgress) {
                label += ` (${importProgress.done}/${importProgress.total})`;
              }

              return (
                <ProgressRow
                  key={step}
                  label={label}
                  active={isActive && !importDone}
                  done={isDone && !isError}
                  error={isError}
                />
              );
            })}

            {importDone && importedExamId && (
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                <span className="text-sm text-emerald-700 font-medium">
                  {importedCount} questions registered
                </span>
                <Link
                  href={`/exam/${encodeURIComponent(importedExamId)}`}
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors underline"
                >
                  View exam
                </Link>
              </div>
            )}

            {importFailed && importError && (
              <p className="text-sm text-rose-500 pt-1">{importError}</p>
            )}

            <LogPanel lines={agentLog} />
          </div>
        )}

        {/* Feedback panel — visible only after a successful import */}
        {importedExamId && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Feedback</p>
              <p className="text-xs text-gray-400 mt-1">
                Tell the agent what to fix — it will update the imported questions.
              </p>
            </div>

            <form onSubmit={handleFeedback} className="space-y-3">
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="e.g. 選択肢が「A. テキスト」形式になっていない。全問修正して。"
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
              <button
                type="submit"
                disabled={feedbackBusy || !feedbackText.trim()}
                className="h-10 px-4 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {feedbackBusy ? (
                  <><Loader2 size={14} className="animate-spin" /> Sending...</>
                ) : (
                  <><Send size={14} /> Send</>
                )}
              </button>
            </form>

            {/* Feedback progress */}
            {feedbackBusy && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={14} className="animate-spin" />
                {feedbackStep === "analyzing" && "Analyzing feedback..."}
                {feedbackStep === "fixing" && feedbackProgress
                  ? `Applying fixes (${feedbackProgress.done}/${feedbackProgress.total})...`
                  : feedbackStep === "fixing"
                  ? "Applying fixes..."
                  : null}
              </div>
            )}

            {feedbackResult && (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle size={14} />
                {feedbackResult}
              </div>
            )}

            {feedbackError && (
              <div className="flex items-center gap-2 text-sm text-rose-500">
                <AlertCircle size={14} />
                {feedbackError}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
