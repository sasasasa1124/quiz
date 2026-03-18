"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw, AlertCircle, Lightbulb } from "lucide-react";
import type { Question } from "@/lib/types";
import PageHeader from "./PageHeader";
import { useSettings } from "@/lib/settings-context";

interface Props {
  questions: Question[];
  examId: string;
  examName: string;
}

interface UserStats {
  totalAttempted: number;
  totalCorrect: number;
  accuracy: number;
  perCategory: Record<string, { attempted: number; correct: number; accuracy: number }>;
  wrongQuestions: {
    question: string;
    answers: string[];
    correctAnswers: string[];
    category: string | null;
  }[];
}

// Minimal markdown renderer — handles h1-h4, bullets, bold, hr, paragraphs
function MarkdownBlock({ text }: { text: string }) {
  function renderInline(line: string): React.ReactNode {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="my-2 space-y-1 pl-4">
        {listBuffer.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
            <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-gray-400" />
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("#### ")) {
      flushList();
      nodes.push(
        <h4 key={i} className="text-sm font-semibold text-gray-700 mt-4 mb-1">
          {renderInline(line.slice(5))}
        </h4>
      );
    } else if (line.startsWith("### ")) {
      flushList();
      nodes.push(
        <h3 key={i} className="text-base font-bold text-gray-900 mt-6 mb-2 pb-1 border-b border-gray-100">
          {renderInline(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      flushList();
      nodes.push(
        <h2 key={i} className="text-lg font-bold text-gray-900 mt-8 mb-3">
          {renderInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("# ")) {
      flushList();
      nodes.push(
        <h1 key={i} className="text-xl font-bold text-gray-900 mt-2 mb-4">
          {renderInline(line.slice(2))}
        </h1>
      );
    } else if (/^---+$/.test(line.trim())) {
      flushList();
      nodes.push(<hr key={i} className="border-gray-200 my-4" />);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      listBuffer.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      nodes.push(
        <p key={i} className="text-sm text-gray-700 leading-relaxed my-1">
          {renderInline(line)}
        </p>
      );
    }
  }
  flushList();

  return <div>{nodes}</div>;
}

export default function StudyGuideClient({ questions, examId, examName }: Props) {
  const { settings } = useSettings();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);

  // Compute user stats from localStorage
  useEffect(() => {
    const raw = localStorage.getItem(`quiz-stats-${examId}`);
    if (!raw) return;
    const statsMap = JSON.parse(raw) as Record<string, 0 | 1>;

    const perCategory: Record<string, { attempted: number; correct: number; accuracy: number }> = {};
    const wrongQs: UserStats["wrongQuestions"] = [];
    let totalAttempted = 0, totalCorrect = 0;

    for (const [idxStr, val] of Object.entries(statsMap)) {
      const q = questions.find((q) => String(q.id) === idxStr);
      if (!q) continue;
      totalAttempted++;
      if (val === 1) totalCorrect++;
      const cat = q.category ?? "General";
      if (!perCategory[cat]) perCategory[cat] = { attempted: 0, correct: 0, accuracy: 0 };
      perCategory[cat].attempted++;
      if (val === 1) perCategory[cat].correct++;
      else wrongQs.push({
        question: q.question,
        answers: q.choices.map((c) => `${c.label}. ${c.text}`),
        correctAnswers: q.answers,
        category: q.category ?? null,
      });
    }

    for (const s of Object.values(perCategory)) {
      s.accuracy = Math.round(s.correct / s.attempted * 100);
    }

    const accuracy = totalAttempted > 0 ? Math.round(totalCorrect / totalAttempted * 100) : 0;
    setUserStats({ totalAttempted, totalCorrect, accuracy, perCategory, wrongQuestions: wrongQs });
  }, [examId, questions]);

  // On mount: check DB cache for common guide
  useEffect(() => {
    setMarkdown(null);
    setGeneratedAt(null);
    setError(null);
    setLoading(true);
    fetch(`/api/ai/study-guide?examId=${encodeURIComponent(examId)}`)
      .then((r) => r.json() as Promise<{ markdown: string | null; generatedAt: string | null }>)
      .then((data) => {
        if (data.markdown) {
          setMarkdown(data.markdown);
          setGeneratedAt(data.generatedAt);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [examId]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/study-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Personalized guides (with userStats) are not cached
          examId: userStats ? null : examId,
          examName,
          language: settings.language,
          questions: questions.map((q) => ({
            question: q.question,
            answers: q.choices.map((c) => `${c.label}. ${c.text}`),
            category: q.category ?? null,
          })),
          ...(userStats ? { userStats } : {}),
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { markdown: string };
      setMarkdown(data.markdown);
      setGeneratedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, [examId, examName, questions, userStats, settings.language]);

  function formatDate(iso: string) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(settings.language === "ja" ? "ja-JP" : "en-US", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const isReady = !loading && !generating;

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
      <PageHeader
        back={{ href: `/exam/${encodeURIComponent(examId)}` }}
        title="Study Guide"
        right={
          isReady && markdown ? (
            <button
              onClick={generate}
              title="Regenerate"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw size={12} />
              Regenerate
            </button>
          ) : undefined
        }
      />

      <main className="flex-1 px-4 sm:px-8 py-6 max-w-3xl mx-auto w-full">

        {/* DB check loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={22} className="animate-spin text-gray-300" />
          </div>
        )}

        {/* Generating */}
        {generating && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 size={28} className="animate-spin text-gray-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600">
                Analyzing {questions.length} questions...
              </p>
              <p className="text-xs text-gray-400 mt-1">Web search included. This may take ~30 seconds.</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && isReady && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 flex flex-col items-center gap-3 text-center mb-4">
            <AlertCircle size={20} className="text-rose-400" />
            <p className="text-sm text-rose-700">{error}</p>
            <button
              onClick={generate}
              className="px-4 py-2 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {isReady && !markdown && !error && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Lightbulb size={28} className="text-gray-300" />
            <p className="text-sm text-gray-400">
              {userStats
                ? `${userStats.totalAttempted} questions answered · ${userStats.accuracy}% accuracy`
                : "No study guide generated yet"}
            </p>
            <button
              onClick={generate}
              className="px-4 py-2 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors"
            >
              Generate ({questions.length} questions)
            </button>
          </div>
        )}

        {/* Markdown content */}
        {markdown && isReady && (
          <>
            {generatedAt && (
              <p className="text-xs text-gray-400 mb-3 text-right">
                {userStats && (
                  <span className="mr-2 text-gray-500 font-medium">
                    {userStats.totalAttempted} answered · {userStats.accuracy}%
                  </span>
                )}
                Generated: {formatDate(generatedAt)}
              </p>
            )}
            <div className="bg-white rounded-2xl border border-gray-200 px-6 py-6">
              <MarkdownBlock text={markdown} />
            </div>
          </>
        )}

      </main>
    </div>
  );
}
