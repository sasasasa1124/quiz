import { getExamList, getCategoryStats } from "@/lib/db";
import { getUserEmail } from "@/lib/user";
import { notFound } from "next/navigation";
import ExamDetailClient from "@/components/ExamDetailClient";

export const runtime = 'edge';

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function ExamDetailPage({ params }: Props) {
  const { id } = await params;
  const examId = decodeURIComponent(id);

  const [exams, userEmail] = await Promise.all([getExamList(), getUserEmail()]);
  const exam = exams.find((e) => e.id === examId);
  if (!exam) notFound();

  const categoryStats = await getCategoryStats(userEmail, examId);

  return (
    <ExamDetailClient
      exam={exam}
      categoryStats={categoryStats}
      userEmail={userEmail}
    />
  );
}
