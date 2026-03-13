import { getExamList } from "@/lib/csv";
import { notFound } from "next/navigation";
import ExamSelectClient from "@/components/ExamSelectClient";

interface Props {
  params: Promise<{ mode: string; lang: string }>;
}

export const dynamic = "force-dynamic";

export default async function ExamSelectPage({ params }: Props) {
  const { mode, lang } = await params;
  if ((mode !== "quiz" && mode !== "review") || (lang !== "ja" && lang !== "en")) notFound();

  const exams = getExamList().filter((e) => e.language === lang);

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-sm mx-auto">
        <ExamSelectClient
          exams={exams}
          mode={mode as "quiz" | "review"}
          lang={lang as "ja" | "en"}
        />
      </div>
    </main>
  );
}
