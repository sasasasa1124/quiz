"use client";

import { useEffect, useState, useRef } from "react";
import type { ExamMeta, QuizStats } from "@/lib/types";
import ExamCard from "./ExamCard";

interface Props {
  exams: ExamMeta[];
}

type Mode = "quiz" | "review";

function loadAllStats(examId: string): QuizStats {
  try {
    return JSON.parse(localStorage.getItem(`quiz-stats-${examId}`) ?? "{}");
  } catch {
    return {};
  }
}

export default function HomeClient({ exams: initialExams }: Props) {
  const [mode, setMode] = useState<Mode>("quiz");
  const [langFilter, setLangFilter] = useState<"all" | "ja" | "en">("all");
  const [statsMap, setStatsMap] = useState<Record<string, { correct: number; answered: number; total: number }>>({});
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [exams, setExams] = useState<ExamMeta[]>(initialExams);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const map: typeof statsMap = {};
    for (const exam of exams) {
      const stats = loadAllStats(exam.id);
      const keys = Object.keys(stats).filter((k) => stats[k] === 0 || stats[k] === 1);
      map[exam.id] = {
        answered: keys.length,
        total: exam.questionCount,
        correct: keys.filter((k) => stats[k] === 1).length,
      };
    }
    setStatsMap(map);
  }, [exams]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus("uploading");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const { exam } = await res.json();
      setExams((prev) => {
        const exists = prev.find((e) => e.id === exam.id);
        return exists ? prev.map((e) => (e.id === exam.id ? exam : e)) : [...prev, exam];
      });
      setUploadStatus("done");
      setTimeout(() => setUploadStatus("idle"), 2000);
    } catch {
      setUploadStatus("error");
      setTimeout(() => setUploadStatus("idle"), 2000);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const filtered = exams.filter((e) => langFilter === "all" || e.language === langFilter);
  const jaExams = filtered.filter((e) => e.language === "ja");
  const enExams = filtered.filter((e) => e.language === "en");

  return (
    <div>
      {/* Mode toggle — topmost choice */}
      <div className="mb-6">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-2">モード</p>
        <div className="flex gap-2">
          <button
            onClick={() => setMode("quiz")}
            className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${
              mode === "quiz"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            <span className="block text-lg mb-0.5">🧠</span>
            クイズ
          </button>
          <button
            onClick={() => setMode("review")}
            className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${
              mode === "review"
                ? "border-purple-500 bg-purple-50 text-purple-700"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            <span className="block text-lg mb-0.5">📖</span>
            フラッシュカード
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {mode === "quiz"
            ? "選択肢を選んで回答 — 正誤判定と正答率を記録"
            : "答えを最初から表示して読み込みながら進む"}
        </p>
      </div>

      {/* Upload + Lang filter row */}
      <div className="flex items-center gap-2 mb-5">
        <div className="flex gap-1.5">
          {(["all", "ja", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLangFilter(l)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                langFilter === l
                  ? "bg-gray-900 text-white border-gray-900"
                  : "border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              {l === "all" ? "すべて" : l === "ja" ? "日本語" : "English"}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadStatus === "uploading"}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${
              uploadStatus === "done"
                ? "border-green-400 text-green-600 bg-green-50"
                : uploadStatus === "error"
                ? "border-red-400 text-red-600 bg-red-50"
                : "border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600"
            }`}
          >
            {uploadStatus === "uploading" ? "⟳ アップロード中..." :
             uploadStatus === "done" ? "✓ 完了" :
             uploadStatus === "error" ? "✗ エラー" :
             "+ CSV追加"}
          </button>
        </div>
      </div>

      {/* Exam lists */}
      {jaExams.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">日本語</h2>
          <div className="grid gap-3">
            {jaExams.map((exam) => (
              <ExamCard key={exam.id} exam={exam} stats={statsMap[exam.id]} mode={mode} />
            ))}
          </div>
        </section>
      )}
      {enExams.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">English</h2>
          <div className="grid gap-3">
            {enExams.map((exam) => (
              <ExamCard key={exam.id} exam={exam} stats={statsMap[exam.id]} mode={mode} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
