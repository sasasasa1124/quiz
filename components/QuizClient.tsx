"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, BookOpen, Brain, Layers, AlertCircle,
  CheckCircle2, XCircle, ChevronLeft, ChevronRight, Zap, Pencil, Sparkles, Settings, Wand2, Plus, Globe, Home, History, Copy, Volume2, VolumeOff,
} from "lucide-react";
import type { Question, QuizStats } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import type { AiExplainResponse } from "@/app/api/ai/explain/route";
import type { AiRefineResponse } from "@/app/api/ai/refine/route";
import QuizQuestion from "./QuizQuestion";
import ReviewReveal from "./ReviewReveal";
import QuestionEditModal from "./QuestionEditModal";
import AiExplainPopup from "./AiExplainPopup";
import AiRefinePopup from "./AiRefinePopup";
import AnswerRevealModal from "./AnswerRevealModal";
import KeyboardHintToast from "./KeyboardHintToast";
import { useSettings } from "@/lib/settings-context";
import { useAudio } from "@/hooks/useAudio";
import { buildQuestionText, buildAnswerRevealText } from "@/lib/ttsText";
import { recordDailySnapshot } from "@/lib/snapshots";

const LANG_OPTIONS: { value: Locale; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "ja", label: "日本語" },
  { value: "zh", label: "中文" },
  { value: "ko", label: "한국어" },
];

interface Props {
  questions: Question[];
  examId: string;
  examName: string;
  mode: "quiz" | "review";
  userEmail: string;
  activeCategory: string | null;
  initialFilter?: "all" | "continue" | "wrong";
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

function saveLocalStats(examId: string, stats: QuizStats) {
  localStorage.setItem(statsKey(examId), JSON.stringify(stats));
}

const lastQKey = (id: string) => `quiz-last-index-${id}`;

function loadLastQuestionId(examId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(lastQKey(examId));
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch { return null; }
}

function saveLastQuestionId(examId: string, questionId: number) {
  localStorage.setItem(lastQKey(examId), String(questionId));
}

export default function QuizClient({ questions: initialQuestions, examId, examName, mode, userEmail, activeCategory, initialFilter }: Props) {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState<QuizStats>({});
  const [filter, setFilter] = useState<"all" | "continue" | "wrong">(initialFilter ?? "all");
  const [savedLastQuestionId, setSavedLastQuestionId] = useState<number | null>(null);
  const [excludeDuplicates, setExcludeDuplicates] = useState(true);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [streak, setStreak] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [createMode, setCreateMode] = useState(false);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");

  const [aiPopupOpen, setAiPopupOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiExplainResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAdopting, setAiAdopting] = useState(false);

  // Reset AI popup when moving to a different question
  useEffect(() => {
    setAiPopupOpen(false);
    setAiResult(null);
    setAiLoading(false);
    setAiError(null);
  }, [currentIndex]);

  const [refinePopupOpen, setRefinePopupOpen] = useState(false);
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineResult, setRefineResult] = useState<AiRefineResponse | null>(null);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [refineAdopting, setRefineAdopting] = useState(false);

  const [sessionId] = useState<string>(() => crypto.randomUUID());
  const [sessionCorrectCount, setSessionCorrectCount] = useState(0);
  const [filterResetToast, setFilterResetToast] = useState(false);
  const sessionCompletedRef = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchZone = useRef<"top" | "bottom" | null>(null);

  const { settings, updateSettings, t } = useSettings();
  const { speak, stop, prefetch } = useAudio();

  // Auto-play question + choices when question changes or audio is toggled on
  // Skip if answer is already revealed/submitted to avoid overlap with reveal effect
  useEffect(() => {
    if (revealed || submitted) return;
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    speak(buildQuestionText(q));
    // Pre-warm first chunk of next question
    const next = filteredQuestions[currentIndex + 1];
    if (next) prefetch(buildQuestionText(next)[0]);
    return () => { stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, mode, speak, stop, prefetch, revealed, submitted]);

  // Auto-play answer reveal when card is flipped (review) or submitted (quiz)
  useEffect(() => {
    if (!revealed && !submitted) return;
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    stop();
    speak(buildAnswerRevealText(q, settings.language));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, submitted, speak, stop, settings.language, currentIndex]);

  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  const backHref = `/exam/${examId}`;

  // Close language dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // Create session on mount
  useEffect(() => {
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        examId,
        mode,
        filter: "all",
        questionCount: initialQuestions.length,
      }),
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load local stats then merge with DB stats (DB wins)
  useEffect(() => {
    const local = loadLocalStats(examId);
    setStats(local);
    setSavedLastQuestionId(loadLastQuestionId(examId));

    fetch(`/api/scores?examId=${encodeURIComponent(examId)}`)
      .then((r) => r.json() as Promise<QuizStats>)
      .then((db) => {
        setStats((prev) => {
          const merged = { ...prev, ...db };
          saveLocalStats(examId, merged);
          return merged;
        });
      })
      .catch(() => {}); // silently fail – local stats still work
  }, [examId]);

  useEffect(() => {
    setSelected(new Set());
    setSubmitted(false);
    setIsCorrect(null);
    setRevealed(false);
  }, [currentIndex, filter, mode]);

  useEffect(() => {
    if (filter === "continue") {
      const savedId = loadLastQuestionId(examId);
      if (savedId !== null) {
        const idx = questions.findIndex((q) => q.id === savedId);
        setCurrentIndex(idx >= 0 ? idx : 0);
      } else {
        setCurrentIndex(0);
      }
    } else {
      setCurrentIndex(0);
    }
    setDirection("forward");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, excludeDuplicates]);

  const duplicateCount = questions.filter((q) => q.isDuplicate).length;

  const filteredQuestions = questions.filter((q) => {
    if (filter === "wrong") return stats[String(q.id)] === 0;
    if (excludeDuplicates && q.isDuplicate) return false;
    return true;
  });

  // Save current question position whenever index changes
  useEffect(() => {
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    saveLastQuestionId(examId, q.id);
    setSavedLastQuestionId(q.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, examId]);

  const totalAnswered = questions.filter((q) => stats[String(q.id)] !== undefined).length;
  const totalCorrect = questions.filter((q) => stats[String(q.id)] === 1).length;
  const overallRate = totalAnswered > 0 ? Math.round((totalCorrect / questions.length) * 100) : null;
  const wrongCount = questions.filter((q) => stats[String(q.id)] === 0).length;

  const continueIndex = savedLastQuestionId !== null
    ? questions.findIndex((q) => q.id === savedLastQuestionId)
    : -1;
  const continueDisplayNum = continueIndex >= 0 ? continueIndex + 1 : null;
  const hasContinue = continueDisplayNum !== null;

  // Auto-reset "wrong" filter when all wrong answers are cleared
  useEffect(() => {
    if (filter === "wrong" && wrongCount === 0) {
      setFilter("all");
      setCurrentIndex(0);
      setFilterResetToast(true);
      const timer = setTimeout(() => setFilterResetToast(false), 3000);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrongCount]);

  const recordAnswer = useCallback((questionId: number, correct: boolean, questionDbId: string, srsQuality?: 1 | 4) => {
    setStats((prev) => {
      const next = { ...prev, [String(questionId)]: correct ? 1 : 0 } as QuizStats;
      saveLocalStats(examId, next);
      recordDailySnapshot(examId, next, questions.length);
      return next;
    });
    if (correct) setSessionCorrectCount((c) => c + 1);
    // Fire-and-forget sync to DB
    fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examId, questionId, correct, sessionId, questionDbId, srsQuality }),
    }).catch(() => {});
  }, [examId, sessionId]);

  const handleToggle = useCallback((label: string) => {
    if (submitted) return;
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    setSelected((prev) => {
      if (q.isMultiple) {
        const next = new Set(prev);
        next.has(label) ? next.delete(label) : next.add(label);
        return next;
      }
      return new Set([label]);
    });
  }, [submitted, filteredQuestions, currentIndex]);

  const handleSubmit = useCallback(() => {
    const q = filteredQuestions[currentIndex];
    if (!q || selected.size === 0) return;
    if (q.isMultiple && selected.size !== q.answers.length) {
      alert(`Please select ${q.answers.length}`);
      return;
    }
    const correct = q.answers.length === selected.size && q.answers.every((a) => selected.has(a));
    setIsCorrect(correct);
    setSubmitted(true);
    recordAnswer(q.id, correct, q.dbId);
    if (mode !== "review") {
      setStreak((prev) => correct ? prev + 1 : 0);
    }
  }, [filteredQuestions, currentIndex, selected, recordAnswer, mode]);

  const goNext = useCallback(() => {
    setDirection("forward");
    setCurrentIndex((i) => Math.min(i + 1, filteredQuestions.length - 1));
  }, [filteredQuestions.length]);

  const goPrev = useCallback(() => {
    setDirection("backward");
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const doCompleteSession = useCallback(() => {
    if (sessionCompletedRef.current) return;
    sessionCompletedRef.current = true;
    navigator.sendBeacon(
      `/api/sessions/${sessionId}`,
      new Blob(
        [JSON.stringify({ correctCount: sessionCorrectCount })],
        { type: "application/json" }
      )
    );
  }, [sessionId, sessionCorrectCount]);

  // Complete session on tab close / refresh
  useEffect(() => {
    window.addEventListener("beforeunload", doCompleteSession);
    return () => window.removeEventListener("beforeunload", doCompleteSession);
  }, [doCompleteSession]);

  const handleKnow = useCallback(() => {
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    recordAnswer(q.id, true, q.dbId, 4);
    setStreak((prev) => prev + 1);
    if (currentIndex === filteredQuestions.length - 1) {
      doCompleteSession();
      router.push(backHref);
    } else {
      goNext();
    }
  }, [filteredQuestions, currentIndex, recordAnswer, goNext, router, backHref, doCompleteSession]);

  const handleDontKnow = useCallback(() => {
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    recordAnswer(q.id, false, q.dbId, 1);
    setStreak(0);
    setRevealed(true);
  }, [filteredQuestions, currentIndex, recordAnswer]);

  const handleRevealNext = useCallback(() => {
    if (currentIndex === filteredQuestions.length - 1) {
      doCompleteSession();
      router.push(backHref);
    } else {
      goNext();
    }
  }, [currentIndex, filteredQuestions.length, goNext, router, backHref, doCompleteSession]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchZone.current = e.touches[0].clientY < window.innerHeight / 2 ? "top" : "bottom";
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - (touchStartY.current ?? 0);
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 50) { touchZone.current = null; return; }
    if (mode === "review" && !revealed && touchZone.current === "bottom") {
      if (dx < 0) handleKnow();
      else handleDontKnow();
    } else {
      if (dx < 0) goNext();
      else goPrev();
    }
    touchZone.current = null;
  }, [mode, revealed, goNext, goPrev, handleKnow, handleDontKnow]);

  const handleQuestionSave = useCallback((updated: Question) => {
    setQuestions((prev) => {
      const exists = prev.some((q) => q.dbId === updated.dbId);
      return exists
        ? prev.map((q) => (q.dbId === updated.dbId ? updated : q))
        : [...prev, updated];
    });
  }, []);

  const handleQuestionDelete = useCallback((dbId: string) => {
    setQuestions((prev) => prev.filter((q) => q.dbId !== dbId));
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

  const handleRefineAdopt = useCallback(async (edited: { question: string; choices: typeof initialQuestions[0]["choices"] }) => {
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    setRefineAdopting(true);
    try {
      const res = await fetch(`/api/admin/questions/${encodeURIComponent(q.dbId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text: edited.question,
          options: edited.choices,
          answers: q.answers,
          explanation: q.explanation,
          change_reason: `AI refined: ${refineResult?.changesSummary || "typo/grammar fix"}`,
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      setQuestions((prev) =>
        prev.map((pq) =>
          pq.dbId === q.dbId
            ? { ...pq, question: edited.question, choices: edited.choices }
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
  }, [filteredQuestions, currentIndex]);

  const handleToggleDuplicate = useCallback(async () => {
    const q = filteredQuestions[currentIndex];
    if (!q?.dbId) return;
    const newVal = !q.isDuplicate;
    await fetch(`/api/admin/questions/${q.dbId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_duplicate: newVal }),
    });
    setQuestions((prev) =>
      prev.map((pq) => pq.dbId === q.dbId ? { ...pq, isDuplicate: newVal } : pq)
    );
  }, [filteredQuestions, currentIndex]);

  // Keyboard
  useEffect(() => {
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    const labels = q.choices.map((c) => c.label);

    const handler = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (editingQuestion || aiPopupOpen || refinePopupOpen) return;
      if (mode === "quiz" && submitted) return; // modal handles keys

      if (mode === "review") {
        if (!revealed) {
          if (e.key === "ArrowRight" || e.key === "Enter") handleKnow();
          else if (e.key === "Backspace") handleDontKnow();
          else if (e.key === "ArrowLeft") goPrev();
        } else {
          if (e.key === "ArrowRight" || e.key === "Enter") handleRevealNext();
          else if (e.key === "ArrowLeft" || e.key === "Backspace") goPrev();
        }
        return;
      }
      const letter = e.key.toUpperCase();
      if (labels.includes(letter)) { handleToggle(letter); return; }
      if (e.key === "Enter")      { submitted ? goNext() : handleSubmit(); }
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft")  goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredQuestions, currentIndex, submitted, revealed, mode, editingQuestion, aiPopupOpen, refinePopupOpen, handleToggle, handleSubmit, goNext, goPrev, handleKnow, handleDontKnow, handleRevealNext]);

  const ModeIcon = mode === "quiz" ? Brain : BookOpen;
  const isLast = currentIndex === filteredQuestions.length - 1;
  const sliderPct = filteredQuestions.length > 1
    ? `${(currentIndex / (filteredQuestions.length - 1)) * 100}%`
    : "0%";

  const showAnswerModal = mode === "quiz" && submitted;

  if (filteredQuestions.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 px-4">
        <AlertCircle size={32} className="text-gray-300" />
        <p className="font-semibold text-gray-700">
          {filter === "wrong" ? t("noWrongAnswers") : t("noQuestions")}
        </p>
        {(filter === "wrong" || excludeDuplicates) && (
          <button onClick={() => { setFilter("all"); setExcludeDuplicates(false); }} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors">
            {t("showAll")}
          </button>
        )}
        <button onClick={() => { doCompleteSession(); router.push(backHref); }} className="text-sm text-gray-400 hover:text-gray-700 flex items-center gap-1.5">
          <ArrowLeft size={14} />
        </button>
      </div>
    );
  }

  const q = filteredQuestions[currentIndex];

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-[#f8f9fb]">
      {/* Filter reset toast */}
      {filterResetToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-xs font-medium px-4 py-2 rounded-xl shadow-lg pointer-events-none">
          {t("allWrongCleared")}
        </div>
      )}
      {/* ── Header ── */}
      <header className="shrink-0 flex items-center justify-between px-4 sm:px-6 h-14 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <button
            onClick={() => { doCompleteSession(); router.push(backHref); }}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors shrink-0"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            onClick={() => { doCompleteSession(); router.push("/"); }}
            className="p-1 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
            title="Home"
          >
            <Home size={13} />
          </button>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 min-w-0">
            <ModeIcon size={13} strokeWidth={1.75} className="shrink-0" />
            <span className="truncate">{examName}</span>
            {activeCategory && (
              <>
                <span className="text-gray-200 shrink-0">·</span>
                <span className="truncate text-blue-500 font-medium">{activeCategory}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {streak >= 2 && (
            <div key={streak} className="quiz-streak-badge flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
              <Zap size={11} fill="currentColor" />
              {streak}
            </div>
          )}
          {overallRate !== null && (
            <span className={`text-xs font-semibold tabular-nums hidden sm:inline ${overallRate >= 80 ? "text-emerald-600" : overallRate >= 60 ? "text-amber-500" : "text-rose-500"}`}>
              {totalCorrect}/{questions.length}
              <span className="font-normal text-gray-400 ml-1">({overallRate}%)</span>
            </span>
          )}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button onClick={() => setFilter("all")} className={`flex items-center gap-1 text-xs font-medium px-2 sm:px-2.5 py-1 rounded-md transition-colors ${filter === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Layers size={11} /> <span className="hidden sm:inline">{t("all")}</span> {questions.length}
            </button>
            {hasContinue && (
              <button onClick={() => setFilter("continue")} className={`flex items-center gap-1 text-xs font-medium px-2 sm:px-2.5 py-1 rounded-md transition-colors ${filter === "continue" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                <History size={11} /> <span className="hidden sm:inline">{t("continueFrom")}</span><span className="hidden sm:inline text-gray-400 ml-0.5">Q{continueDisplayNum}</span>
              </button>
            )}
            <button onClick={() => setFilter("wrong")} disabled={wrongCount === 0} className={`flex items-center gap-1 text-xs font-medium px-2 sm:px-2.5 py-1 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${filter === "wrong" ? "bg-white text-rose-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <AlertCircle size={11} /> <span className="hidden sm:inline">{t("wrong")}</span> {wrongCount}
            </button>
            {duplicateCount > 0 && (
              <button
                onClick={() => setExcludeDuplicates((v) => !v)}
                className={`flex items-center gap-1 text-xs font-medium px-2 sm:px-2.5 py-1 rounded-md transition-colors ${excludeDuplicates ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                title={excludeDuplicates ? "Include duplicates" : "Exclude duplicates"}
              >
                <Copy size={11} /> <span className="hidden sm:inline">{t("uniq")}</span>
              </button>
            )}
          </div>
          <div ref={langRef} className="relative">
            <button
              onClick={() => setLangOpen((o) => !o)}
              className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Language"
            >
              <Globe size={13} />
            </button>
            {langOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-[90px]">
                {LANG_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { updateSettings({ language: opt.value }); setLangOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${settings.language === opt.value ? "font-semibold text-blue-600" : "text-gray-700"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => updateSettings({ audioMode: !settings.audioMode })}
            className="p-1.5 rounded-lg transition-colors text-gray-300 hover:text-gray-600 hover:bg-gray-100"
            title={settings.audioMode ? "Audio on (click to turn off)" : "Audio off (click to turn on)"}
          >
            {settings.audioMode ? <Volume2 size={13} className="text-sky-500" /> : <VolumeOff size={13} />}
          </button>
          <Link
            href={`/settings?returnTo=${encodeURIComponent(`/quiz/${examId}?mode=${mode}`)}`}
            className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Settings"
          >
            <Settings size={13} />
          </Link>
        </div>
      </header>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

        {/* Left panel */}
        <div className={`
          min-h-0 flex-1 flex flex-col overflow-hidden
          border-b lg:border-b-0 lg:border-r border-gray-200
          transition-colors duration-300
          ${mode === "review"
            ? revealed ? "bg-rose-50" : "bg-white"
            : isCorrect === true  ? "bg-emerald-50"
            : isCorrect === false ? "bg-rose-50"
            : "bg-white"}
        `}>
          {/* Position indicator */}
          <div className="shrink-0 px-4 sm:px-8 pt-4 sm:pt-5 pb-3 flex items-center justify-between">
            <span className="text-xs tabular-nums text-gray-400">
              Q{currentIndex + 1}/{filteredQuestions.length}
              <span className="ml-2 text-gray-300">v{q.version}</span>
            </span>
            <button
              onClick={() => setCreateMode(true)}
              className="p-1 text-gray-300 hover:text-emerald-500 transition-colors"
              title="New question"
            >
              <Plus size={13} />
            </button>
          </div>

          {mode === "review"
            ? (
                <div className="flex-1 relative overflow-hidden flip-card-perspective">
                  <div key={currentIndex} className={`flip-card-inner ${revealed ? "is-flipped" : ""}`}>
                    {/* Front: question */}
                    <div className="card-front">
                      <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-4">
                        <div className="max-w-3xl mx-auto w-full">
                          <div className="flex justify-end gap-2 mb-2">
                            <button onClick={handleToggleDuplicate} className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${q.isDuplicate ? "bg-orange-50 border-orange-200 text-orange-500 hover:bg-orange-100" : "bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100"}`} title={q.isDuplicate ? "Unmark duplicate" : "Mark as duplicate"}>
                              <Copy size={12} />
                              Dup
                            </button>
                            <button onClick={handleAiRefine} className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 transition-colors" title={t("refine")}>
                              <Wand2 size={12} />
                              {t("refine")}
                            </button>
                            <button onClick={() => setEditingQuestion(q)} className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 transition-colors" title="Edit question">
                              <Pencil size={12} />
                              Edit
                            </button>
                          </div>
                          <div className="bg-gray-50 rounded-xl px-5 py-4 lg:px-6 lg:py-5 mb-4 max-h-[40vh] overflow-y-auto">
                            <div
                              className="text-gray-900 text-sm lg:text-base leading-relaxed font-medium whitespace-pre-wrap [&_img]:max-w-full [&_img]:rounded-lg [&_img]:mt-2"
                              dangerouslySetInnerHTML={{ __html: q.question }}
                            />
                            {q.source && (
                              <a href={q.source} target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-300 hover:text-blue-400 mt-2 truncate block" title={q.source}>
                                Source: {q.source}
                              </a>
                            )}
                          </div>
                          <div className="space-y-2">
                            {q.choices.map((c, i) => (
                              <div key={c.label} className="border rounded-xl px-4 py-3 lg:px-5 lg:py-4 border-gray-100 bg-gray-50">
                                <div className="flex items-start gap-3">
                                  <span className="shrink-0 w-6 h-6 lg:w-7 lg:h-7 rounded-lg border border-gray-200 bg-white text-xs lg:text-sm font-bold flex items-center justify-center text-gray-400">{c.label}</span>
                                  <span className="text-sm lg:text-base leading-relaxed pt-0.5 whitespace-pre-wrap text-gray-600">{c.text}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 px-4 sm:px-8 py-4 border-t border-gray-100">
                        <div className="max-w-3xl mx-auto w-full flex gap-2">
                          <button onClick={handleDontKnow} className="flex-1 h-10 rounded-xl border-2 border-rose-200 text-rose-500 bg-rose-50 hover:bg-rose-100 font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
                            <ChevronLeft size={15} />
                            <span>Didn&apos;t know</span>
                            <span className="text-xs opacity-40 hidden sm:inline">⌫</span>
                          </button>
                          <button onClick={handleKnow} className="flex-1 h-10 rounded-xl border-2 border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
                            <span>Knew it</span>
                            <span className="text-xs opacity-40 hidden sm:inline">→</span>
                            <ChevronRight size={15} />
                          </button>
                        </div>
                        <p className="text-[10px] text-center text-gray-300 mt-1 lg:hidden">bottom swipe ↔ know / didn&apos;t &middot; top swipe = navigate</p>
                      </div>
                    </div>
                    {/* Back: answer reveal */}
                    <div className="card-back">
                      <ReviewReveal question={q} onNext={handleRevealNext} isLast={isLast} onAiExplain={handleAiExplain} />
                    </div>
                  </div>
                </div>
              )
            : <>
                <div
                  key={currentIndex}
                  className={`flex-1 overflow-y-auto px-4 sm:px-8 pb-4 ${direction === "forward" ? "question-slide-forward" : "question-slide-backward"}`}
                >
                  <div className="max-w-3xl mx-auto w-full h-full">
                    <div className="flex justify-end gap-2 mb-2">
                      <button onClick={handleToggleDuplicate} className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${q.isDuplicate ? "bg-orange-50 border-orange-200 text-orange-500 hover:bg-orange-100" : "bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100"}`} title={q.isDuplicate ? "Unmark duplicate" : "Mark as duplicate"}>
                        <Copy size={12} />
                        Dup
                      </button>
                      <button onClick={handleAiRefine} className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 transition-colors" title={t("refine")}>
                        <Wand2 size={12} />
                        {t("refine")}
                      </button>
                      <button onClick={() => setEditingQuestion(q)} className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 transition-colors" title="Edit question">
                        <Pencil size={12} />
                        Edit
                      </button>
                    </div>
                    <QuizQuestion
                      question={q}
                      selected={selected}
                      onToggle={handleToggle}
                      submitted={submitted}
                      stat={stats[String(q.id)]}
                    />
                  </div>
                </div>
                <div className="shrink-0 px-4 sm:px-8 py-4 border-t border-gray-100">
                  <div className="max-w-3xl mx-auto w-full">
                    {!submitted && (
                      <button
                        onClick={handleSubmit}
                        disabled={selected.size === 0}
                        className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-20 hover:bg-gray-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 size={15} strokeWidth={2} />
                        Submit
                        <kbd className="text-[10px] bg-white/15 px-1.5 py-0.5 rounded-md font-mono hidden sm:inline">↵</kbd>
                      </button>
                    )}
                    {submitted && (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div className={`flex items-center gap-2 ${isCorrect ? "text-emerald-600" : "text-rose-600"}`}>
                            {isCorrect
                              ? <><CheckCircle2 size={17} strokeWidth={2.5} />{streak > 1 && <span className="text-xs text-emerald-400 ml-1">{streak}</span>}</>
                              : <><XCircle size={17} strokeWidth={2.5} /><span className="text-xs text-gray-400 ml-1">{q.answers.join(", ")}</span></>
                            }
                          </div>
                          <button
                            onClick={handleAiExplain}
                            className="text-gray-300 hover:text-violet-500 transition-colors"
                            title={t("explain")}
                          >
                            <Sparkles size={15} />
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={goPrev} disabled={currentIndex === 0} className="flex items-center justify-center w-10 h-10 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-20 transition-all">
                            <ChevronLeft size={17} />
                          </button>
                          <button onClick={goNext} disabled={isLast} className="flex-1 h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-20 hover:bg-gray-700 transition-colors flex items-center justify-center gap-1.5">
                            {isLast ? <CheckCircle2 size={16} /> : <><ChevronRight size={15} /><span className="text-xs opacity-40 hidden sm:inline">Enter</span></>}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
          }
        </div>

      </div>

      {/* ── Footer ── */}
      <footer className="shrink-0 border-t border-gray-200 bg-white px-4 sm:px-6 pt-3 pb-2.5">
        {/* Number labels above — px-2 matches slider thumb inset (8px = thumbRadius) */}
        <div className="flex justify-between text-xs text-gray-300 tabular-nums px-2 mb-1">
          <span>1</span>
          <span>{filteredQuestions.length}</span>
        </div>
        {/* Progress blocks — px-2 aligns with slider track */}
        <div className="flex items-end gap-px mb-2 px-2">
          {filteredQuestions.map((fq, i) => {
            const s = stats[String(fq.id)];
            const isCurrent = i === currentIndex;
            const statusLabel = s === 1 ? "correct" : s === 0 ? "wrong" : "—";
            return (
              <button
                key={fq.id}
                onClick={() => { setDirection(i > currentIndex ? "forward" : "backward"); setCurrentIndex(i); }}
                title={`Q${i + 1} · ${statusLabel}`}
                className={`flex-1 rounded-full transition-all duration-150 cursor-pointer ${
                  isCurrent
                    ? "h-3 bg-gray-800"
                    : s === 1 ? "h-2 bg-emerald-400 hover:bg-emerald-500"
                    : s === 0 ? "h-2 bg-rose-400 hover:bg-rose-500"
                    : "h-2 bg-gray-200 hover:bg-gray-300"
                }`}
              />
            );
          })}
        </div>
        {/* Slider — full width; browser insets track by thumbRadius (8px) matching px-2 above */}
        <input
          type="range"
          min={0}
          max={filteredQuestions.length - 1}
          value={currentIndex}
          onChange={(e) => { const next = Number(e.target.value); setDirection(next > currentIndex ? "forward" : "backward"); setCurrentIndex(next); }}
          className="quiz-slider w-full"
          style={{ "--fill": sliderPct } as React.CSSProperties}
        />
        <div className="text-right mt-1">
          <span className="text-xs text-gray-300">
            {mode === "review"
              ? (revealed ? "← → navigate" : "→ knew  ⌫ didn't  ← prev")
              : "1–9 select  Enter submit/next  ←→ nav"}
          </span>
        </div>
      </footer>

      {/* Edit modal */}
      {editingQuestion && (
        <QuestionEditModal
          question={editingQuestion}
          onClose={() => setEditingQuestion(null)}
          onSave={handleQuestionSave}
          onDelete={handleQuestionDelete}
        />
      )}

      {/* Create modal */}
      {createMode && (
        <QuestionEditModal
          examId={examId}
          onClose={() => setCreateMode(false)}
          onSave={(created) => {
            handleQuestionSave(created);
            setCreateMode(false);
          }}
          onBulkImport={() => {
            setCreateMode(false);
            router.refresh();
          }}
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
          question={filteredQuestions[currentIndex]?.question}
          choices={filteredQuestions[currentIndex]?.choices}
          answers={filteredQuestions[currentIndex]?.answers}
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

      {/* Answer reveal modal */}
      {showAnswerModal && (
        <AnswerRevealModal
          question={q}
          isCorrect={isCorrect === true}
          isLast={isLast}
          onNext={handleRevealNext}
          onAiExplain={handleAiExplain}
        />
      )}

      {/* Keyboard hint toast (first quiz session only) */}
      {mode === "quiz" && <KeyboardHintToast />}
    </div>
  );
}
