import Link from "next/link";

export default function ModePage() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-900 text-center mb-1">資格試験 練習</h1>
        <p className="text-sm text-gray-400 text-center mb-10">モードを選んでください</p>

        <div className="flex flex-col gap-4">
          <Link href="/select/quiz">
            <div className="border-2 border-blue-200 rounded-2xl p-6 bg-white hover:border-blue-400 hover:shadow-md transition-all cursor-pointer text-center">
              <div className="text-4xl mb-3">🧠</div>
              <div className="font-bold text-gray-900 text-lg mb-1">クイズ</div>
              <div className="text-sm text-gray-400">選択肢を選んで正誤判定・正答率記録</div>
            </div>
          </Link>

          <Link href="/select/review">
            <div className="border-2 border-purple-200 rounded-2xl p-6 bg-white hover:border-purple-400 hover:shadow-md transition-all cursor-pointer text-center">
              <div className="text-4xl mb-3">📖</div>
              <div className="font-bold text-gray-900 text-lg mb-1">フラッシュカード</div>
              <div className="text-sm text-gray-400">答えを見ながらさらっと確認</div>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
