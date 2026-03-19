"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Brain, BookOpen, BookOpenCheck,
  ChevronRight, AlertCircle, TrendingUp, Tag, Timer, History,
  Pencil, Check, X, Lightbulb, Languages,
} from "lucide-react";
import type { CategoryStat, ExamMeta } from "@/lib/types";
import PageHeader from "./PageHeader";
import ExamQuestionTable from "./ExamQuestionTable";

interface Props {
  exam: ExamMeta;
  categoryStats: CategoryStat[];
  userEmail: string;
}

function pctColor(pct: number) {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 60) return "bg-amber-400";
  return "bg-rose-400";
}

function pctTextColor(pct: number) {
  if (pct >= 80) return "text-emerald-600";
  if (pct >= 60) return "text-amber-500";
  return "text-rose-500";
}

export default function ExamDetailClient({ exam, categoryStats: initialStats, userEmail }: Props) {
  const [stats, setStats] = useState<CategoryStat[]>(initialStats);
  const [statsLoading, setStatsLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<"quiz" | "review">("quiz");
  const [selectedScope, setSelectedScope] = useState<"all" | "continue" | "wrong">("all");
  const [hasContinue, setHasContinue] = useState(false);

  // Exam metadata editing
  const [examName, setExamName] = useState(exam.name);
  const [examLang, setExamLang] = useState<"ja" | "en" | "zh" | "ko">(exam.language);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaSaving, setMetaSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Category rename
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameCatValue, setRenameCatValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const renameCatRef = useRef<HTMLInputElement>(null);

  // Translation
  const [showTranslate, setShowTranslate] = useState(false);
  const [translateLang, setTranslateLang] = useState<"zh" | "ko" | "en" | "ja">("zh");
  const [translateProgress, setTranslateProgress] = useState<{ done: number; total: number } | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [newExamId, setNewExamId] = useState<string | null>(null);

  useEffect(() => {
    if (editingMeta) nameInputRef.current?.focus();
  }, [editingMeta]);

  useEffect(() => {
    if (renamingCategory !== null) renameCatRef.current?.focus();
  }, [renamingCategory]);

  async function saveExamMeta() {
    setMetaSaving(true);
    try {
      await fetch(`/api/admin/exams/${encodeURIComponent(exam.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: examName, language: examLang }),
      });
      setEditingMeta(false);
    } finally {
      setMetaSaving(false);
    }
  }

  function cancelEditMeta() {
    setExamName(exam.name);
    setExamLang(exam.language);
    setEditingMeta(false);
  }

  function startRenameCategory(catName: string) {
    setRenamingCategory(catName);
    setRenameCatValue(catName);
  }

  async function saveRenameCategory(oldName: string) {
    if (!renameCatValue.trim() || renameCatValue.trim() === oldName) {
      setRenamingCategory(null);
      return;
    }
    setRenameSaving(true);
    try {
      await fetch(`/api/admin/exams/${encodeURIComponent(exam.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renameCategory: { from: oldName, to: renameCatValue.trim() } }),
      });
      setStats((prev) =>
        prev.map((s) => s.category === oldName ? { ...s, category: renameCatValue.trim() } : s)
      );
      setRenamingCategory(null);
    } finally {
      setRenameSaving(false);
    }
  }

  async function startTranslation() {
    setTranslateProgress({ done: 0, total: 0 });
    setTranslateError(null);
    setNewExamId(null);

    try {
      const res = await fetch(`/api/admin/exams/${encodeURIComponent(exam.id)}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLanguage: translateLang }),
      });

      if (!res.ok || !res.body) {
        setTranslateError("翻訳の開始に失敗しました");
        setTranslateProgress(null);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6)) as {
              done?: number; total?: number; newExamId?: string; error?: string;
            };
            if (data.error) {
              setTranslateError(data.error);
              setTranslateProgress(null);
              return;
            }
            if (data.newExamId) {
              setNewExamId(data.newExamId);
              setTranslateProgress(null);
            } else if (data.total !== undefined) {
              setTranslateProgress({ done: data.done ?? 0, total: data.total });
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e) {
      setTranslateError(e instanceof Error ? e.message : "エラーが発生しました");
      setTranslateProgress(null);
    }
  }

  // Check for saved position in localStorage
  useEffect(() => {
    const savedId = localStorage.getItem(`quiz-last-index-${exam.id}`);
    setHasContinue(savedId !== null && Number.isFinite(Number(savedId)));
  }, [exam.id]);

  // Refresh category stats from API when page loads (picks up any in-flight score updates)
  useEffect(() => {
    fetch(`/api/category-stats?examId=${encodeURIComponent(exam.id)}`)
      .then((r) => r.json() as Promise<CategoryStat[]>)
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setStats(data);
        setStatsLoading(false);
      })
      .catch(() => { setStatsLoading(false); });
  }, [exam.id]);

  const totalQuestions = stats.reduce((s, c) => s + c.total, 0);
  const totalAttempted = stats.reduce((s, c) => s + c.attempted, 0);
  const totalCorrect = stats.reduce((s, c) => s + c.correct, 0);
  const overallPct = totalAttempted > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null;

  const wrongCount = stats.reduce((s, c) => s + (c.attempted - c.correct), 0);

  // Reset scope if the selected option becomes unavailable
  useEffect(() => {
    if (selectedScope === "wrong" && wrongCount === 0) setSelectedScope("all");
    if (selectedScope === "continue" && !hasContinue) setSelectedScope("all");
  }, [wrongCount, hasContinue, selectedScope]);

  const startHref = (() => {
    const params = new URLSearchParams({ mode: selectedMode });
    if (selectedScope !== "all") params.set("filter", selectedScope);
    return `/quiz/${encodeURIComponent(exam.id)}?${params.toString()}`;
  })();

  const startLabel =
    selectedScope === "wrong" ? `Start ${wrongCount} wrong` :
    selectedScope === "continue" ? "Continue" :
    `Start all ${exam.questionCount}`;

  const weakCategories = stats.filter(
    (c) => c.attempted > 0 && Math.round((c.correct / c.total) * 100) < 60
  );

  const modeHref = (category?: string | null) => {
    const params = new URLSearchParams({ mode: selectedMode });
    if (category) params.set("category", category);
    return `/quiz/${exam.id}?${params.toString()}`;
  };

  const answersHref = (category?: string | null) => {
    const params = new URLSearchParams({ mode: "answers" });
    if (category) params.set("category", category);
    return `/quiz/${exam.id}?${params.toString()}`;
  };

  // Available translation targets
  const allLangOptions: { value: "zh" | "ko" | "en" | "ja"; label: string }[] = [
    { value: "zh", label: "中文" },
    { value: "ko", label: "한국어" },
    { value: "en", label: "EN" },
    { value: "ja", label: "日本語" },
  ];
  const translateOptions = allLangOptions.filter((o) => o.value !== exam.language);

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
      <PageHeader
        back={{ href: "/" }}
        title={examName}
        right={
          !editingMeta ? (
            <button
              onClick={() => setEditingMeta(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
              title="Edit exam"
            >
              <Pencil size={12} /> 編集
            </button>
          ) : null
        }
      />
      {editingMeta && (
        <div className="bg-white border-b border-gray-200 px-4 sm:px-8 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-2">
            <input
              ref={nameInputRef}
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
              placeholder="Exam name"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) saveExamMeta(); if (e.key === "Escape") cancelEditMeta(); }}
            />
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {(["ja", "en", "zh", "ko"] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setExamLang(lang)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${examLang === lang ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {lang === "ja" ? "JP" : lang === "en" ? "EN" : lang === "zh" ? "ZH" : "KO"}
                </button>
              ))}
            </div>
            <button
              onClick={saveExamMeta}
              disabled={metaSaving || !examName.trim()}
              className="p-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              <Check size={13} />
            </button>
            <button
              onClick={cancelEditMeta}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      <main className={`flex-1 px-4 sm:px-8 py-6 max-w-2xl mx-auto w-full transition-opacity duration-300 ${statsLoading ? "opacity-60" : "opacity-100"}`}>

        {/* ── Overall progress ── */}
        {overallPct !== null && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={15} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Progress</span>
              </div>
              <span className={`text-2xl font-bold tabular-nums ${pctTextColor(overallPct)}`}>
                {overallPct}%
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pctColor(overallPct)}`}
                style={{ width: `${overallPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {totalCorrect}/{totalQuestions} correct · {totalAttempted} answered
            </p>
          </div>
        )}

        {/* ── Weak areas summary ── */}
        {weakCategories.length > 0 && (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle size={14} className="text-rose-400" />
              <span className="text-sm font-semibold text-rose-700">Weak Areas</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {weakCategories.map((c) => (
                <Link
                  key={c.category}
                  href={modeHref(c.category)}
                  className="text-xs bg-white border border-rose-200 text-rose-600 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-colors flex items-center gap-1.5"
                >
                  {c.category ?? "Uncategorized"}
                  <span className="text-rose-400">
                    {Math.round((c.correct / c.total) * 100)}%
                  </span>
                  <ChevronRight size={11} />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Category breakdown ── */}
        {stats.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-4">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
              <Tag size={14} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-700">Score by Category</span>
            </div>
            <div className="divide-y divide-gray-50">
              {stats.map((cat) => {
                const pct = cat.attempted > 0
                  ? Math.round((cat.correct / cat.total) * 100)
                  : null;
                const catName = cat.category ?? "Uncategorized";
                const isRenaming = renamingCategory === catName;
                return (
                  <div key={catName} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group">
                    <div className="flex-1 min-w-0">
                      {isRenaming ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            ref={renameCatRef}
                            value={renameCatValue}
                            onChange={(e) => setRenameCatValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.nativeEvent.isComposing) saveRenameCategory(catName);
                              if (e.key === "Escape") setRenamingCategory(null);
                            }}
                            className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
                          />
                          <button
                            onClick={() => saveRenameCategory(catName)}
                            disabled={renameSaving}
                            className="p-1 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={() => setRenamingCategory(null)}
                            className="p-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Link href={modeHref(cat.category)} className="text-sm text-gray-700 truncate hover:text-gray-900 transition-colors">
                              {catName}
                            </Link>
                            <button
                              onClick={() => startRenameCategory(catName)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-300 hover:text-gray-500 transition-all shrink-0"
                              title="カテゴリ名を変更"
                            >
                              <Pencil size={11} />
                            </button>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-gray-400 tabular-nums">
                              {cat.attempted}/{cat.total}
                            </span>
                            {pct !== null && (
                              <span className={`text-sm font-bold tabular-nums w-10 text-right ${pctTextColor(pct)}`}>
                                {pct}%
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {!isRenaming && (
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          {pct !== null ? (
                            <div
                              className={`h-full rounded-full ${pctColor(pct)}`}
                              style={{ width: `${pct}%` }}
                            />
                          ) : (
                            <div className="h-full w-0" />
                          )}
                        </div>
                      )}
                    </div>
                    {!isRenaming && (
                      <Link href={modeHref(cat.category)}>
                        <ChevronRight size={13} className="text-gray-200 group-hover:text-gray-400 transition-colors shrink-0" />
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Study modes ── */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-700">Start</span>
          </div>

          <div className="px-5 pt-4 pb-5 flex flex-col gap-4">

            {/* Questions — scope */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Questions</span>
              <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => setSelectedScope("all")}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedScope === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  All {exam.questionCount}
                </button>
                <button
                  onClick={() => hasContinue && setSelectedScope("continue")}
                  disabled={!hasContinue}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                    selectedScope === "continue" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <History size={13} /> 続きから
                </button>
                <button
                  onClick={() => wrongCount > 0 && setSelectedScope("wrong")}
                  disabled={wrongCount === 0}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                    selectedScope === "wrong" ? "bg-white text-rose-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <AlertCircle size={13} /> {wrongCount > 0 ? wrongCount : "Wrong"}
                </button>
              </div>
            </div>

            {/* Mode */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Mode</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedMode("quiz")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    selectedMode === "quiz"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <Brain size={14} strokeWidth={1.75} /> Quiz
                </button>
                <button
                  onClick={() => setSelectedMode("review")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    selectedMode === "review"
                      ? "border-purple-500 bg-purple-50 text-purple-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <BookOpen size={14} strokeWidth={1.75} /> Flashcard
                </button>
              </div>
            </div>

            {/* Primary CTA */}
            <Link
              href={startHref}
              className="w-full h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
            >
              {startLabel}
              <ChevronRight size={15} />
            </Link>

            {/* Secondary — Answer Sheet + Mock Exam */}
            <div className="border-t border-gray-100 pt-3 flex gap-2">
              <Link
                href={answersHref(null)}
                className="flex-1 h-10 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <BookOpenCheck size={14} /> Answer Sheet
              </Link>
              <Link
                href={`/quiz/${encodeURIComponent(exam.id)}?mode=mock`}
                className="flex-1 h-10 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <Timer size={14} /> Mock Exam
              </Link>
            </div>

            {/* Study Guide + Translate */}
            <div className="flex gap-2">
              <Link
                href={`/quiz/${encodeURIComponent(exam.id)}?mode=study-guide`}
                className="flex-1 h-10 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <Lightbulb size={14} /> Study Guide
              </Link>
              {translateOptions.length > 0 && (
                <button
                  onClick={() => { setShowTranslate((v) => !v); setTranslateProgress(null); setTranslateError(null); setNewExamId(null); }}
                  className="flex-1 h-10 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Languages size={14} /> 翻訳して作成
                </button>
              )}
            </div>

            {/* Translation panel */}
            {showTranslate && (
              <div className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">翻訳先言語</p>
                <div className="flex gap-1.5">
                  {translateOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTranslateLang(opt.value)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        translateLang === opt.value
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 text-gray-600 hover:bg-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {translateProgress && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>翻訳中...</span>
                      <span>{translateProgress.done}/{translateProgress.total || "?"}</span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      {translateProgress.total > 0 && (
                        <div
                          className="h-full bg-gray-900 rounded-full transition-all"
                          style={{ width: `${Math.round((translateProgress.done / translateProgress.total) * 100)}%` }}
                        />
                      )}
                    </div>
                  </div>
                )}
                {translateError && (
                  <p className="text-xs text-rose-500">{translateError}</p>
                )}
                {newExamId && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-emerald-600 font-medium">翻訳が完了しました</p>
                    <Link
                      href={`/exam/${encodeURIComponent(newExamId)}`}
                      className="w-full h-9 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      新しい試験を開く <ChevronRight size={14} />
                    </Link>
                  </div>
                )}
                {!translateProgress && !newExamId && (
                  <button
                    onClick={startTranslation}
                    className="w-full h-9 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Languages size={14} /> 翻訳開始
                  </button>
                )}
              </div>
            )}

          </div>
        </div>
        <ExamQuestionTable examId={exam.id} userEmail={userEmail} />
      </main>
    </div>
  );
}
