"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock, CheckCircle2 } from "lucide-react";
import type { Question } from "@/lib/types";
import QuizQuestion from "./QuizQuestion";
import QuizHeader from "./QuizHeader";
import { useHeaderConfig } from "@/lib/header-context";

interface Props {
  questions: Question[];
  examId: string;
  examName: string;
  timeLimitMinutes: number;
  sessionId: string;
  userEmail: string;
}

const PASS_RATE = 0.67; // 67% to pass, standard Salesforce exam

export default function MockExamClient({ questions, examId, examName, timeLimitMinutes, sessionId, userEmail }: Props) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Set<string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(timeLimitMinutes * 60);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionSavedRef = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const backHref = `/exam/${encodeURIComponent(examId)}`;
  const { setConfig } = useHeaderConfig();
  useEffect(() => {
    if (submitted) {
      setConfig({ back: { href: backHref }, title: "Mock Exam Results" });
    } else {
      setConfig({ hidden: true });
    }
    return () => setConfig({});
  }, [submitted, backHref, setConfig]);

  const saveSession = useCallback(async (correctCount: number) => {
    if (sessionSavedRef.current) return;
    sessionSavedRef.current = true;
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correctCount }),
    }).catch(() => {});
  }, [sessionId]);

  const handleSubmit = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSubmitted(true);

    // Save individual scores and session
    let correctCount = 0;
    for (const q of questions) {
      const selected = answers[q.id] ?? new Set();
      const correct = q.answers.length === selected.size && q.answers.every((a) => selected.has(a));
      if (correct) correctCount++;
      fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, questionId: q.id, correct, sessionId, questionDbId: q.dbId }),
      }).catch(() => {});
    }
    await saveSession(correctCount);
  }, [questions, answers, examId, sessionId, saveSession]);

  // Countdown timer
  useEffect(() => {
    if (submitted) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          handleSubmit();
          return 0;
        }
        return t - 1;
      });
      setElapsed((e) => e + 1);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [submitted, handleSubmit]);

  const handleToggle = useCallback((label: string) => {
    const q = questions[currentIndex];
    if (!q || submitted) return;
    setAnswers((prev) => {
      const cur = new Set(prev[q.id] ?? []);
      if (q.isMultiple) {
        cur.has(label) ? cur.delete(label) : cur.add(label);
      } else {
        cur.clear();
        cur.add(label);
      }
      return { ...prev, [q.id]: cur };
    });
  }, [questions, currentIndex, submitted]);

  const goNext = useCallback(() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1)), [questions.length]);
  const goPrev = useCallback(() => setCurrentIndex((i) => Math.max(0, i - 1)), []);

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

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Results view
  if (submitted) {
    const correct = questions.filter((q) => {
      const sel = answers[q.id] ?? new Set();
      return q.answers.length === sel.size && q.answers.every((a) => sel.has(a));
    }).length;
    const total = questions.length;
    const pct = Math.round((correct / total) * 100);
    const passed = correct / total >= PASS_RATE;

    const categoryBreakdown = Object.entries(
      questions.reduce<Record<string, { correct: number; total: number }>>((acc, q) => {
        const cat = q.category ?? "Uncategorized";
        if (!acc[cat]) acc[cat] = { correct: 0, total: 0 };
        acc[cat].total++;
        const sel = answers[q.id] ?? new Set();
        if (q.answers.length === sel.size && q.answers.every((a) => sel.has(a))) {
          acc[cat].correct++;
        }
        return acc;
      }, {})
    ).sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);

    const elapsedMin = Math.floor(elapsed / 60);
    const elapsedSec = elapsed % 60;

    return (
      <div className="min-h-screen bg-[#f8f9fb] flex flex-col pt-14">
        <main className="flex-1 px-4 sm:px-8 py-8 max-w-xl mx-auto w-full space-y-6">

          {/* Score banner */}
          <div className={`rounded-2xl border-2 p-6 text-center ${passed ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
            <div className={`text-5xl font-bold tabular-nums mb-1 ${passed ? "text-emerald-600" : "text-rose-500"}`}>{pct}%</div>
            <div className={`text-sm font-semibold ${passed ? "text-emerald-700" : "text-rose-600"}`}>
              {passed ? "PASS" : "FAIL"} — {correct}/{total} correct
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Time: {elapsedMin}m {elapsedSec}s / {timeLimitMinutes}m limit
            </div>
          </div>

          {/* Category breakdown */}
          {categoryBreakdown.length > 0 && (
            <section>
              <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">By Category</h2>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {categoryBreakdown.map(([cat, s]) => {
                  const catPct = Math.round((s.correct / s.total) * 100);
                  return (
                    <div key={cat} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{cat}</p>
                        <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${catPct >= 80 ? "bg-emerald-500" : catPct >= 60 ? "bg-amber-400" : "bg-rose-400"}`}
                            style={{ width: `${catPct}%` }}
                          />
                        </div>
                      </div>
                      <span className={`text-xs font-bold tabular-nums shrink-0 ${catPct >= 80 ? "text-emerald-600" : catPct >= 60 ? "text-amber-500" : "text-rose-500"}`}>
                        {s.correct}/{s.total}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <button
            onClick={() => router.push(backHref)}
            className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors"
          >
            Back to Exam
          </button>
        </main>
      </div>
    );
  }

  const q = questions[currentIndex];
  const selected = answers[q?.id ?? 0] ?? new Set();
  const answeredCount = Object.keys(answers).length;
  const timerPct = timeLeft / (timeLimitMinutes * 60);
  const timerRed = timeLeft < 300; // last 5 min

  const timerWidget = (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${timerRed ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-white border-gray-200 text-gray-700"}`}>
      <Clock size={13} strokeWidth={2} />
      <span className="text-sm font-semibold tabular-nums">{formatTime(timeLeft)}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
      <QuizHeader
        examId={examId}
        examName={examName}
        mode="mock"
        totalCorrect={undefined}
        totalQuestions={questions.length}
        overallRate={null}
        rightExtra={timerWidget}
      />

      {/* Timer bar */}
      <div className="h-1 bg-gray-100">
        <div
          className={`h-full transition-all ${timerRed ? "bg-rose-400" : "bg-gray-400"}`}
          style={{ width: `${timerPct * 100}%` }}
        />
      </div>

      {/* Progress dots */}
      <div className="px-4 sm:px-8 py-3 flex items-center gap-2 max-w-2xl mx-auto w-full">
        <span className="text-xs text-gray-400 shrink-0">{answeredCount}/{questions.length} answered</span>
        <div className="flex-1 flex gap-0.5 overflow-hidden">
          {questions.map((qn, i) => (
            <button
              key={qn.id}
              onClick={() => setCurrentIndex(i)}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                answers[qn.id] ? "bg-gray-600" : i === currentIndex ? "bg-gray-300" : "bg-gray-150"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Question */}
      <div
        className="flex-1 px-4 sm:px-8 pb-4 max-w-2xl mx-auto w-full"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-gray-400">Question {currentIndex + 1} / {questions.length}</span>
          {q.isMultiple && (
            <span className="text-xs px-2 py-0.5 rounded-lg bg-scholion-50 border border-scholion-200 text-scholion-500">
              Select {q.answers.length}
            </span>
          )}
        </div>
        <QuizQuestion
          question={q}
          selected={selected}
          submitted={false}
          onToggle={handleToggle}
        />
      </div>

      {/* Footer nav */}
      <div className="px-4 sm:px-8 py-4 border-t border-gray-100 flex items-center gap-3 max-w-2xl mx-auto w-full">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="h-10 w-10 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors shrink-0"
        >
          <ChevronLeft size={16} />
        </button>

        {currentIndex < questions.length - 1 ? (
          <button
            onClick={goNext}
            className="flex-1 h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors flex items-center justify-center gap-1.5"
          >
            Next <ChevronRight size={14} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            className="flex-1 h-10 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 size={14} /> Submit Exam
          </button>
        )}

        {answeredCount === questions.length && currentIndex < questions.length - 1 && (
          <button
            onClick={handleSubmit}
            className="h-10 px-4 rounded-xl border-2 border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold transition-colors shrink-0 flex items-center gap-1"
          >
            <CheckCircle2 size={12} /> Submit
          </button>
        )}
      </div>
    </div>
  );
}
