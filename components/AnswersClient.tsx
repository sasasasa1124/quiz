"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, Sparkles, Wand2, ShieldCheck, Pencil, RotateCcw, Loader2, Clock } from "lucide-react";
import type { Question, QuestionHistoryEntry } from "@/lib/types";
import { RichText } from "./RichText";
import QuizHeader from "./QuizHeader";
import { useStatsSync } from "@/hooks/useStatsSync";
import { useAiPopups } from "@/hooks/useAiPopups";

const QuestionEditModal = dynamic(() => import("./QuestionEditModal"), { ssr: false });
const AiExplainPopup = dynamic(() => import("./AiExplainPopup"), { ssr: false });
const AiRefinePopup = dynamic(() => import("./AiRefinePopup"), { ssr: false });
const AiFactCheckPopup = dynamic(() => import("./AiFactCheckPopup"), { ssr: false });
import { useSettings } from "@/lib/settings-context";
import { useAudio } from "@/hooks/useAudio";
import { useSetHeader } from "@/lib/header-context";
import { buildAnswerText } from "@/lib/ttsText";

interface Props {
  questions: Question[];
  examName: string;
  examId: string;
  userEmail: string;
  activeCategory?: string | null;
}

export default function AnswersClient({ questions: initialQuestions, examName, examId, userEmail: _userEmail, activeCategory }: Props) {
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const [versionHistory, setVersionHistory] = useState<QuestionHistoryEntry[]>([]);
  const [versionHistoryLoading, setVersionHistoryLoading] = useState(false);
  const [revertingHistoryId, setRevertingHistoryId] = useState<number | null>(null);
  const { stats } = useStatsSync(examId);
  const [filter, setFilter] = useState<"all" | "wrong">("all");

  useSetHeader({ hidden: true }, []);
  const { settings, t } = useSettings();
  const { speak, stop, prefetch, playing: audioPlaying, loading: audioLoading } = useAudio();

  // Derived stats
  const totalAnswered = questions.filter((q) => stats[String(q.id)] !== undefined).length;
  const totalCorrect = questions.filter((q) => stats[String(q.id)] === 1).length;
  const overallRate = totalAnswered > 0 ? Math.round((totalCorrect / questions.length) * 100) : null;
  const wrongCount = questions.filter((q) => stats[String(q.id)] === 0).length;

  // Streak: longest consecutive correct answers from stats
  const streak = (() => {
    let best = 0, cur = 0;
    for (const q of questions) {
      if (stats[String(q.id)] === 1) { cur++; best = Math.max(best, cur); }
      else cur = 0;
    }
    return best;
  })();

  // Filtered questions
  const filteredQuestions = filter === "wrong"
    ? questions.filter((q) => stats[String(q.id)] === 0)
    : questions;

  // Clamp index when filter changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [filter]);

  useEffect(() => {
    if (filteredQuestions.length > 0 && currentIndex >= filteredQuestions.length) {
      setCurrentIndex(filteredQuestions.length - 1);
    }
  }, [filteredQuestions.length, currentIndex]);

  // Auto-play when question changes; auto-advance to next when audio finishes
  useEffect(() => {
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    const next = filteredQuestions[currentIndex + 1];
    if (next) prefetch(buildAnswerText(next, settings.language)[0]);
    let cancelled = false;
    speak(buildAnswerText(q, settings.language)).then(() => {
      if (!cancelled && next && settings.audioMode) {
        setCurrentIndex((i) => i + 1);
      }
    });
    return () => { cancelled = true; stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, speak, stop, prefetch, settings.language, settings.audioMode]);

  const handleVersionPanelToggle = useCallback(async () => {
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    if (versionPanelOpen) { setVersionPanelOpen(false); return; }
    setVersionPanelOpen(true);
    setVersionHistory([]);
    setVersionHistoryLoading(true);
    try {
      const res = await fetch(`/api/admin/questions/${encodeURIComponent(q.dbId)}/history`);
      const data = await res.json() as QuestionHistoryEntry[];
      setVersionHistory(data);
    } catch { /* ignore */ }
    finally { setVersionHistoryLoading(false); }
  }, [filteredQuestions, currentIndex, versionPanelOpen]);

  const handleRevertFromPanel = useCallback(async (h: QuestionHistoryEntry) => {
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    setRevertingHistoryId(h.id);
    try {
      const res = await fetch(`/api/admin/questions/${encodeURIComponent(q.dbId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text: h.questionText,
          options: h.options,
          answers: h.answers,
          explanation: h.explanation,
          change_reason: `Reverted to v${h.version}`,
        }),
      });
      if (!res.ok) throw new Error("Revert failed");
      const updated = await res.json() as Question;
      setQuestions((prev) => prev.map((qq) => qq.dbId === updated.dbId ? updated : qq));
      setVersionPanelOpen(false);
    } catch { /* ignore */ }
    finally { setRevertingHistoryId(null); }
  }, [filteredQuestions, currentIndex]);

  const handleQuestionSave = useCallback((updated: Question) => {
    setQuestions((prev) => prev.map((q) => (q.dbId === updated.dbId ? updated : q)));
  }, []);

  const {
    aiPopupOpen, aiLoading, aiResult, aiError, aiAdopting, aiSuggesting,
    handleAiExplain, handleAiAdopt, handleAiSuggest, dismissExplain,
    refinePopupOpen, refineLoading, refineResult, refineError, refineAdopting,
    handleAiRefine, handleRefineAdopt, dismissRefine,
    factCheckPopupOpen, factCheckLoading, factCheckResult, factCheckError, factCheckAdopting,
    handleAiFactCheck, handleFactCheckAdopt, dismissFactCheck,
  } = useAiPopups({
    currentQuestion: filteredQuestions[currentIndex],
    aiPrompt: settings.aiPrompt,
    aiRefinePrompt: settings.aiRefinePrompt,
    aiFactCheckPrompt: settings.aiFactCheckPrompt,
    onQuestionUpdate: (updated) => setQuestions((prev) => prev.map((q) => q.dbId === updated.dbId ? updated : q)),
  });

  const goNext = useCallback(() => { setVersionPanelOpen(false); setCurrentIndex((i) => Math.min(i + 1, filteredQuestions.length - 1)); }, [filteredQuestions.length]);
  const goPrev = useCallback(() => { setVersionPanelOpen(false); setCurrentIndex((i) => Math.max(i - 1, 0)); }, []);

  const handleReplay = useCallback(() => {
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    speak(buildAnswerText(q, settings.language));
  }, [filteredQuestions, currentIndex, speak, settings.language]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingQuestion || aiPopupOpen || refinePopupOpen || factCheckPopupOpen) return;
      if (e.key === "ArrowRight" || e.key === "Enter") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editingQuestion, aiPopupOpen, refinePopupOpen, factCheckPopupOpen, goNext, goPrev]);

  // Touch swipe
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 50) return;
    if (dx < 0) goNext();
    else goPrev();
  }, [goNext, goPrev]);

  const q = filteredQuestions[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === filteredQuestions.length - 1;
  const sliderPct = filteredQuestions.length > 1
    ? `${(currentIndex / (filteredQuestions.length - 1)) * 100}%`
    : "0%";

  if (!q) {
    return (
      <div className="h-screen flex flex-col overflow-hidden bg-[#f8f9fb]">
        <QuizHeader
          examId={examId}
          examName={examName}
          mode="answers"
          activeCategory={activeCategory}
          totalCorrect={totalCorrect}
          totalQuestions={questions.length}
          overallRate={overallRate}
          streak={streak}
          filter={filter as "all" | "continue" | "wrong" | "custom"}
          onFilterChange={(f) => setFilter(f === "continue" || f === "custom" ? "all" : f)}
          wrongCount={wrongCount}
          onReplay={handleReplay}
          audioPlaying={audioPlaying || audioLoading}
        />
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          {t("noWrongAnswers")}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8f9fb]">
      {/* Header */}
      <QuizHeader
        examId={examId}
        examName={examName}
        mode="answers"
        activeCategory={activeCategory}
        totalCorrect={totalCorrect}
        totalQuestions={questions.length}
        overallRate={overallRate}
        streak={streak}
        filter={filter as "all" | "continue" | "wrong" | "custom"}
        onFilterChange={(f) => setFilter(f === "continue" || f === "custom" ? "all" : f)}
        wrongCount={wrongCount}
        onReplay={handleReplay}
        audioPlaying={audioPlaying || audioLoading}
      />

      {/* Main */}
      <div
        className="flex-1 overflow-y-auto px-4 sm:px-8 py-5"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          {/* Question */}
          <div className="bg-gray-50 rounded-xl px-5 py-4 lg:px-6 lg:py-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-gray-400 flex items-center gap-1 relative">
                Q{currentIndex + 1}
                {q.isMultiple && <span className="ml-2 text-violet-500 font-semibold">Multi</span>}
                <button
                  onClick={handleVersionPanelToggle}
                  className="ml-1 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded px-1 py-0.5 transition-colors flex items-center gap-0.5"
                  title="Version history"
                >
                  <Clock size={9} />
                  v{q.version}
                </button>
                {versionPanelOpen && (
                  <div className="absolute top-full left-0 mt-1 z-50 w-72 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-100 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Version History</div>
                    <div className="max-h-60 overflow-y-auto">
                      {versionHistoryLoading && (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 size={14} className="animate-spin text-gray-400" />
                        </div>
                      )}
                      {!versionHistoryLoading && versionHistory.length === 0 && (
                        <p className="text-xs text-gray-300 px-3 py-3">No history</p>
                      )}
                      {versionHistory.map((h) => (
                        <div key={h.id} className="px-3 py-2.5 border-b border-gray-50 last:border-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-semibold text-gray-500">v{h.version}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-300">{new Date(h.changedAt).toLocaleString()}</span>
                              <button
                                onClick={() => handleRevertFromPanel(h)}
                                disabled={revertingHistoryId === h.id}
                                className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-scholion-500 hover:bg-scholion-50 border border-gray-200 rounded-md transition-colors disabled:opacity-40"
                              >
                                {revertingHistoryId === h.id ? <Loader2 size={8} className="animate-spin" /> : <RotateCcw size={8} />}
                                Revert
                              </button>
                            </div>
                          </div>
                          {h.changeReason && <p className="text-[10px] text-amber-600 truncate">{h.changeReason}</p>}
                          <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed">{h.questionText}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleAiRefine}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 transition-colors"
                  title={t("refine")}
                >
                  <Wand2 size={11} />
                  {t("refine")}
                </button>
                <button
                  onClick={() => setEditingQuestion(q)}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
                  title={t("edit")}
                >
                  <Pencil size={11} />
                  {t("edit")}
                </button>
              </div>
            </div>
            <RichText
              text={q.question}
              block
              className="text-sm lg:text-base leading-relaxed text-gray-900 font-medium [&_img]:max-w-full [&_img]:rounded-lg [&_img]:mt-2"
            />
          </div>

          {/* Choices */}
          <div className="flex flex-col gap-2">
            {q.choices.map((c) => {
              const isAnswer = q.answers.includes(c.label);
              return (
                <div
                  key={c.label}
                  className={`flex items-start gap-3 px-4 py-3 lg:px-5 lg:py-4 rounded-xl border ${
                    isAnswer
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-white border-gray-100"
                  }`}
                >
                  <span className={`shrink-0 w-6 h-6 lg:w-7 lg:h-7 rounded-md text-xs lg:text-sm font-bold flex items-center justify-center mt-0.5 ${
                    isAnswer ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"
                  }`}>
                    {c.label}
                  </span>
                  <RichText text={c.text} className={`text-sm lg:text-base leading-snug pt-0.5 ${
                    isAnswer ? "text-emerald-900 font-medium" : "text-gray-500"
                  }`} />
                </div>
              );
            })}
          </div>

          {/* Explanation */}
          <div className="bg-white rounded-xl border border-gray-100 px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t("aiExplanation")}</p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleAiFactCheck}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition-colors"
                  title={t("factCheck")}
                >
                  <ShieldCheck size={11} />
                  {t("factCheck")}
                </button>
                <button
                  onClick={handleAiExplain}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-violet-50 border border-violet-200 text-violet-600 hover:bg-violet-100 transition-colors"
                  title={t("explain")}
                >
                  <Sparkles size={11} />
                  {t("explain")}
                </button>
              </div>
            </div>
            {q.explanation ? (
              <RichText text={q.explanation} block className="text-sm lg:text-base leading-relaxed text-gray-700" />
            ) : (
              <p className="text-sm text-gray-300">—</p>
            )}
            {q.source && <p className="text-xs text-gray-300 mt-3">{t("source")}: {q.source}</p>}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="shrink-0 border-t border-gray-200 bg-white px-4 sm:px-6 pt-3 pb-2.5">
        <div className="flex items-end gap-px mb-2.5">
          {filteredQuestions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`flex-1 rounded-full transition-all duration-150 ${
                i === currentIndex ? "h-3 bg-gray-800" : "h-2 bg-gray-200 hover:bg-gray-300"
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={goPrev}
            disabled={isFirst}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-20 transition-all"
          >
            <ChevronLeft size={15} />
          </button>
          <input
            type="range"
            min={0}
            max={filteredQuestions.length - 1}
            value={currentIndex}
            onChange={(e) => setCurrentIndex(Number(e.target.value))}
            className="quiz-slider flex-1"
            style={{ "--fill": sliderPct } as React.CSSProperties}
          />
          <button
            onClick={goNext}
            disabled={isLast}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-20 transition-all"
          >
            <ChevronRight size={15} />
          </button>
          <span className="text-xs text-gray-300 ml-1 shrink-0 hidden lg:block">Enter →  ← </span>
        </div>
      </footer>

      {/* Edit modal */}
      {editingQuestion && (
        <QuestionEditModal
          question={editingQuestion}
          onClose={() => setEditingQuestion(null)}
          onSave={handleQuestionSave}
        />
      )}

      {/* AI Explain popup */}
      {aiPopupOpen && (
        <AiExplainPopup
          loading={aiLoading}
          result={aiResult}
          error={aiError}
          adopting={aiAdopting}
          onAdopt={handleAiAdopt}
          onDismiss={dismissExplain}
          onSuggest={handleAiSuggest}
          suggesting={aiSuggesting}
        />
      )}

      {/* AI Refine popup */}
      {refinePopupOpen && (
        <AiRefinePopup
          originalQuestion={q.question}
          originalChoices={q.choices}
          loading={refineLoading}
          result={refineResult}
          error={refineError}
          adopting={refineAdopting}
          onAdopt={handleRefineAdopt}
          onDismiss={dismissRefine}
        />
      )}

      {/* AI Fact Check popup */}
      {factCheckPopupOpen && (
        <AiFactCheckPopup
          loading={factCheckLoading}
          result={factCheckResult}
          error={factCheckError}
          adopting={factCheckAdopting}
          currentAnswers={q.answers}
          onAdopt={handleFactCheckAdopt}
          onDismiss={dismissFactCheck}
          question={q.question}
          choices={q.choices}
        />
      )}
    </div>
  );
}
