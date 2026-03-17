"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, Clock, ChevronDown, ChevronUp, Save, Loader2 } from "lucide-react";
import type { Choice, Question, QuestionHistoryEntry } from "@/lib/types";

interface Props {
  question: Question;
  onClose: () => void;
  onSave: (updated: Question) => void;
}

export default function QuestionEditModal({ question, onClose, onSave }: Props) {
  const [questionText, setQuestionText] = useState(question.question);
  const [choices, setChoices] = useState<Choice[]>(question.choices.map((c) => ({ ...c })));
  const [answers, setAnswers] = useState<string[]>([...question.answers]);
  const [explanation, setExplanation] = useState(question.explanation);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<QuestionHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Load history when panel opens
  useEffect(() => {
    if (!historyOpen || history.length > 0) return;
    setHistoryLoading(true);
    fetch(`/api/admin/questions/${encodeURIComponent(question.dbId)}/history`)
      .then((r) => r.json())
      .then((data) => setHistory(data as QuestionHistoryEntry[]))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [historyOpen, question.dbId, history.length]);

  function updateChoiceText(index: number, text: string) {
    setChoices((prev) => prev.map((c, i) => (i === index ? { ...c, text } : c)));
  }

  function addChoice() {
    const label = String.fromCharCode(65 + choices.length); // A, B, C, ...
    setChoices((prev) => [...prev, { label, text: "" }]);
  }

  function removeChoice(index: number) {
    const removed = choices[index];
    setChoices((prev) => prev.filter((_, i) => i !== index));
    setAnswers((prev) => prev.filter((a) => a !== removed.label));
  }

  function toggleAnswer(label: string) {
    setAnswers((prev) =>
      prev.includes(label) ? prev.filter((a) => a !== label) : [...prev, label].sort()
    );
  }

  async function handleSave() {
    if (!questionText.trim()) { setError("Enter question text"); return; }
    if (answers.length === 0) { setError("Select at least one correct answer"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/questions/${encodeURIComponent(question.dbId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_text: questionText, options: choices, answers, explanation }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json() as Question;
      onSave(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900 text-sm">Edit Question</p>
            <p className="text-xs text-gray-400 mt-0.5">v{question.version} · {question.dbId}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Question text */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Question</label>
            <textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              rows={4}
              className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
            />
          </div>

          {/* Choices */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Options
              <span className="ml-2 font-normal text-gray-400 normal-case">Click to mark correct</span>
            </label>
            <div className="space-y-2">
              {choices.map((c, i) => (
                <div key={c.label} className="flex items-start gap-2">
                  <button
                    onClick={() => toggleAnswer(c.label)}
                    title="正解に設定"
                    className={`shrink-0 mt-1 w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center border transition-colors ${
                      answers.includes(c.label)
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-gray-50 border-gray-200 text-gray-400 hover:border-emerald-300"
                    }`}
                  >
                    {i + 1}
                  </button>
                  <input
                    value={c.text}
                    onChange={(e) => updateChoiceText(i, e.target.value)}
                    className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                    placeholder={`Option ${c.label}`}
                  />
                  {choices.length > 2 && (
                    <button
                      onClick={() => removeChoice(i)}
                      className="shrink-0 mt-1 p-1.5 rounded-lg hover:bg-rose-50 text-gray-300 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {choices.length < 8 && (
              <button
                onClick={addChoice}
                className="mt-2 flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-500 transition-colors"
              >
                <Plus size={13} /> Add option
              </button>
            )}
          </div>

          {/* Explanation */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Explanation</label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
              placeholder="Explanation (optional)"
            />
          </div>

          {/* History */}
          <div>
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Clock size={13} />
              History
              {historyOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {historyOpen && (
              <div className="mt-3 space-y-3">
                {historyLoading && (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Loader2 size={12} className="animate-spin" />
                  </div>
                )}
                {!historyLoading && history.length === 0 && (
                  <p className="text-xs text-gray-300">No history</p>
                )}
                {history.map((h) => (
                  <div key={h.id} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500">v{h.version}</span>
                      <span className="text-xs text-gray-300">{new Date(h.changedAt).toLocaleString()} · {h.changedBy ?? "unknown"}</span>
                    </div>
                    <p className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-3">{h.questionText}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          {error && <p className="text-xs text-rose-500 flex-1">{error}</p>}
          {!error && <div className="flex-1" />}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-xl border border-gray-200 transition-colors flex items-center justify-center"
            >
              <X size={14} />
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
