import { getQuestions, getExamList } from "@/lib/csv";
import QuizClient from "@/components/QuizClient";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ mode: string; exam: string }>;
}

export const dynamic = "force-dynamic";

export default async function ExamPage({ params }: Props) {
  const { mode, exam } = await params;
  if (mode !== "quiz" && mode !== "review") notFound();

  const examId = decodeURIComponent(exam);
  const exams = getExamList();
  const meta = exams.find((e) => e.id === examId);
  if (!meta) notFound();

  const questions = getQuestions(examId);

  return (
    <QuizClient
      questions={questions}
      examId={examId}
      examName={meta.name}
      mode={mode as "quiz" | "review"}
    />
  );
}
