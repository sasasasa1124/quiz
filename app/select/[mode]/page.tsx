import Link from "next/link";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ mode: string }>;
}

export default async function LangPage({ params }: Props) {
  const { mode } = await params;
  if (mode !== "quiz" && mode !== "review") notFound();

  const label = mode === "quiz" ? "🧠 クイズ" : "📖 フラッシュカード";

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-8">
          ← {label}
        </Link>

        <p className="text-sm text-gray-400 text-center mb-10">言語を選んでください</p>

        <div className="flex flex-col gap-4">
          <Link href={`/select/${mode}/ja`}>
            <div className="border-2 border-blue-200 rounded-2xl p-6 bg-white hover:border-blue-400 hover:shadow-md transition-all cursor-pointer text-center">
              <div className="text-3xl mb-2">🇯🇵</div>
              <div className="font-bold text-gray-900 text-lg">日本語</div>
            </div>
          </Link>

          <Link href={`/select/${mode}/en`}>
            <div className="border-2 border-green-200 rounded-2xl p-6 bg-white hover:border-green-400 hover:shadow-md transition-all cursor-pointer text-center">
              <div className="text-3xl mb-2">🇺🇸</div>
              <div className="font-bold text-gray-900 text-lg">English</div>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
