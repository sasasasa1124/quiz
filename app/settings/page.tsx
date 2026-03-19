"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Sparkles, Wand2, BrainCircuit, RefreshCw, Target, Volume2, Zap, BookOpen, ChevronDown } from "lucide-react";
import { useSettings } from "@/lib/settings-context";
import PageHeader from "@/components/PageHeader";

function SettingsInner() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("returnTo") ?? "/";
  const returnTo = raw.startsWith("/") ? raw : "/";

  const { settings, updateSettings, t } = useSettings();
  const [aiPrompt, setAiPrompt] = useState(settings.aiPrompt);
  const [aiRefinePrompt, setAiRefinePrompt] = useState(settings.aiRefinePrompt);
  const [studyGuidePrompt, setStudyGuidePrompt] = useState(settings.studyGuidePrompt);
  const [openPrompt, setOpenPrompt] = useState<string | null>(null);
  const [dailyGoal, setDailyGoal] = useState(settings.dailyGoal ?? 20);
  const [audioMode, setAudioMode] = useState(settings.audioMode ?? false);
  const [audioSpeed, setAudioSpeed] = useState(settings.audioSpeed ?? 1.0);
  const [audioPrefetch, setAudioPrefetch] = useState(settings.audioPrefetch ?? 3);
  const [skipRevealOnCorrect, setSkipRevealOnCorrect] = useState(settings.skipRevealOnCorrect ?? false);
  const [saved, setSaved] = useState(false);
  const [geminiModel, setGeminiModel] = useState("");
  const [ttsModel, setTtsModel] = useState("");
  const [modelList, setModelList] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelListError, setModelListError] = useState<string | null>(null);
  const modelBeforeFocus = useRef<string>("");
  const ttsModelBeforeFocus = useRef<string>("");

  // Sync local state when settings load from localStorage
  useEffect(() => {
    setAiPrompt(settings.aiPrompt);
    setAiRefinePrompt(settings.aiRefinePrompt);
    setStudyGuidePrompt(settings.studyGuidePrompt);
    setDailyGoal(settings.dailyGoal ?? 20);
    setAudioMode(settings.audioMode ?? false);
    setAudioSpeed(settings.audioSpeed ?? 1.0);
    setAudioPrefetch(settings.audioPrefetch ?? 0);
    setSkipRevealOnCorrect(settings.skipRevealOnCorrect ?? false);
  }, [settings.aiPrompt, settings.aiRefinePrompt, settings.studyGuidePrompt, settings.audioMode, settings.audioSpeed, settings.audioPrefetch, settings.skipRevealOnCorrect]);

  // Load current gemini model and tts model from DB
  useEffect(() => {
    fetch("/api/app-settings?key=gemini_model")
      .then((r) => r.json() as Promise<{ value: string | null }>)
      .then(({ value }) => { if (value) setGeminiModel(value); })
      .catch(() => {});
    fetch("/api/app-settings?key=tts_model")
      .then((r) => r.json() as Promise<{ value: string | null }>)
      .then(({ value }) => { if (value) setTtsModel(value); })
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
    updateSettings({ aiPrompt, aiRefinePrompt, studyGuidePrompt, dailyGoal, audioMode, audioSpeed, audioPrefetch, skipRevealOnCorrect });
    const saves: Promise<unknown>[] = [];
    if (geminiModel) {
      saves.push(
        fetch("/api/app-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "gemini_model", value: geminiModel }),
        }).catch(() => {}),
      );
    }
    if (ttsModel) {
      saves.push(
        fetch("/api/app-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "tts_model", value: ttsModel }),
        }).catch(() => {}),
      );
    }
    await Promise.all(saves);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
      <PageHeader back={{ href: returnTo }} title={t("settings")} hideSettingsIcon />
      <main className="flex-1 px-4 sm:px-8 py-8 max-w-xl mx-auto w-full space-y-8">

        {/* Prompts (accordion) */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Prompts</h2>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
            {/* AI Explain Prompt */}
            <div>
              <button
                type="button"
                onClick={() => setOpenPrompt((v) => v === "explain" ? null : "explain")}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Sparkles size={13} className="text-violet-400" />
                  {t("aiPrompt")}
                </span>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${openPrompt === "explain" ? "rotate-180" : ""}`} />
              </button>
              {openPrompt === "explain" && (
                <div className="px-4 pb-4">
                  <p className="text-xs text-gray-400 mb-2">{t("aiPromptPlaceholder")}</p>
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    rows={6}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent resize-y font-mono"
                    placeholder={t("aiPromptPlaceholder")}
                  />
                </div>
              )}
            </div>

            {/* AI Refine Prompt */}
            <div>
              <button
                type="button"
                onClick={() => setOpenPrompt((v) => v === "refine" ? null : "refine")}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Wand2 size={13} className="text-amber-400" />
                  {t("aiRefinePrompt")}
                </span>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${openPrompt === "refine" ? "rotate-180" : ""}`} />
              </button>
              {openPrompt === "refine" && (
                <div className="px-4 pb-4">
                  <p className="text-xs text-gray-400 mb-2">{t("aiRefinePromptPlaceholder")}</p>
                  <textarea
                    value={aiRefinePrompt}
                    onChange={(e) => setAiRefinePrompt(e.target.value)}
                    rows={6}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-y font-mono"
                    placeholder={t("aiRefinePromptPlaceholder")}
                  />
                </div>
              )}
            </div>

            {/* Study Guide Prompt */}
            <div>
              <button
                type="button"
                onClick={() => setOpenPrompt((v) => v === "studyguide" ? null : "studyguide")}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <BookOpen size={13} className="text-emerald-500" />
                  Study Guide Prompt
                </span>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${openPrompt === "studyguide" ? "rotate-180" : ""}`} />
              </button>
              {openPrompt === "studyguide" && (
                <div className="px-4 pb-4">
                  <p className="text-xs text-gray-400 mb-2">System instruction for Study Guide generation. Use {"{examName}"} as a placeholder.</p>
                  <textarea
                    value={studyGuidePrompt}
                    onChange={(e) => setStudyGuidePrompt(e.target.value)}
                    rows={6}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent resize-y font-mono"
                    placeholder="You are an expert on the &quot;{examName}&quot; certification exam..."
                  />
                </div>
              )}
            </div>
          </div>
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

        {/* Audio Mode */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Volume2 size={11} className="text-sky-400" />
            Audio Mode
          </h2>
          <p className="text-xs text-gray-400 mb-3">Toggle audio on/off from the header in Review or Answers mode. Configure speed and model here.</p>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
            {/* Speed slider */}
            <div className="px-4 py-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">Speed</span>
                <span className="text-sm font-semibold text-gray-700 tabular-nums w-10 text-right">{audioSpeed}x</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 shrink-0">0.5x</span>
                <input
                  type="range"
                  min={0.5}
                  max={4.0}
                  step={0.25}
                  value={audioSpeed}
                  onChange={(e) => setAudioSpeed(Number(e.target.value))}
                  className="quiz-slider flex-1"
                  style={{ "--fill": `${((audioSpeed - 0.5) / 3.5) * 100}%` } as React.CSSProperties}
                />
                <span className="text-xs text-gray-400 shrink-0">4x</span>
              </div>
            </div>
            {/* TTS Model */}
            <div className="px-4 py-3.5">
              <p className="text-xs text-gray-400 mb-2">TTS Model</p>
              <input
                list="tts-model-list"
                value={ttsModel}
                onChange={(e) => setTtsModel(e.target.value)}
                onFocus={() => { ttsModelBeforeFocus.current = ttsModel; setTtsModel(""); }}
                onBlur={() => { if (!ttsModel) setTtsModel(ttsModelBeforeFocus.current); }}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
                placeholder="gemini-2.5-flash-preview-tts"
              />
              <datalist id="tts-model-list">
                <option value="gemini-2.5-flash-preview-tts" />
                <option value="gemini-2.5-pro-preview-tts" />
              </datalist>
            </div>
            {/* Pre-load audio (audioPrefetch) */}
            <div className="px-4 py-3.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900">Pre-load audio</span>
                <span className="text-sm font-semibold text-gray-700 tabular-nums">{audioPrefetch === 0 ? "off" : `k=${audioPrefetch}`}</span>
              </div>
              <p className="text-xs text-gray-400 mb-2">Chunks to pre-fetch ahead while playing (0 = off)</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAudioPrefetch((v) => Math.max(0, v - 1))}
                  className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
                >
                  −
                </button>
                <span className="text-sm font-semibold text-gray-700 w-4 text-center tabular-nums">{audioPrefetch}</span>
                <button
                  type="button"
                  onClick={() => setAudioPrefetch((v) => Math.min(10, v + 1))}
                  className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
                >
                  ＋
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Skip on Correct */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Zap size={11} className="text-amber-400" />
            Skip on Correct
          </h2>
          <p className="text-xs text-gray-400 mb-3">Automatically advance to the next question when correct, without showing the answer</p>
          <button
            type="button"
            onClick={() => setSkipRevealOnCorrect((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${skipRevealOnCorrect ? "bg-gray-900" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${skipRevealOnCorrect ? "translate-x-6" : "translate-x-1"}`} />
          </button>
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
