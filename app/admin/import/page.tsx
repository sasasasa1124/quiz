"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import {
  Upload, FileText, ChevronDown, ChevronUp, Send, CheckCircle,
  AlertCircle, Loader2, X, Eye, EyeOff, GripVertical,
} from "lucide-react";
import Link from "next/link";
import * as XLSX from "xlsx";

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

interface ParsedSheet {
  name: string;
  headers: string[];
  rows: string[][];
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function fileToExamId(name: string): string {
  return name
    .replace(/\.(xlsx?|csv)$/i, "")
    .replace(/[^a-zA-Z0-9\u3040-\u9FFF_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase()
    .slice(0, 64);
}

function parseFileClientSide(file: File): Promise<ParsedSheet[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: false });
        const sheets: ParsedSheet[] = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          const raw = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
            header: 1, defval: "", raw: false,
          }) as (string | number)[][];
          if (raw.length === 0) return { name, headers: [], rows: [] };
          const headers = raw[0].map(String);
          const rows = raw.slice(1).map((r) => r.map(String));
          return { name, headers, rows };
        });
        resolve(sheets);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// ── Components ───────────────────────────────────────────────────────────────

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

function ProgressRow({ label, active, done, error }: {
  label: string; active: boolean; done: boolean; error?: boolean;
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

// ── Preview table ────────────────────────────────────────────────────────────

function PreviewTable({ sheet, hiddenCols, onToggleCol }: {
  sheet: ParsedSheet;
  hiddenCols: Set<number>;
  onToggleCol: (idx: number) => void;
}) {
  const PREVIEW_ROWS = 5;
  const visibleHeaders = sheet.headers.map((h, i) => ({ h, i }));

  return (
    <div className="space-y-2">
      {/* Column toggles */}
      <div className="flex flex-wrap gap-1.5">
        {visibleHeaders.map(({ h, i }) => {
          const hidden = hiddenCols.has(i);
          return (
            <button
              key={i}
              onClick={() => onToggleCol(i)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                hidden
                  ? "bg-gray-100 text-gray-300 line-through"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {hidden ? <EyeOff size={10} /> : <Eye size={10} />}
              {h || `Col ${i + 1}`}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-2 py-1.5 text-left text-gray-400 font-medium w-8">#</th>
              {visibleHeaders
                .filter(({ i }) => !hiddenCols.has(i))
                .map(({ h, i }) => (
                  <th key={i} className="px-2 py-1.5 text-left text-gray-500 font-medium max-w-[200px] truncate">
                    {h || `Col ${i + 1}`}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.slice(0, PREVIEW_ROWS).map((row, ri) => (
              <tr key={ri} className="border-t border-gray-50">
                <td className="px-2 py-1.5 text-gray-300 tabular-nums">{ri + 1}</td>
                {visibleHeaders
                  .filter(({ i }) => !hiddenCols.has(i))
                  .map(({ i }) => (
                    <td key={i} className="px-2 py-1.5 text-gray-600 max-w-[200px] truncate">
                      {(row[i] ?? "").slice(0, 80)}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-300 text-right">
        Showing {Math.min(PREVIEW_ROWS, sheet.rows.length)} of {sheet.rows.length} rows
        {hiddenCols.size > 0 && ` · ${hiddenCols.size} column${hiddenCols.size > 1 ? "s" : ""} hidden`}
      </p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  // File + preview state
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [hiddenCols, setHiddenCols] = useState<Set<number>>(new Set());
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Form state
  const [examName, setExamName] = useState("");
  const [lang, setLang] = useState<Lang>("ja");

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

  const activeSheet = sheets[selectedSheet] ?? null;

  // ── File select + parse ──────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (f: File | null) => {
    setFile(f);
    setSheets([]);
    setSelectedSheet(0);
    setHiddenCols(new Set());
    setParseError(null);
    setImportStep(null);
    setImportError(null);

    if (!f) return;

    const baseName = f.name.replace(/\.(xlsx?|csv)$/i, "");
    setExamName(baseName);

    setParsing(true);
    try {
      const parsed = await parseFileClientSide(f);
      const nonEmpty = parsed.filter((s) => s.rows.length > 0);
      if (nonEmpty.length === 0) {
        setParseError("No data rows found in file.");
        return;
      }
      setSheets(nonEmpty);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
    }
  }, []);

  const toggleCol = useCallback((idx: number) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  // ── Import handler ─────────────────────────────────────────────────────────

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !activeSheet) return;

    const autoExamId = fileToExamId(file.name);
    if (!autoExamId) return;

    setImporting(true);
    setImportStep(null);
    setImportProgress(null);
    setImportedExamId(null);
    setImportedCount(null);
    setImportError(null);
    setAgentLog([]);

    const form = new FormData();
    form.append("file", file);
    form.append("examId", autoExamId);
    form.append("examName", examName.trim() || file.name.replace(/\.(xlsx?|csv)$/i, ""));
    form.append("lang", lang);
    if (activeSheet.name !== "CSV") form.append("sheetHint", activeSheet.name);
    // Send hidden columns so the server can filter them out
    if (hiddenCols.size > 0) {
      form.append("hiddenCols", JSON.stringify([...hiddenCols]));
    }

    try {
      const res = await fetch("/api/admin/import", { method: "POST", body: form });
      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}`;
        try {
          const body = await res.json() as { error?: string };
          errorMsg = body.error ?? errorMsg;
        } catch { /* non-json response */ }
        setImportError(errorMsg);
        setImportStep("error");
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
      setImportStep("error");
    } finally {
      setImporting(false);
    }
  }

  // ── Feedback handler ───────────────────────────────────────────────────────

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

  // ── Derived state ──────────────────────────────────────────────────────────

  const importDone = importStep === "done";
  const importFailed = importStep === "error" || !!importError;

  const STEP_LABELS: Record<ImportStep, string> = {
    upload: "Reading file",
    inspect: "Analyzing file structure",
    convert: "Converting questions",
    saving: "Saving to database",
    done: "Done",
    error: "Error",
  };

  const stepOrder: ImportStep[] = ["upload", "inspect", "convert", "saving", "done"];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-10 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Import Exam from File</h1>
          <p className="text-sm text-gray-400 mt-1">
            Upload any Excel or CSV file — AI writes code to parse and convert it automatically.
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
              {file && !parseError && (
                <FileText size={14} className="text-emerald-500 shrink-0" />
              )}
              {parsing && (
                <Loader2 size={14} className="text-gray-400 animate-spin shrink-0" />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            />
            {parseError && (
              <p className="text-xs text-rose-500 mt-1">{parseError}</p>
            )}
          </div>

          {/* Sheet selector (for multi-sheet Excel) */}
          {sheets.length > 1 && (
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                Sheet
              </label>
              <div className="flex flex-wrap gap-1.5">
                {sheets.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setSelectedSheet(i); setHiddenCols(new Set()); }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      i === selectedSheet
                        ? "bg-gray-900 text-white"
                        : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {s.name} ({s.rows.length})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          {activeSheet && activeSheet.rows.length > 0 && (
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                Preview
              </label>
              <PreviewTable
                sheet={activeSheet}
                hiddenCols={hiddenCols}
                onToggleCol={toggleCol}
              />
            </div>
          )}

          {/* Display Name */}
          {activeSheet && (
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                placeholder={file ? file.name.replace(/\.(xlsx?|csv)$/i, "") : "Auto-filled from filename"}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
          )}

          {/* Lang */}
          {activeSheet && (
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
            </div>
          )}

          {/* Submit */}
          {activeSheet && (
            <button
              type="submit"
              disabled={importing || !file || !activeSheet}
              className="w-full h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {importing ? (
                <><Loader2 size={15} className="animate-spin" /> Importing...</>
              ) : (
                `Import ${activeSheet.rows.length} rows`
              )}
            </button>
          )}
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
                placeholder='e.g. 選択肢が「A. テキスト」形式になっていない。全問修正して。'
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
