import { getExamList } from "@/lib/db";
import ExamListClient from "@/components/ExamListClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const exams = await getExamList();
  return <ExamListClient exams={exams} />;
}