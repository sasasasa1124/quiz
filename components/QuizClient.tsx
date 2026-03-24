"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, AlertCircle,
  CheckCircle2, XCircle, ChevronLeft, ChevronRight, Pencil, Sparkles, Wand2, Plus, Copy, Loader2,
} from "lucide-react";
import type { Question, QuizStats, FilterConfig, RichQuizStats } from "@/lib/types";
import { DEFAULT_FILTER_CONFIG } from "@/lib/types";
import type { AiExplainResponse } from "@/app/api/ai/explain/route";
import type { AiRefineResponse } from "@/app/api/ai/refine/route";
import QuizQuestion from "./QuizQuestion";
import ReviewReveal from "./ReviewReveal";
import QuestionEditModal from "./QuestionEditModal";
import AiExplainPopup from "./AiExplainPopup";
import AiRefinePopup from "./AiRefinePopup";
import AnswerRevealModal from "./AnswerRevealModal";
import KeyboardHintToast from "./KeyboardHintToast";
import QuizHeader from "./QuizHeader";
import { useSettings } from "@/lib/settings-context";
import { useSetHeader } from "@/lib/header-context";
import { useAudio } from "@/hooks/useAudio";
import { buildQuestionText, buildAnswerRevealText } from "@/lib/ttsText";
import { recordDailySnapshot } from "@/lib/snapshots";


interface Props {
  questions: Question[];
  examId: string;
  examName: string;
  mode: "quiz" | "review";
  userEmail: string;
  activeCategory: string | null;
  initialFilter?: "all" | "continue" | "wrong" | "custom";
  invalidatedIds?: string[];
  initialQuestionId?: number;
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

export default function QuizClient({ questions: initialQuestions, examId, examName, mode, userEmail, activeCategory, initialFilter, invalidatedIds: initialInvalidatedIds = [], initialQuestionId }: Props) {
  const router = useRouter();
  useSetHeader({ hidden: true }, []);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState<QuizStats>({});
  const [filter, setFilter] = useState<"all" | "continue" | "wrong" | "custom">(initialFilter ?? "all");
  const [filterConfig, setFilterConfig] = useState<FilterConfig>(DEFAULT_FILTER_CONFIG);
  const [richStats, setRichStats] = useState<RichQuizStats>({});
  const [savedLastQuestionId, setSavedLastQuestionId] = useState<number | null>(null);
  const [excludeDuplicates, setExcludeDuplicates] = useState(true);
  const [userInvalidated, setUserInvalidated] = useState<Set<string>>(() => new Set(initialInvalidatedIds));

  const [wrongSnapshot, setWrongSnapshot] = useState<Set<number> | null>(null);

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
  const [aiSuggesting, setAiSuggesting] = useState(false);

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

  const [shakeKey, setShakeKey] = useState(0);
  const [sessionId] = useState<string>(() => crypto.randomUUID());
  const [sessionCorrectCount, setSessionCorrectCount] = useState(0);
  const [filterResetToast, setFilterResetToast] = useState(false);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const sessionCompletedRef = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchZone = useRef<"top" | "bottom" | null>(null);

  const { settings, updateSettings, t } = useSettings();
  const { speak, stop, prefetch, playing: audioPlaying } = useAudio();

  const backHref = `/exam/${examId}`;

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
    setStatsLoaded(true);
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

  // Fetch rich stats when custom filter is first activated
  useEffect(() => {
    if (filter !== "custom" || Object.keys(richStats).length > 0) return;
    fetch(`/api/scores?examId=${encodeURIComponent(examId)}&rich=1`)
      .then((r) => r.json() as Promise<RichQuizStats>)
      .then(setRichStats)
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    if (filter === "wrong") {
      setDirection("forward");
      return; // Snapshot effect handles index for wrong mode
    }
    if (filter === "continue") {
      const savedId = loadLastQuestionId(examId);
      if (savedId !== null) {
        const idx = filteredQuestions.findIndex((q) => q.id === savedId);
        setCurrentIndex(idx >= 0 ? idx : 0);
      } else {
        setCurrentIndex(0);
      }
    } else if (initialQuestionId !== undefined) {
      const idx = filteredQuestions.findIndex((q) => q.id === initialQuestionId);
      setCurrentIndex(idx >= 0 ? idx : 0);
    } else {
      setCurrentIndex(0);
    }
    setDirection("forward");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, excludeDuplicates]);

  // Snapshot effect: freeze wrong-mode question list on first load to avoid questions disappearing mid-session
  useEffect(() => {
    if (filter === "wrong" && statsLoaded && wrongSnapshot === null) {
      const snap = new Set(
        questions.filter((q) => stats[String(q.id)] === 0).map((q) => q.id)
      );
      setWrongSnapshot(snap);
      if (initialQuestionId !== undefined) {
        const snapQuestions = questions.filter((q) => snap.has(q.id));
        const idx = snapQuestions.findIndex((q) => q.id === initialQuestionId);
        setCurrentIndex(idx >= 0 ? idx : 0);
      } else {
        setCurrentIndex(0);
      }
    }
    if (filter !== "wrong") {
      setWrongSnapshot(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, statsLoaded]);

  const duplicateCount = questions.filter((q) => q.isDuplicate).length;

  const filteredQuestions = questions.filter((q) => {
    if (userInvalidated.has(q.dbId)) return false;
    if (filter === "wrong") {
      return wrongSnapshot ? wrongSnapshot.has(q.id) : stats[String(q.id)] === 0;
    }
    if (filter === "custom") {
      const today = new Date().toISOString().slice(0, 10);
      const s = richStats[String(q.id)];
      if (!s) {
        // Never attempted
        if (filterConfig.neverAttempted) return true;
        if (filterConfig.notSeenInDays !== null) return true;
        return false;
      }
      const acc = s.attempts > 0 ? (s.correctCount / s.attempts) * 100 : 0;
      if (filterConfig.dueForReview && !(s.nextReviewAt && s.nextReviewAt <= today)) return false;
      if (filterConfig.maxAttempts !== null && s.attempts > filterConfig.maxAttempts) return false;
      if (filterConfig.maxAccuracy !== null && acc > filterConfig.maxAccuracy) return false;
      if (filterConfig.notSeenInDays !== null) {
        if (!s.updatedAt) return true;
        const days = (Date.now() - new Date(s.updatedAt).getTime()) / 86_400_000;
        if (days < filterConfig.notSeenInDays) return false;
      }
      return true;
    }
    if (excludeDuplicates && q.isDuplicate) return false;
    return true;
  });

  // currentQId enables re-fire when invalidate replaces same-index question without index change
  const currentQId = filteredQuestions[currentIndex]?.id;

  // Auto-play question + choices when question changes or audio is toggled on
  // Skip if answer is already revealed/submitted to avoid overlap with reveal effect
  useEffect(() => {
    if (revealed || submitted) return;
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    // 現在問題文の次から始まるチャンク列を k 個先読み
    const next = filteredQuestions[currentIndex + 1];
    const upcoming = [
      buildQuestionText(q)[1],
      buildAnswerRevealText(q, settings.language)[0],
      ...(next ? [...buildQuestionText(next), buildAnswerRevealText(next, settings.language)[0]] : []),
    ];
    const k = settings.audioPrefetch ?? 3;
    upcoming.slice(0, k).forEach((chunk) => prefetch(chunk));
    speak(buildQuestionText(q));
    return () => { stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, currentQId, mode, speak, stop, prefetch, revealed, submitted, settings.language]);

  // Auto-play answer reveal when card is flipped (review) or submitted (quiz)
  useEffect(() => {
    if (!revealed && !submitted) return;
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    stop();
    speak(buildAnswerRevealText(q, settings.language));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, submitted, speak, stop, settings.language, currentIndex]);

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

  // Clamp currentIndex when filteredQuestions shrinks (e.g., after stats reload)
  useEffect(() => {
    if (filteredQuestions.length > 0 && currentIndex >= filteredQuestions.length) {
      setCurrentIndex(filteredQuestions.length - 1);
      setDirection("forward");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredQuestions.length]);

  // Show toast when all snapshot questions are answered correctly (but keep filter active)
  useEffect(() => {
    if (!statsLoaded || filter !== "wrong" || !wrongSnapshot || wrongSnapshot.size === 0) return;
    const allDone = [...wrongSnapshot].every((id) => stats[String(id)] === 1);
    if (allDone) {
      setFilterResetToast(true);
      const timer = setTimeout(() => setFilterResetToast(false), 3000);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, wrongSnapshot, statsLoaded, filter]);


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
    if (!correct) setShakeKey((k) => k + 1);
    recordAnswer(q.id, correct, q.dbId);
    if (mode !== "review") {
      setStreak((prev) => correct ? prev + 1 : 0);
    }
    if (correct && settings.skipRevealOnCorrect && mode === "quiz") {
      goNext();
    } else {
      setSubmitted(true);
    }
  }, [filteredQuestions, currentIndex, filter, selected, recordAnswer, mode, settings.skipRevealOnCorrect]);

  const goNext = useCallback(() => {
    setIsCorrect(null);
    setDirection("forward");
    setRevealed(false);
    setSubmitted(false);
    setSelected(new Set());
    setCurrentIndex((i) => Math.min(i + 1, filteredQuestions.length - 1));
  }, [filteredQuestions.length]);

  const goPrev = useCallback(() => {
    setIsCorrect(null);
    setDirection("backward");
    setCurrentIndex((i) => Math.max(i - 1, 0));
    setRevealed(false);
    setSubmitted(false);
    setSelected(new Set());
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

  const handleToggleInvalidate = useCallback(async () => {
    const q = filteredQuestions[currentIndex];
    if (!q?.dbId) return;
    const res = await fetch(`/api/user/questions/${q.dbId}/invalidate`, { method: "POST" });
    const { invalidated } = await res.json() as { invalidated: boolean };
    setUserInvalidated((prev) => {
      const next = new Set(prev);
      if (invalidated) next.add(q.dbId); else next.delete(q.dbId);
      return next;
    });
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

  const isLast = currentIndex === filteredQuestions.length - 1;
  const sliderPct = filteredQuestions.length > 1
    ? `${(currentIndex / (filteredQuestions.length - 1)) * 100}%`
    : "0%";

  const showAnswerModal = mode === "quiz" && submitted;

  const handleReplay = useCallback(() => {
    const q = filteredQuestions[currentIndex];
    if (!q) return;
    if (revealed || submitted) {
      speak(buildAnswerRevealText(q, settings.language));
    } else {
      speak(buildQuestionText(q));
    }
  }, [filteredQuestions, currentIndex, revealed, submitted, speak, settings.language]);

  if (!statsLoaded) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-gray-300" size={24} />
      </div>
    );
  }

  if (filteredQuestions.length === 0) {
    const isAllCleared = filter === "wrong";
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-5 px-4 text-center">
        <div className={`float-y ${isAllCleared ? "text-emerald-400" : "text-gray-300"}`}>
          {isAllCleared
            ? <CheckCircle2 size={52} strokeWidth={1.25} />
            : <AlertCircle size={52} strokeWidth={1.25} />
          }
        </div>
        <div>
          <p className="font-semibold text-gray-800 text-lg">
            {isAllCleared ? "All cleared!" : t("noQuestions")}
          </p>
          {isAllCleared && (
            <p className="text-sm text-gray-400 mt-1">You&apos;ve mastered all the wrong answers.</p>
          )}
        </div>
        {(filter === "wrong" || excludeDuplicates) && (
          <button onClick={() => { setFilter("all"); setExcludeDuplicates(false); }} className="h-10 px-5 rounded-xl bg-scholion-500 text-white text-sm font-semibold hover:bg-scholion-600 transition-colors">
            {t("showAll")}
          </button>
        )}
        <button onClick={() => { doCompleteSession(); router.push(backHref); }} className="text-sm text-gray-400 hover:text-gray-700 flex items-center gap-1.5 transition-colors">
          <ArrowLeft size={14} />
          Back
        </button>
      </div>
    );
  }

  const q = filteredQuestions[currentIndex];

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-canvas">
      {/* Filter reset toast */}
      {filterResetToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-xs font-medium px-4 py-2 rounded-xl shadow-lg pointer-events-none">
          {t("allWrongCleared")}
        </div>
      )}
      {/* ── Header ── */}
      <QuizHeader
        examId={examId}
        examName={examName}
        mode={mode}
        activeCategory={activeCategory}
        onBack={() => { doCompleteSession(); router.push(backHref); }}
        onHome={() => { doCompleteSession(); router.push("/"); }}
        settingsHref={`/settings?returnTo=${encodeURIComponent(`/quiz/${examId}?mode=${mode}&filter=${filter}&startId=${filteredQuestions[currentIndex]?.id ?? ""}`)}`}
        totalCorrect={totalCorrect}
        totalQuestions={questions.length}
        overallRate={overallRate}
        streak={streak}
        filter={filter}
        onFilterChange={setFilter}
        wrongCount={wrongCount}
        hasContinue={hasContinue}
        continueDisplayNum={continueDisplayNum}
        duplicateCount={duplicateCount}
        excludeDuplicates={excludeDuplicates}
        onToggleDuplicates={() => setExcludeDuplicates((v) => !v)}
        filterConfig={filterConfig}
        onFilterConfigChange={(cfg) => { setFilterConfig(cfg); setCurrentIndex(0); }}
        allQuestions={questions}
        richStats={richStats}
        customFilterCount={filter === "custom" ? filteredQuestions.length : undefined}
        onReplay={handleReplay}
        audioPlaying={audioPlaying}
      />

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

        {/* Left panel — key=shakeKey forces animation restart on each wrong answer */}
        <div key={`panel-${shakeKey}`} className={`
          min-h-0 flex-1 flex flex-col overflow-hidden
          border-b lg:border-b-0 lg:border-r border-gray-200
          transition-colors duration-300
          ${mode === "review"
            ? revealed ? "bg-coral-50" : "bg-white"
            : isCorrect === true  ? "bg-emerald-100/70"
            : isCorrect === false ? "bg-coral-50"
            : "bg-white"}
          ${submitted && isCorrect === false ? "shake-x" : ""}
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
                            <button onClick={handleToggleInvalidate} className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${userInvalidated.has(q.dbId) ? "bg-orange-50 border-orange-200 text-orange-500 hover:bg-orange-100" : "bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100"}`} title={userInvalidated.has(q.dbId) ? "Restore — this question will reappear in your quiz" : "Invalidate — hide this question from your quiz"}>
                              <Copy size={12} />
                              {t("invalidate")}
                            </button>
                            <button onClick={handleAiRefine} className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 transition-colors" title="AI Wording Fix — fix typos and phrasing (does not change meaning or answers)">
                              <Wand2 size={12} />
                              {t("refine")}
                            </button>
                            <button onClick={() => setEditingQuestion(q)} className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-scholion-50 border border-scholion-200 text-scholion-500 hover:bg-scholion-100 transition-colors" title="Edit — manually edit the question and answer choices">
                              <Pencil size={12} />
                              Edit
                            </button>
                          </div>
                          <div className="bg-gray-50 rounded-xl px-5 py-4 lg:px-6 lg:py-5 mb-4 max-h-[40vh] overflow-y-auto border-l-4 border-scholion-300">
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
                      <ReviewReveal question={q} onNext={handleRevealNext} isLast={isLast} onAiExplain={handleAiExplain} questionDbId={q.dbId} choices={q.choices} />
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
                      <button onClick={handleToggleInvalidate} className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${userInvalidated.has(q.dbId) ? "bg-orange-50 border-orange-200 text-orange-500 hover:bg-orange-100" : "bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100"}`} title={userInvalidated.has(q.dbId) ? "Restore — this question will reappear in your quiz" : "Invalidate — hide this question from your quiz"}>
                        <Copy size={12} />
                        {t("invalidate")}
                      </button>
                      <button onClick={handleAiRefine} className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 transition-colors" title="AI Wording Fix — fix typos and phrasing (does not change meaning or answers)">
                        <Wand2 size={12} />
                        {t("refine")}
                      </button>
                      <button onClick={() => setEditingQuestion(q)} className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-scholion-50 border border-scholion-200 text-scholion-500 hover:bg-scholion-100 transition-colors" title="Edit — manually edit the question and answer choices">
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
                        className="w-full py-2.5 rounded-xl bg-scholion-500 text-white text-sm font-semibold disabled:opacity-20 hover:bg-scholion-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
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
                          <button onClick={goNext} disabled={isLast} className="flex-1 h-10 rounded-xl bg-scholion-500 text-white text-sm font-semibold disabled:opacity-20 hover:bg-scholion-600 transition-colors flex items-center justify-center gap-1.5">
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
          onSuggest={handleAiSuggest}
          suggesting={aiSuggesting}
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
          questionDbId={q.dbId}
          choices={q.choices}
        />
      )}

      {/* Keyboard hint toast (first quiz session only) */}
      {mode === "quiz" && <KeyboardHintToast />}
    </div>
  );
}
