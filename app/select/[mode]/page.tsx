import { getExamList } from "@/lib/db";
import { notFound } from "next/navigation";
import ExamSelectClient from "@/components/ExamSelectClient";

export const runtime = "edge";

interface Props {
  params: Promise<{ mode: string }>;
}

export const dynamic = "force-dynamic";

export default async function ExamSelectPage({ params }: Props) {
  const { mode } = await params;
  if (mode !== "quiz" && mode !== "review" && mode !== "answers") notFound();

  const exams = await getExamList();

  return (
    <ExamSelectClient
      exams={exams}
      mode={mode as "quiz" | "review" | "answers"}
    />
  );
}
