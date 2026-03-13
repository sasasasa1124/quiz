import { getQuestions, getExamList } from "@/lib/csv";
import QuizClient from "@/components/QuizClient";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ exam: string }>;
  searchParams: Promise<{ mode?: string; filter?: string }>;
}

export async function generateStaticParams() {
  return []; // dynamic rendering to support query params
}

export const dynamic = "force-dynamic";

export default async function ExamPage({ params, searchParams }: Props) {
  const { exam } = await params;
  const { mode: modeParam, filter: filterParam } = await searchParams;

  const examId = decodeURIComponent(exam);
  const exams = getExamList();
  const meta = exams.find((e) => e.id === examId);
  if (!meta) notFound();

  const questions = getQuestions(examId);
  const mode = modeParam === "review" ? "review" : "quiz";
  const filter = filterParam === "wrong" ? "wrong" : "all";

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <QuizClient
        questions={questions}
        examId={examId}
        examName={meta.name}
        initialFilter={filter}
        mode={mode}
        lang={meta.language}
      />
    </main>
  );
}
