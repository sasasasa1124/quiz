import { getQuestions, getExamList, createSession, getUserInvalidatedIds } from "@/lib/db";
import { getUserEmail } from "@/lib/user";
import QuizClient from "@/components/QuizClient";
import AnswersClient from "@/components/AnswersClient";
import MockExamClient from "@/components/MockExamClient";
import StudyGuideClient from "@/components/StudyGuideClient";
import { notFound } from "next/navigation";

// Salesforce exam configs: question count and time limit
const MOCK_CONFIGS: Record<string, { questions: number; minutes: number }> = {};
const DEFAULT_MOCK_CONFIG = { questions: 60, minutes: 105 };

function getMockConfig(examId: string) {
  for (const [key, val] of Object.entries(MOCK_CONFIGS)) {
    if (examId.includes(key)) return val;
  }
  return DEFAULT_MOCK_CONFIG;
}

function selectRandomQuestions<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

export const runtime = 'edge';

interface Props {
  params: Promise<{ exam: string }>;
  searchParams: Promise<{ mode?: string; filter?: string; category?: string; startId?: string }>;
}

export const dynamic = "force-dynamic";

export default async function QuizPage({ params, searchParams }: Props) {
  const { exam } = await params;
  const { mode = "quiz", filter, category, startId } = await searchParams;
  const initialFilter = (filter === "wrong" || filter === "continue") ? filter : "all";

  if (mode !== "quiz" && mode !== "review" && mode !== "answers" && mode !== "mock" && mode !== "study-guide") notFound();

  const examId = decodeURIComponent(exam);

  const [exams, allQuestions, userEmail] = await Promise.all([
    getExamList(),
    getQuestions(examId),
    getUserEmail(),
  ]);

  const meta = exams.find((e) => e.id === examId);
  if (!meta) notFound();

  const questions = category
    ? allQuestions.filter((q) => q.category === category)
    : allQuestions;

  if (mode === "mock") {
    const config = getMockConfig(examId);
    const mockQuestions = selectRandomQuestions(
      questions.filter((q) => !q.isDuplicate),
      config.questions
    );
    const sessionId = crypto.randomUUID();
    await createSession(userEmail, examId, "quiz", "all", mockQuestions.length, sessionId);
    return (
      <MockExamClient
        questions={mockQuestions}
        examId={examId}
        examName={meta.name}
        timeLimitMinutes={config.minutes}
        sessionId={sessionId}
        userEmail={userEmail}
      />
    );
  }

  if (mode === "study-guide") {
    return (
      <StudyGuideClient
        questions={questions}
        examId={examId}
        examName={meta.name}
      />
    );
  }

  if (mode === "answers") {
    return (
      <AnswersClient
        questions={questions}
        examName={meta.name}
        examId={examId}
        userEmail={userEmail}
        activeCategory={category ?? null}
      />
    );
  }

  const invalidatedIds = await getUserInvalidatedIds(userEmail, examId);

  const initialQuestionId = startId ? parseInt(startId, 10) : undefined;

  return (
    <QuizClient
      questions={questions}
      examId={examId}
      examName={meta.name}
      mode={mode as "quiz" | "review"}
      userEmail={userEmail}
      activeCategory={category ?? null}
      initialFilter={initialFilter}
      invalidatedIds={invalidatedIds}
      initialQuestionId={initialQuestionId}
    />
  );
}
