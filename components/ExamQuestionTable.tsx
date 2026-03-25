"use client";

import { useState, useCallback, useMemo } from "react";
import { ChevronDown, ChevronUp, X, Search } from "lucide-react";
import type { Question } from "@/lib/types";
import { RichText } from "./RichText";

type QuestionWithInvalidated = Question & { invalidated: boolean };

interface Props {
  examId: string;
  userEmail: string;
}

interface ModalQuestion extends QuestionWithInvalidated {}

export default function ExamQuestionTable({ examId, userEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<QuestionWithInvalidated[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("__all__");
  const [showInvalidatedOnly, setShowInvalidatedOnly] = useState(false);
  const [modal, setModal] = useState<ModalQuestion | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadQuestions = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/questions?examId=${encodeURIComponent(examId)}`);
      const data = await res.json() as { questions: QuestionWithInvalidated[] };
      setQuestions(data.questions ?? []);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [examId, loaded]);

  const handleToggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next) await loadQuestions();
  }, [open, loadQuestions]);

  const toggleInvalidated = useCallback(async (q: QuestionWithInvalidated, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userEmail || togglingId === q.dbId) return;
    setTogglingId(q.dbId);
    try {
      const res = await fetch(`/api/user/questions/${encodeURIComponent(q.dbId)}/invalidate`, { method: "POST" });
      const { invalidated } = await res.json() as { invalidated: boolean };
      setQuestions((prev) => prev.map((item) => item.dbId === q.dbId ? { ...item, invalidated } : item));
      if (modal?.dbId === q.dbId) setModal((m) => m ? { ...m, invalidated } : m);
    } finally {
      setTogglingId(null);
    }
  }, [userEmail, togglingId, modal]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(questions.map((q) => q.category ?? ""))).filter(Boolean).sort();
    return cats;
  }, [questions]);

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (showInvalidatedOnly && !q.invalidated) return false;
      if (categoryFilter !== "__all__" && (q.category ?? "") !== categoryFilter) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        return q.question.toLowerCase().includes(s);
      }
      return true;
    });
  }, [questions, search, categoryFilter, showInvalidatedOnly]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mt-4">
      {/* Accordion header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700">
          Questions {loaded ? `(${questions.length})` : ""}
        </span>
        {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {/* Filter bar */}
          <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-100 flex-wrap">
            <div className="relative flex-1 min-w-[140px]">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
              <input
                type="text"
                placeholder="Search questions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 pl-7 pr-3 rounded-lg border border-gray-200 text-xs text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300"
              />
            </div>
            {categories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-8 px-2 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none"
              >
                <option value="__all__">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <button
              onClick={() => setShowInvalidatedOnly((v) => !v)}
              className={`h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors ${
                showInvalidatedOnly
                  ? "border-rose-300 bg-rose-50 text-rose-600"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              Invalidated
            </button>
          </div>

          {loading ? (
            <div className="px-5 py-6 text-center text-xs text-gray-400">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-3 py-2 font-semibold text-gray-400 w-12 shrink-0">#</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-400">Question</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-400 w-28">Category</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-400 w-16">Ans</th>
                    <th className="text-center px-3 py-2 font-semibold text-gray-400 w-12">Dup</th>
                    <th className="text-center px-3 py-2 font-semibold text-gray-400 w-16">Invalid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-6 text-center text-gray-300">No questions</td>
                    </tr>
                  ) : (
                    filtered.map((q) => (
                      <tr
                        key={q.dbId}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onDoubleClick={() => setModal(q)}
                      >
                        <td className="px-3 py-0 h-10 text-gray-400 tabular-nums w-12">{q.id}</td>
                        <td className="px-3 py-0 h-10 max-w-0">
                          <p className="truncate text-gray-700">{q.question.replace(/<[^>]+>/g, "")}</p>
                        </td>
                        <td className="px-3 py-0 h-10 w-28">
                          <p className="truncate text-gray-500">{q.category ?? <span className="text-gray-300">—</span>}</p>
                        </td>
                        <td className="px-3 py-0 h-10 w-16">
                          <span className="truncate text-gray-600 font-mono">{q.answers.join(", ")}</span>
                        </td>
                        <td className="px-3 py-0 h-10 w-12 text-center">
                          {q.isDuplicate && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-gray-400 bg-gray-100 text-[10px]">dup</span>
                          )}
                        </td>
                        <td className="px-3 py-0 h-10 w-16 text-center">
                          <input
                            type="checkbox"
                            checked={q.invalidated}
                            disabled={togglingId === q.dbId || !userEmail}
                            onChange={() => {}}
                            onClick={(e) => toggleInvalidated(q, e)}
                            className="w-3.5 h-3.5 rounded accent-rose-500 cursor-pointer disabled:opacity-40"
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Double-click modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-[2px]"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700">Q{modal.id}</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-rose-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modal.invalidated}
                    disabled={togglingId === modal.dbId || !userEmail}
                    onChange={() => {}}
                    onClick={(e) => toggleInvalidated(modal, e)}
                    className="w-3.5 h-3.5 rounded accent-rose-500 cursor-pointer disabled:opacity-40"
                  />
                  Invalidated
                </label>
                <button onClick={() => setModal(null)} className="text-gray-300 hover:text-gray-600 transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="px-6 py-4 space-y-4">
              <RichText text={modal.question} block className="text-sm text-gray-800 leading-relaxed" />
              <div className="space-y-2">
                {modal.choices.map((c) => {
                  const isCorrect = modal.answers.includes(c.label);
                  return (
                    <div
                      key={c.label}
                      className={`flex items-start gap-3 px-4 py-2.5 rounded-xl border text-sm ${
                        isCorrect
                          ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                          : "border-gray-100 text-gray-600"
                      }`}
                    >
                      <span className={`shrink-0 w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center ${
                        isCorrect ? "bg-emerald-500 text-white" : "border border-gray-200 text-gray-400"
                      }`}>
                        {c.label}
                      </span>
                      <RichText text={c.text} className="leading-snug" />
                    </div>
                  );
                })}
              </div>
              {modal.explanation && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-3 leading-relaxed">
                  <RichText text={modal.explanation} block />
                </div>
              )}
              {modal.category && (
                <p className="text-xs text-gray-400">Category: {modal.category}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
