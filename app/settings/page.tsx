"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Sparkles, Wand2, BrainCircuit, RefreshCw, Target } from "lucide-react";
import { useSettings } from "@/lib/settings-context";
import PageHeader from "@/components/PageHeader";
import type { Locale } from "@/lib/i18n";

const LANGUAGES: { value: Locale; label: string; native: string }[] = [
  { value: "en", label: "English", native: "English" },
  { value: "ja", label: "Japanese", native: "日本語" },
  { value: "zh", label: "Chinese (Simplified)", native: "中文（简体）" },
  { value: "ko", label: "Korean", native: "한국어" },
];

function SettingsInner() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("returnTo") ?? "/";
  const returnTo = raw.startsWith("/") ? raw : "/";

  const { settings, updateSettings, t } = useSettings();
  const [language, setLanguage] = useState<Locale>(settings.language);
  const [aiPrompt, setAiPrompt] = useState(settings.aiPrompt);
  const [aiRefinePrompt, setAiRefinePrompt] = useState(settings.aiRefinePrompt);
  const [dailyGoal, setDailyGoal] = useState(settings.dailyGoal ?? 20);
  const [saved, setSaved] = useState(false);
  const [geminiModel, setGeminiModel] = useState("");
  const [modelList, setModelList] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelListError, setModelListError] = useState<string | null>(null);
  const modelBeforeFocus = useRef<string>("");

  // Sync local state when settings load from localStorage
  useEffect(() => {
    setLanguage(settings.language);
    setAiPrompt(settings.aiPrompt);
    setAiRefinePrompt(settings.aiRefinePrompt);
    setDailyGoal(settings.dailyGoal ?? 20);
  }, [settings.language, settings.aiPrompt, settings.aiRefinePrompt]);

  // Load current gemini model from DB
  useEffect(() => {
    fetch("/api/app-settings?key=gemini_model")
      .then((r) => r.json() as Promise<{ value: string | null }>)
      .then(({ value }) => { if (value) setGeminiModel(value); })
      .catch(() => {});
  }, []);

  async function fetchModelList() {
    setFetchingModels(true);
    setModelListError(null);
    try {
      const res = await fetch("/api/ai/models");
      const data = await res.json() as { models?: string[]; error?: string };
      if (data.error) throw new Error(data.error);
      setModelList(data.models ?? []);
    } catch (e) {
      setModelListError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetchingModels(false);
    }
  }

  async function handleSave() {
    updateSettings({ language, aiPrompt, aiRefinePrompt, dailyGoal });
    if (geminiModel) {
      await fetch("/api/app-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "gemini_model", value: geminiModel }),
      }).catch(() => {});
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
      <PageHeader back={{ href: returnTo }} title={t("settings")} hideSettingsIcon />
      <main className="flex-1 px-4 sm:px-8 py-8 max-w-xl mx-auto w-full space-y-8">

        {/* Language */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            {t("languageLabel")}
          </h2>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.value}
                onClick={() => setLanguage(lang.value)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">{lang.native}</span>
                  <span className="ml-2 text-xs text-gray-400">{lang.label}</span>
                </div>
                {language === lang.value && (
                  <Check size={15} className="text-blue-500 shrink-0" strokeWidth={2.5} />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* AI Explain Prompt */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Sparkles size={11} className="text-violet-400" />
            {t("aiPrompt")}
          </h2>
          <p className="text-xs text-gray-400 mb-3">{t("aiPromptPlaceholder")}</p>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={3}
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent resize-none"
            placeholder={t("aiPromptPlaceholder")}
          />
        </section>

        {/* AI Refine Prompt */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Wand2 size={11} className="text-amber-400" />
            {t("aiRefinePrompt")}
          </h2>
          <p className="text-xs text-gray-400 mb-3">{t("aiRefinePromptPlaceholder")}</p>
          <textarea
            value={aiRefinePrompt}
            onChange={(e) => setAiRefinePrompt(e.target.value)}
            rows={3}
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none"
            placeholder={t("aiRefinePromptPlaceholder")}
          />
        </section>

        {/* AI Model */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <BrainCircuit size={11} className="text-blue-400" />
            AI Model
          </h2>
          <p className="text-xs text-gray-400 mb-3">Gemini model used for Explain and Refine</p>
          <div className="flex gap-2 items-center">
            <input
              list="gemini-model-list"
              value={geminiModel}
              onChange={(e) => setGeminiModel(e.target.value)}
              onFocus={() => { modelBeforeFocus.current = geminiModel; setGeminiModel(""); }}
              onBlur={() => { if (!geminiModel) setGeminiModel(modelBeforeFocus.current); }}
              className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              placeholder="gemini-2.5-flash"
            />
            <button
              type="button"
              onClick={fetchModelList}
              disabled={fetchingModels}
              className="shrink-0 flex items-center gap-1.5 px-3 py-3 rounded-2xl border border-gray-200 bg-white text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={13} className={fetchingModels ? "animate-spin" : ""} />
              {fetchingModels ? "Loading..." : "Fetch models"}
            </button>
          </div>
          {modelListError && (
            <p className="mt-1.5 text-xs text-red-500">{modelListError}</p>
          )}
          {modelList.length > 0 && (
            <datalist id="gemini-model-list">
              {modelList.map((m) => <option key={m} value={m} />)}
            </datalist>
          )}
        </section>

        {/* Daily Goal */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Target size={11} className="text-emerald-500" />
            Daily Goal
          </h2>
          <p className="text-xs text-gray-400 mb-3">Number of questions to complete each day</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDailyGoal((v) => Math.max(5, v - 5))}
              className="w-10 h-10 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-lg font-medium transition-colors"
            >
              −
            </button>
            <input
              type="number"
              min={5}
              max={200}
              step={5}
              value={dailyGoal}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 5 && v <= 200) setDailyGoal(v);
              }}
              className="w-20 text-center rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setDailyGoal((v) => Math.min(200, v + 5))}
              className="w-10 h-10 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-lg font-medium transition-colors"
            >
              ＋
            </button>
            <span className="text-xs text-gray-400 ml-1">questions / day</span>
          </div>
        </section>

        {/* Save */}
        <button
          onClick={handleSave}
          className={`w-full py-3 rounded-2xl text-sm font-semibold transition-all ${
            saved
              ? "bg-emerald-500 text-white"
              : "bg-gray-900 text-white hover:bg-gray-700"
          }`}
        >
          {saved ? (
            <span className="flex items-center justify-center gap-2">
              <Check size={15} strokeWidth={2.5} />
              {t("saved")}
            </span>
          ) : (
            t("save")
          )}
        </button>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsInner />
    </Suspense>
  );
}
