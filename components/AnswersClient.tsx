"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Sparkles, Wand2, RotateCcw, Loader2 } from "lucide-react";
import type { Question, QuizStats } from "@/lib/types";
import QuestionEditModal from "./QuestionEditModal";
import AiExplainPopup from "./AiExplainPopup";
import AiRefinePopup from "./AiRefinePopup";
import QuizHeader from "./QuizHeader";
import { useSettings } from "@/lib/settings-context";
import { useAudio } from "@/hooks/useAudio";
import { buildAnswerText } from "@/lib/ttsText";
import type { AiExplainResponse } from "@/app/api/ai/explain/route";
import type { AiRefineResponse } from "@/app/api/ai/refine/route";

interface Props {
  questions: Question[];
  examName: string;
  examId: string;
  userEmail: string;
  activeCategory?: string | null;
}

const statsKey = (id: string) => `quiz-stats-${id}`;

function loadLocalStats(examId: string): QuizStats {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(statsKey(examId)) ?? "{}");
    const migrated: QuizStats = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === 0 || v === 1) migrated[k] = v as 0 | 1;
    }
    return migrated;
  } catch { return {}; }
}

export default function AnswersClient({ questions: initialQuestions, examName, examId, userEmail: _userEmail, activeCategory }: Props) {
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [stats, setStats] = useState<QuizStats>({});
  const [filter, setFilter] = useState<"all" | "wrong">("all");

  const { settings, t } = useSettings();
  const { speak, stop, prefetch, playing: audioPlaying, loading: audioLoading } = useAudio();

  // Load stats from localStorage and sync with DB
  useEffect(() => {
    const local = loadLocalStats(examId);
    setStats(local);
    fetch(`/api/scores?examId=${encodeURIComponent(examId)}`)
      .then((r) => r.json() as Promise<QuizStats>)
      .then((db) => setStats((prev) => ({ ...prev, ...db })))
      .catch(() => {});
  }, [examId]);

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

  const [aiPopupOpen, setAiPopupOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiExplainResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAdopting, setAiAdopting] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);

  const [refinePopupOpen, setRefinePopupOpen] = useState(false);
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineResult, setRefineResult] = useState<AiRefineResponse | null>(null);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [refineAdopting, setRefineAdopting] = useState(false);

  const handleQuestionSave = useCallback((updated: Question) => {
    setQuestions((prev) => prev.map((q) => (q.dbId === updated.dbId ? updated : q)));
  }, []);

  const handleAiExplain = useCallback(async () => {
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    setAiPopupOpen(true);
    setAiLoading(true);
    setAiResult(null);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q.question,
          choices: q.choices,
          answers: q.answers,
          explanation: q.explanation,
          userPrompt: settings.aiPrompt,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error ?? "Request failed");
      }
      const data = await res.json() as AiExplainResponse;
      setAiResult(data);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Failed to get AI explanation");
    } finally {
      setAiLoading(false);
    }
  }, [filteredQuestions, currentIndex, settings.aiPrompt]);

  const handleAiAdopt = useCallback(async () => {
    if (!aiResult) return;
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    setAiAdopting(true);
    try {
      const res = await fetch(`/api/admin/questions/${encodeURIComponent(q.dbId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text: q.question,
          options: q.choices,
          answers: aiResult.answers,
          explanation: aiResult.explanation,
          change_reason: "AI-generated via Gemini",
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      setQuestions((prev) =>
        prev.map((pq) =>
          pq.dbId === q.dbId
            ? { ...pq, answers: aiResult.answers, explanation: aiResult.explanation }
            : pq
        )
      );
      setAiPopupOpen(false);
      setAiResult(null);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Failed to adopt answer");
    } finally {
      setAiAdopting(false);
    }
  }, [aiResult, filteredQuestions, currentIndex]);

  const handleAiSuggest = useCallback(async () => {
    if (!aiResult) return;
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    setAiSuggesting(true);
    try {
      await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: q.dbId,
          type: "ai",
          suggestedAnswers: aiResult.answers,
          suggestedExplanation: aiResult.explanation,
          aiModel: aiResult.model ?? null,
          comment: null,
        }),
      });
      setAiPopupOpen(false);
      setAiResult(null);
    } finally {
      setAiSuggesting(false);
    }
  }, [aiResult, filteredQuestions, currentIndex]);

  const handleAiRefine = useCallback(async () => {
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    setRefinePopupOpen(true);
    setRefineLoading(true);
    setRefineResult(null);
    setRefineError(null);
    try {
      const res = await fetch("/api/ai/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q.question,
          choices: q.choices,
          userPrompt: settings.aiRefinePrompt,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error ?? "Request failed");
      }
      const data = await res.json() as AiRefineResponse;
      setRefineResult(data);
    } catch (e) {
      setRefineError(e instanceof Error ? e.message : "Failed to refine question");
    } finally {
      setRefineLoading(false);
    }
  }, [filteredQuestions, currentIndex, settings.aiRefinePrompt]);

  const handleRefineAdopt = useCallback(async () => {
    if (!refineResult) return;
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    setRefineAdopting(true);
    try {
      const res = await fetch(`/api/admin/questions/${encodeURIComponent(q.dbId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text: refineResult.question,
          options: refineResult.choices,
          answers: q.answers,
          explanation: q.explanation,
          change_reason: `AI refined: ${refineResult.changesSummary || "typo/grammar fix"}`,
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      setQuestions((prev) =>
        prev.map((pq) =>
          pq.dbId === q.dbId
            ? { ...pq, question: refineResult.question, choices: refineResult.choices }
            : pq
        )
      );
      setRefinePopupOpen(false);
      setRefineResult(null);
    } catch (e) {
      setRefineError(e instanceof Error ? e.message : "Failed to adopt refinement");
    } finally {
      setRefineAdopting(false);
    }
  }, [refineResult, filteredQuestions, currentIndex]);

  const goNext = useCallback(() => setCurrentIndex((i) => Math.min(i + 1, filteredQuestions.length - 1)), [filteredQuestions.length]);
  const goPrev = useCallback(() => setCurrentIndex((i) => Math.max(i - 1, 0)), []);

  const handleReplay = useCallback(() => {
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    speak(buildAnswerText(q, settings.language));
  }, [filteredQuestions, currentIndex, speak, settings.language]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingQuestion || aiPopupOpen || refinePopupOpen) return;
      if (e.key === "ArrowRight" || e.key === "Enter") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editingQuestion, aiPopupOpen, refinePopupOpen, goNext, goPrev]);

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
          filter={filter as "all" | "continue" | "wrong"}
          onFilterChange={(f) => setFilter(f === "continue" ? "all" : f)}
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
        filter={filter as "all" | "continue" | "wrong"}
        onFilterChange={(f) => setFilter(f === "continue" ? "all" : f)}
        wrongCount={wrongCount}
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
              <p className="text-[11px] text-gray-400">
                Q{currentIndex + 1}
                {q.isMultiple && <span className="ml-2 text-violet-500 font-semibold">Multi</span>}
                <span className="ml-2 text-gray-300">v{q.version}</span>
              </p>
              <button
                onClick={handleAiRefine}
                className="text-gray-300 hover:text-amber-500 transition-colors"
                title={t("refine")}
              >
                <Wand2 size={12} />
              </button>
            </div>
            <div
              className="text-sm lg:text-base leading-relaxed text-gray-900 font-medium whitespace-pre-wrap [&_img]:max-w-full [&_img]:rounded-lg [&_img]:mt-2"
              dangerouslySetInnerHTML={{ __html: q.question }}
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
                  <span className={`text-sm lg:text-base leading-snug pt-0.5 whitespace-pre-wrap ${
                    isAnswer ? "text-emerald-900 font-medium" : "text-gray-500"
                  }`}>
                    {c.text}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Explanation */}
          <div className="bg-white rounded-xl border border-gray-100 px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Explanation</p>
              <button
                onClick={handleAiExplain}
                className="text-gray-300 hover:text-violet-500 transition-colors"
                title={t("explain")}
              >
                <Sparkles size={12} />
              </button>
            </div>
            {q.explanation ? (
              <p className="text-sm lg:text-base leading-relaxed text-gray-700 whitespace-pre-wrap">{q.explanation}</p>
            ) : (
              <p className="text-sm text-gray-300">—</p>
            )}
            {q.source && <p className="text-xs text-gray-300 mt-3">Source: {q.source}</p>}
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
          onDismiss={() => {
            setAiPopupOpen(false);
            setAiResult(null);
            setAiError(null);
          }}
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
          onDismiss={() => {
            setRefinePopupOpen(false);
            setRefineResult(null);
            setRefineError(null);
          }}
        />
      )}
    </div>
  );
}
