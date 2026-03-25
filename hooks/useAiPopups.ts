"use client";

import { useState, useEffect, useCallback } from "react";
import type { Question } from "@/lib/types";
import type { AiExplainResponse } from "@/app/api/ai/explain/route";
import type { AiRefineResponse } from "@/app/api/ai/refine/route";
import type { AiFactCheckResponse } from "@/app/api/ai/factcheck/route";

interface Options {
  currentQuestion: Question | undefined;
  aiPrompt: string;
  aiRefinePrompt: string;
  aiFactCheckPrompt: string;
  /** Called after any successful AI adopt so the parent can update its question list. */
  onQuestionUpdate: (updated: Question) => void;
}

/**
 * Consolidates explain / refine / factcheck popup state and handlers.
 * Used by both QuizClient and AnswersClient to eliminate ~200 lines of
 * duplicated code in each component.
 */
export function useAiPopups({
  currentQuestion,
  aiPrompt,
  aiRefinePrompt,
  aiFactCheckPrompt,
  onQuestionUpdate,
}: Options) {
  // ── Explain ──────────────────────────────────────────────────────────────
  const [aiPopupOpen, setAiPopupOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiExplainResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAdopting, setAiAdopting] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);

  // ── Refine ───────────────────────────────────────────────────────────────
  const [refinePopupOpen, setRefinePopupOpen] = useState(false);
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineResult, setRefineResult] = useState<AiRefineResponse | null>(null);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [refineAdopting, setRefineAdopting] = useState(false);

  // ── Fact Check ───────────────────────────────────────────────────────────
  const [factCheckPopupOpen, setFactCheckPopupOpen] = useState(false);
  const [factCheckLoading, setFactCheckLoading] = useState(false);
  const [factCheckResult, setFactCheckResult] = useState<AiFactCheckResponse | null>(null);
  const [factCheckError, setFactCheckError] = useState<string | null>(null);
  const [factCheckAdopting, setFactCheckAdopting] = useState(false);

  // Reset all popup state when the current question changes
  useEffect(() => {
    setAiPopupOpen(false);
    setAiResult(null);
    setAiLoading(false);
    setAiError(null);
    setRefinePopupOpen(false);
    setRefineResult(null);
    setRefineLoading(false);
    setRefineError(null);
    setFactCheckPopupOpen(false);
    setFactCheckResult(null);
    setFactCheckLoading(false);
    setFactCheckError(null);
  }, [currentQuestion?.dbId]);

  // ── Explain handlers ─────────────────────────────────────────────────────
  const handleAiExplain = useCallback(async () => {
    if (!currentQuestion) return;
    setAiPopupOpen(true);
    setAiLoading(true);
    setAiResult(null);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentQuestion.question,
          choices: currentQuestion.choices,
          answers: currentQuestion.answers,
          explanation: currentQuestion.explanation,
          userPrompt: aiPrompt,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error ?? "Request failed");
      }
      setAiResult(await res.json() as AiExplainResponse);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Failed to get AI explanation");
    } finally {
      setAiLoading(false);
    }
  }, [currentQuestion, aiPrompt]);

  const handleAiAdopt = useCallback(async () => {
    if (!aiResult || !currentQuestion) return;
    setAiAdopting(true);
    try {
      const res = await fetch(`/api/admin/questions/${encodeURIComponent(currentQuestion.dbId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text: currentQuestion.question,
          options: currentQuestion.choices,
          answers: aiResult.answers,
          explanation: aiResult.explanation,
          change_reason: "AI-generated via Gemini",
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      onQuestionUpdate({ ...currentQuestion, answers: aiResult.answers, explanation: aiResult.explanation });
      setAiPopupOpen(false);
      setAiResult(null);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Failed to adopt answer");
    } finally {
      setAiAdopting(false);
    }
  }, [aiResult, currentQuestion, onQuestionUpdate]);

  const handleAiSuggest = useCallback(async () => {
    if (!aiResult || !currentQuestion) return;
    setAiSuggesting(true);
    try {
      await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: currentQuestion.dbId,
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
  }, [aiResult, currentQuestion]);

  // ── Refine handlers ──────────────────────────────────────────────────────
  const handleAiRefine = useCallback(async () => {
    if (!currentQuestion) return;
    setRefinePopupOpen(true);
    setRefineLoading(true);
    setRefineResult(null);
    setRefineError(null);
    try {
      const res = await fetch("/api/ai/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentQuestion.question,
          choices: currentQuestion.choices,
          answers: currentQuestion.answers,
          userPrompt: aiRefinePrompt,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error ?? "Request failed");
      }
      setRefineResult(await res.json() as AiRefineResponse);
    } catch (e) {
      setRefineError(e instanceof Error ? e.message : "Failed to refine question");
    } finally {
      setRefineLoading(false);
    }
  }, [currentQuestion, aiRefinePrompt]);

  /**
   * Adopts the AI-refined question wording.
   * If `edited` is provided (QuizClient passes user-edited values from the popup),
   * those are used. Otherwise falls back to `refineResult` directly (AnswersClient).
   */
  const handleRefineAdopt = useCallback(async (edited?: { question: string; choices: Question["choices"] }) => {
    if (!currentQuestion) return;
    const effective = edited ?? (refineResult ? { question: refineResult.question, choices: refineResult.choices } : null);
    if (!effective) return;
    setRefineAdopting(true);
    try {
      const res = await fetch(`/api/admin/questions/${encodeURIComponent(currentQuestion.dbId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text: effective.question,
          options: effective.choices,
          answers: currentQuestion.answers,
          explanation: currentQuestion.explanation,
          change_reason: `AI refined: ${refineResult?.changesSummary || "typo/grammar fix"}`,
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      onQuestionUpdate({ ...currentQuestion, question: effective.question, choices: effective.choices });
      setRefinePopupOpen(false);
      setRefineResult(null);
    } catch (e) {
      setRefineError(e instanceof Error ? e.message : "Failed to adopt refinement");
    } finally {
      setRefineAdopting(false);
    }
  }, [currentQuestion, refineResult, onQuestionUpdate]);

  // ── Fact Check handlers ──────────────────────────────────────────────────
  const handleAiFactCheck = useCallback(async () => {
    if (!currentQuestion) return;
    setFactCheckPopupOpen(true);
    setFactCheckLoading(true);
    setFactCheckResult(null);
    setFactCheckError(null);
    try {
      const res = await fetch("/api/ai/factcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentQuestion.question,
          choices: currentQuestion.choices,
          answers: currentQuestion.answers,
          userPrompt: aiFactCheckPrompt,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error ?? "Request failed");
      }
      setFactCheckResult(await res.json() as AiFactCheckResponse);
    } catch (e) {
      setFactCheckError(e instanceof Error ? e.message : "Failed to fact check");
    } finally {
      setFactCheckLoading(false);
    }
  }, [currentQuestion, aiFactCheckPrompt]);

  const handleFactCheckAdopt = useCallback(async (newAnswers: string[]) => {
    if (!currentQuestion) return;
    setFactCheckAdopting(true);
    try {
      const res = await fetch(`/api/admin/questions/${encodeURIComponent(currentQuestion.dbId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text: currentQuestion.question,
          options: currentQuestion.choices,
          answers: newAnswers,
          explanation: factCheckResult?.explanation || currentQuestion.explanation,
          change_reason: "AI fact-check: answer corrected",
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      onQuestionUpdate({
        ...currentQuestion,
        answers: newAnswers,
        explanation: factCheckResult?.explanation || currentQuestion.explanation,
      });
      setFactCheckPopupOpen(false);
      setFactCheckResult(null);
    } catch (e) {
      setFactCheckError(e instanceof Error ? e.message : "Failed to adopt fact check");
    } finally {
      setFactCheckAdopting(false);
    }
  }, [currentQuestion, factCheckResult, onQuestionUpdate]);

  const dismissExplain = useCallback(() => {
    setAiPopupOpen(false);
    setAiResult(null);
    setAiError(null);
  }, []);

  const dismissRefine = useCallback(() => {
    setRefinePopupOpen(false);
    setRefineResult(null);
    setRefineError(null);
  }, []);

  const dismissFactCheck = useCallback(() => {
    setFactCheckPopupOpen(false);
    setFactCheckResult(null);
    setFactCheckError(null);
  }, []);

  return {
    // Explain
    aiPopupOpen, aiLoading, aiResult, aiError, aiAdopting, aiSuggesting,
    handleAiExplain, handleAiAdopt, handleAiSuggest, dismissExplain,
    // Refine
    refinePopupOpen, refineLoading, refineResult, refineError, refineAdopting,
    handleAiRefine, handleRefineAdopt, dismissRefine,
    // Fact Check
    factCheckPopupOpen, factCheckLoading, factCheckResult, factCheckError, factCheckAdopting,
    handleAiFactCheck, handleFactCheckAdopt, dismissFactCheck,
  };
}
