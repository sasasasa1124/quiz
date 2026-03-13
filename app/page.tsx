import Link from "next/link";
import { Brain, BookOpen, ChevronRight } from "lucide-react";
import PageHeader from "@/components/PageHeader";

export default function ModePage() {
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
      <PageHeader />

      <main className="flex-1 flex items-start justify-center pt-16 px-8">
        <div className="w-full max-w-md">
          <p className="text-sm text-gray-400 mb-6">モードを選択</p>

          <div className="grid grid-cols-2 gap-4">
            <Link href="/select/quiz" className="group block">
              <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-center text-center gap-3 hover:border-blue-400 hover:shadow-[0_0_0_3px_rgba(59,130,246,0.08)] transition-all duration-150 h-full">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Brain size={24} className="text-blue-600" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">クイズ</p>
                  <p className="text-xs text-gray-400 mt-1">選択肢を選んで正誤判定</p>
                </div>
                <ChevronRight size={15} className="text-gray-300 group-hover:text-blue-400 transition-colors mt-auto" />
              </div>
            </Link>

            <Link href="/select/review" className="group block">
              <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-center text-center gap-3 hover:border-violet-400 hover:shadow-[0_0_0_3px_rgba(139,92,246,0.08)] transition-all duration-150 h-full">
                <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center">
                  <BookOpen size={24} className="text-violet-600" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">フラッシュカード</p>
                  <p className="text-xs text-gray-400 mt-1">答えを見ながら確認</p>
                </div>
                <ChevronRight size={15} className="text-gray-300 group-hover:text-violet-400 transition-colors mt-auto" />
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
