"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpenCheck, ChevronLeft, ChevronRight, Pencil, Sparkles, Wand2, Volume2, VolumeOff } from "lucide-react";
import type { Question } from "@/lib/types";
import QuestionEditModal from "./QuestionEditModal";
import AiExplainPopup from "./AiExplainPopup";
import AiRefinePopup from "./AiRefinePopup";
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

export default function AnswersClient({ questions: initialQuestions, examName, examId, userEmail: _userEmail }: Props) {
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  const { settings, updateSettings, t } = useSettings();
  const { speak, stop, prefetch } = useAudio();

  // Auto-play when question changes or audio is toggled on
  useEffect(() => {
    const q = questions[currentIndex];
    if (!q) return;
    speak(buildAnswerText(q, settings.language));
    // Pre-warm first chunk of next question
    const next = questions[currentIndex + 1];
    if (next) prefetch(buildAnswerText(next, settings.language)[0]);
    return () => { stop(); };
  }, [currentIndex, speak, stop, prefetch, settings.language, questions]);

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
    const q = questions[currentIndex];
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
  }, [questions, currentIndex, settings.aiPrompt]);

  const handleAiAdopt = useCallback(async () => {
    if (!aiResult) return;
    const q = questions[currentIndex];
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
  }, [aiResult, questions, currentIndex]);

  const handleAiSuggest = useCallback(async () => {
    if (!aiResult) return;
    const q = questions[currentIndex];
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
  }, [aiResult, questions, currentIndex]);

  const handleAiRefine = useCallback(async () => {
    const q = questions[currentIndex];
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
  }, [questions, currentIndex, settings.aiRefinePrompt]);

  const handleRefineAdopt = useCallback(async () => {
    if (!refineResult) return;
    const q = questions[currentIndex];
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
  }, [refineResult, questions, currentIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingQuestion || aiPopupOpen || refinePopupOpen) return;
      if (e.key === "ArrowRight" || e.key === "Enter") setCurrentIndex((i) => Math.min(i + 1, questions.length - 1));
      else if (e.key === "ArrowLeft") setCurrentIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [questions.length, editingQuestion, aiPopupOpen, refinePopupOpen]);

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
    // Ignore if mostly vertical (scrolling)
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) setCurrentIndex((i) => Math.min(i + 1, questions.length - 1));
    else setCurrentIndex((i) => Math.max(i - 1, 0));
    touchStartX.current = null;
    touchStartY.current = null;
  }, [questions.length]);

  const q = questions[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === questions.length - 1;
  const sliderPct = questions.length > 1
    ? `${(currentIndex / (questions.length - 1)) * 100}%`
    : "0%";

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8f9fb]">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-4 sm:px-6 h-14 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Link href={`/exam/${encodeURIComponent(examId)}`} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors shrink-0">
            <ArrowLeft size={14} />
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 min-w-0">
            <BookOpenCheck size={13} strokeWidth={1.75} className="shrink-0" />
            <span className="truncate">{examName}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => { settings.audioMode ? updateSettings({ audioMode: false }) : updateSettings({ audioMode: true }); }}
            className="p-1.5 rounded-lg transition-colors text-gray-300 hover:text-gray-600 hover:bg-gray-100"
            title={settings.audioMode ? "Audio mode on (click to turn off)" : "Audio mode off (click to turn on)"}
          >
            {settings.audioMode ? <Volume2 size={13} className="text-sky-500" /> : <VolumeOff size={13} />}
          </button>
          <button
            onClick={() => setEditingQuestion(q)}
            className="flex items-center gap-1 text-xs text-gray-300 hover:text-blue-500 transition-colors"
            title="Edit question"
          >
            <Pencil size={12} />
          </button>
          <span className="text-xs tabular-nums text-gray-400">
            {currentIndex + 1} / {questions.length}
          </span>
        </div>
      </header>

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
          {questions.map((_, i) => (
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
            onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
            disabled={isFirst}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-20 transition-all"
          >
            <ChevronLeft size={15} />
          </button>
          <input
            type="range"
            min={0}
            max={questions.length - 1}
            value={currentIndex}
            onChange={(e) => setCurrentIndex(Number(e.target.value))}
            className="quiz-slider flex-1"
            style={{ "--fill": sliderPct } as React.CSSProperties}
          />
          <button
            onClick={() => setCurrentIndex((i) => Math.min(i + 1, questions.length - 1))}
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
