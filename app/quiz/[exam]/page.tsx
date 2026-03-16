import { getQuestions, getExamList } from "@/lib/db";
import { getUserEmail } from "@/lib/user";
import QuizClient from "@/components/QuizClient";
import AnswersClient from "@/components/AnswersClient";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ exam: string }>;
  searchParams: Promise<{ mode?: string; category?: string }>;
}

export const dynamic = "force-dynamic";

export default async function QuizPage({ params, searchParams }: Props) {
  const { exam } = await params;
  const { mode = "quiz", category } = await searchParams;

  if (mode !== "quiz" && mode !== "review" && mode !== "answers") notFound();

  const examId = decodeURIComponent(exam);
  const exams = await getExamList();
  const meta = exams.find((e) => e.id === examId);
  if (!meta) notFound();

  const allQuestions = await getQuestions(examId);
  const questions = category
    ? allQuestions.filter((q) => q.category === category)
    : allQuestions;

  const userEmail = await getUserEmail();

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

  return (
    <QuizClient
      questions={questions}
      examId={examId}
      examName={meta.name}
      mode={mode as "quiz" | "review"}
      userEmail={userEmail}
      activeCategory={category ?? null}
    />
  );
}
