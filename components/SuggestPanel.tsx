"use client";

import { useState, useCallback, useEffect } from "react";
import { ChevronDown, ChevronUp, Plus, Loader2, Bot, User, Trash2, Check } from "lucide-react";
import type { Choice, Suggestion } from "@/lib/types";
import { useSettings } from "@/lib/settings-context";

interface Props {
  questionId: string;
  choices: Choice[];
}

export default function SuggestPanel({ questionId, choices }: Props) {
  const { t } = useSettings();
  const [expanded, setExpanded] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formAnswers, setFormAnswers] = useState<string[]>([]);
  const [formExplanation, setFormExplanation] = useState("");
  const [formComment, setFormComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    fetch(`/api/suggestions?questionId=${encodeURIComponent(questionId)}&count=1`)
      .then((r) => r.json() as Promise<{ count: number }>)
      .then((data) => setCount(data.count))
      .catch(() => {/* ignore */});
  }, [questionId]);

  const load = useCallback(async () => {
    if (suggestions !== null) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/suggestions?questionId=${encodeURIComponent(questionId)}`);
      const data = await res.json() as Suggestion[];
      setSuggestions(data);
      setCount(data.length);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [questionId, suggestions]);

  const handleToggle = () => {
    if (!expanded) load();
    setExpanded((v) => !v);
  };

  const toggleAnswer = (label: string) => {
    setFormAnswers((prev) =>
      prev.includes(label) ? prev.filter((a) => a !== label) : [...prev, label]
    );
  };

  const handleSubmit = async () => {
    if (!formAnswers.length && !formExplanation.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          type: "manual",
          suggestedAnswers: formAnswers.length ? formAnswers : null,
          suggestedExplanation: formExplanation.trim() || null,
          comment: formComment.trim() || null,
        }),
      });
      const data = await res.json() as { ok: boolean; suggestion: Suggestion };
      if (data.ok) {
        setSuggestions((prev) => [data.suggestion, ...(prev ?? [])]);
        setCount((c) => (c !== null ? c + 1 : 1));
        setShowForm(false);
        setFormAnswers([]);
        setFormExplanation("");
        setFormComment("");
        setSuccessMsg(t("suggestSuccess"));
        setTimeout(() => setSuccessMsg(""), 3000);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: number) => {
    setSuggestions((prev) => prev?.filter((s) => s.id !== id) ?? null);
    setCount((c) => (c !== null ? c - 1 : null));
  };

  const handleAdopt = (id: number) => {
    setSuccessMsg(t("suggestSuccess"));
    setTimeout(() => setSuccessMsg(""), 3000);
    setSuggestions((prev) => prev?.filter((s) => s.id !== id) ?? null);
    setCount((c) => (c !== null ? c - 1 : null));
  };

  return (
    <div className="border-t border-gray-100 mt-4 pt-4">
      {/* Header */}
      <button
        onClick={handleToggle}
        className="flex items-center justify-between w-full text-left group"
      >
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider group-hover:text-gray-500 transition-colors">
          {t("alternatives")}{count !== null ? ` (${count})` : ""}
        </span>
        {expanded ? (
          <ChevronUp size={14} className="text-gray-400" />
        ) : (
          <ChevronDown size={14} className="text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 size={16} className="animate-spin text-gray-300" />
            </div>
          )}

          {!loading && suggestions?.length === 0 && !showForm && (
            <p className="text-xs text-gray-400">{t("suggestNone")}</p>
          )}

          {!loading && suggestions?.map((s) => (
            <SuggestionCard key={s.id} suggestion={s} t={t} onDelete={handleDelete} onAdopt={handleAdopt} />
          ))}

          {successMsg && (
            <p className="text-xs text-emerald-600 font-medium">{successMsg}</p>
          )}

          {showForm ? (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              {/* Answer multi-select */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {t("suggestAnswers")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {choices.map((c) => (
                    <button
                      key={c.label}
                      onClick={() => toggleAnswer(c.label)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                        formAnswers.includes(c.label)
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Explanation */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  {t("suggestExplanation")}
                </p>
                <textarea
                  value={formExplanation}
                  onChange={(e) => setFormExplanation(e.target.value)}
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
              </div>

              {/* Comment */}
              <div>
                <input
                  type="text"
                  value={formComment}
                  onChange={(e) => setFormComment(e.target.value)}
                  placeholder={t("suggestComment")}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowForm(false); setFormAnswers([]); setFormExplanation(""); setFormComment(""); }}
                  className="flex-1 h-9 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 transition-colors"
                >
                  {t("dismiss")}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || (!formAnswers.length && !formExplanation.trim())}
                  className="flex-1 h-9 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-40"
                >
                  {submitting ? <Loader2 size={13} className="animate-spin mx-auto" /> : t("suggestSubmit")}
                </button>
              </div>
            </div>
          ) : (
            !loading && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <Plus size={12} />
                Add suggestion
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  t,
  onDelete,
  onAdopt,
}: {
  suggestion: Suggestion;
  t: (key: Parameters<typeof import("@/lib/i18n").t>[1]) => string;
  onDelete: (id: number) => void;
  onAdopt: (id: number) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [adopting, setAdopting] = useState(false);

  const isAi = suggestion.type === "ai";
  const author = suggestion.createdBy.split("@")[0];
  const rawDate = suggestion.createdAt;
  const date = rawDate
    ? new Date(rawDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/suggestions/${suggestion.id}`, { method: "DELETE" });
      onDelete(suggestion.id);
    } finally {
      setDeleting(false);
    }
  };

  const handleAdopt = async () => {
    setAdopting(true);
    try {
      await fetch(`/api/suggestions/${suggestion.id}/adopt`, { method: "POST" });
      onAdopt(suggestion.id);
    } finally {
      setAdopting(false);
    }
  };

  return (
    <div className="border border-gray-100 rounded-xl p-3 space-y-2">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
            isAi
              ? "bg-scholion-50 text-scholion-500 border border-scholion-200"
              : "bg-scholion-50 text-scholion-500 border border-scholion-200"
          }`}
        >
          {isAi ? <Bot size={10} /> : <User size={10} />}
          {isAi ? t("suggestTypeAi") : t("suggestTypeManual")}
        </span>
        {isAi && suggestion.aiModel && (
          <span className="text-[10px] text-gray-400">{suggestion.aiModel}</span>
        )}
        <span className="ml-auto text-[10px] text-gray-400">
          {author}{date ? ` · ${date}` : ""}
        </span>
        <button
          onClick={handleAdopt}
          disabled={adopting || deleting}
          title="Adopt this suggestion"
          className="p-1 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40"
        >
          {adopting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting || adopting}
          title="Delete this suggestion"
          className="p-1 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-40"
        >
          {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        </button>
      </div>

      {/* Suggested answers */}
      {suggestion.suggestedAnswers && suggestion.suggestedAnswers.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            {t("suggestAnswers")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestion.suggestedAnswers.map((label) => (
              <span
                key={label}
                className="w-6 h-6 rounded-lg bg-emerald-500 text-white text-xs font-bold flex items-center justify-center"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Explanation */}
      {suggestion.suggestedExplanation && (
        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
          {suggestion.suggestedExplanation}
        </p>
      )}

      {/* Comment */}
      {suggestion.comment && (
        <p className="text-xs text-gray-400 italic">{suggestion.comment}</p>
      )}
    </div>
  );
}
