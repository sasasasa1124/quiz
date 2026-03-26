"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Sparkles, Wand2, ShieldCheck, BrainCircuit, RefreshCw, Target, Volume2, Zap, BookOpen, ChevronDown, RotateCcw, User, Plus, X, Save, FileUp } from "lucide-react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useSettings } from "@/lib/settings-context";
import { useSetHeader } from "@/lib/header-context";
import type { PromptVersion } from "@/lib/types";
import { DEFAULT_EXPLAIN_PROMPT, DEFAULT_REFINE_PROMPT, DEFAULT_STUDY_GUIDE_PROMPT, DEFAULT_FILL_PROMPT, DEFAULT_FACTCHECK_PROMPT } from "@/lib/types";

type PromptKey = "explain" | "refine" | "studyguide" | "fill" | "factcheck";

interface PromptConfig {
  key: PromptKey;
  label: string;
  icon: React.ReactNode;
  accentClass: string;
  ringClass: string;
  defaultPrompt: string;
  defaultLabel: string;
}

function VersionSelector({
  versions,
  currentPrompt,
  defaultPrompt,
  onSelect,
}: {
  versions: PromptVersion[];
  currentPrompt: string;
  defaultPrompt: string;
  onSelect: (v: PromptVersion | null) => void;
}) {
  const allOptions = [
    { name: "default", author: "", prompt: defaultPrompt },
    ...versions,
  ];

  // Find the currently selected version name (trim to tolerate DB whitespace normalization)
  const selectedName = allOptions.find((v) => v.prompt.trim() === currentPrompt.trim())?.name ?? "custom";

  return (
    <select
      value={selectedName}
      onChange={(e) => {
        const found = allOptions.find((v) => v.name === e.target.value) ?? null;
        onSelect(found);
      }}
      className="flex-1 h-8 px-2 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
    >
      <option value="default">default</option>
      {versions.map((v) => (
        <option key={v.name} value={v.name}>{v.name}{v.author ? ` — ${v.author}` : ""}</option>
      ))}
      {selectedName === "custom" && <option value="custom">(unsaved)</option>}
    </select>
  );
}

function PromptSection({
  config,
  prompt,
  setPrompt,
  author,
  setAuthor,
  versions,
  setVersions,
}: {
  config: PromptConfig;
  prompt: string;
  setPrompt: (v: string) => void;
  author: string;
  setAuthor: (v: string) => void;
  versions: PromptVersion[];
  setVersions: (v: PromptVersion[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [activeVersionName, setActiveVersionName] = useState<string | null>(null);

  function handleSelectVersion(v: PromptVersion | null) {
    if (!v) return;
    setPrompt(v.prompt);
    setAuthor(v.author);
    setShowSaveInput(false);
    setActiveVersionName(v.name !== "default" ? v.name : null);
  }

  function handleSaveVersion() {
    const name = saveName.trim();
    if (!name) return;
    const newVersion: PromptVersion = { name, author, prompt };
    const existing = versions.findIndex((v) => v.name === name);
    if (existing >= 0) {
      const updated = [...versions];
      updated[existing] = newVersion;
      setVersions(updated);
    } else {
      setVersions([...versions, newVersion]);
    }
    setSaveName("");
    setShowSaveInput(false);
    setActiveVersionName(name);
  }

  function handleUpdateVersion() {
    if (!activeVersionName) return;
    const newVersion: PromptVersion = { name: activeVersionName, author, prompt };
    setVersions(versions.map((v) => v.name === activeVersionName ? newVersion : v));
  }

  function handleDeleteVersion(name: string) {
    setVersions(versions.filter((v) => v.name !== name));
    if (activeVersionName === name) setActiveVersionName(null);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
          {config.icon}
          {config.label}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Version selector row */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 shrink-0">Version</span>
            <VersionSelector
              versions={versions}
              currentPrompt={prompt}
              defaultPrompt={config.defaultPrompt}
              onSelect={handleSelectVersion}
            />
            <button
              type="button"
              onClick={() => {
                setPrompt(config.defaultPrompt);
                setAuthor("");
                setShowSaveInput(false);
                setActiveVersionName(null);
              }}
              title="Reset to default"
              className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <RotateCcw size={12} />
            </button>
          </div>

          {/* Author field */}
          <div className="flex items-center gap-2">
            <User size={11} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author"
              className="flex-1 h-8 px-2 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
          </div>

          {/* Prompt textarea */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            className={`w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 ${config.ringClass} focus:border-transparent resize-y font-mono`}
          />

          {/* Save version */}
          {showSaveInput ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveVersion(); if (e.key === "Escape") setShowSaveInput(false); }}
                placeholder="Version name..."
                autoFocus
                className="flex-1 h-8 px-2 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
              <button
                type="button"
                onClick={handleSaveVersion}
                disabled={!saveName.trim()}
                className="shrink-0 h-8 px-3 rounded-lg bg-gray-900 text-white text-xs font-semibold disabled:opacity-40 hover:bg-gray-700 transition-colors"
              >
                Save
              </button>
              <button type="button" onClick={() => setShowSaveInput(false)} className="shrink-0 p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {activeVersionName && (
                <button
                  type="button"
                  onClick={handleUpdateVersion}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
                >
                  <Save size={11} />
                  Update &ldquo;{activeVersionName}&rdquo;
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSaveInput(true)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Plus size={11} />
                Save as named version
              </button>
            </div>
          )}

          {/* Saved versions list */}
          {versions.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Saved versions</p>
              {versions.map((v) => (
                <div key={v.name} className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-gray-50">
                  <button
                    type="button"
                    onClick={() => handleSelectVersion(v)}
                    className="flex-1 text-left"
                  >
                    <span className="text-xs font-medium text-gray-700">{v.name}</span>
                    {v.author && <span className="text-xs text-gray-400 ml-1.5">— {v.author}</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteVersion(v.name)}
                    className="shrink-0 p-1 text-gray-300 hover:text-rose-400 transition-colors"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsInner() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("returnTo") ?? "/";
  const returnTo = raw.startsWith("/") ? raw : "/";

  const { user } = useUser();
  const { settings, updateSettings, t } = useSettings();
  const userDisplayName = user?.primaryEmailAddress?.emailAddress ?? user?.username ?? "";
  useSetHeader({ back: { href: returnTo }, title: t("settings"), hideSettingsIcon: true }, [returnTo]);
  const [aiPrompt, setAiPrompt] = useState(settings.aiPrompt);
  const [aiPromptAuthor, setAiPromptAuthor] = useState(settings.aiPromptAuthor ?? "");
  const [aiPromptVersions, setAiPromptVersions] = useState<PromptVersion[]>(settings.aiPromptVersions ?? []);
  const [aiRefinePrompt, setAiRefinePrompt] = useState(settings.aiRefinePrompt);
  const [aiRefinePromptAuthor, setAiRefinePromptAuthor] = useState(settings.aiRefinePromptAuthor ?? "");
  const [aiRefinePromptVersions, setAiRefinePromptVersions] = useState<PromptVersion[]>(settings.aiRefinePromptVersions ?? []);
  const [studyGuidePrompt, setStudyGuidePrompt] = useState(settings.studyGuidePrompt);
  const [studyGuidePromptAuthor, setStudyGuidePromptAuthor] = useState(settings.studyGuidePromptAuthor ?? "");
  const [studyGuidePromptVersions, setStudyGuidePromptVersions] = useState<PromptVersion[]>(settings.studyGuidePromptVersions ?? []);
  const [aiFillPrompt, setAiFillPrompt] = useState(settings.aiFillPrompt);
  const [aiFillPromptAuthor, setAiFillPromptAuthor] = useState(settings.aiFillPromptAuthor ?? "");
  const [aiFillPromptVersions, setAiFillPromptVersions] = useState<PromptVersion[]>(settings.aiFillPromptVersions ?? []);
  const [aiFactCheckPrompt, setAiFactCheckPrompt] = useState(settings.aiFactCheckPrompt ?? DEFAULT_FACTCHECK_PROMPT);
  const [aiFactCheckPromptAuthor, setAiFactCheckPromptAuthor] = useState(settings.aiFactCheckPromptAuthor ?? "");
  const [aiFactCheckPromptVersions, setAiFactCheckPromptVersions] = useState<PromptVersion[]>(settings.aiFactCheckPromptVersions ?? []);
  const [dailyGoal, setDailyGoal] = useState(settings.dailyGoal ?? 100);
  const [audioMode, setAudioMode] = useState(settings.audioMode ?? false);
  const [audioSpeed, setAudioSpeed] = useState(settings.audioSpeed ?? 1.0);
  const [audioPrefetch, setAudioPrefetch] = useState(settings.audioPrefetch ?? 0);
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
    setAiPromptAuthor(settings.aiPromptAuthor || userDisplayName);
    setAiPromptVersions(settings.aiPromptVersions ?? []);
    setAiRefinePrompt(settings.aiRefinePrompt);
    setAiRefinePromptAuthor(settings.aiRefinePromptAuthor || userDisplayName);
    setAiRefinePromptVersions(settings.aiRefinePromptVersions ?? []);
    setStudyGuidePrompt(settings.studyGuidePrompt);
    setStudyGuidePromptAuthor(settings.studyGuidePromptAuthor || userDisplayName);
    setStudyGuidePromptVersions(settings.studyGuidePromptVersions ?? []);
    setAiFillPrompt(settings.aiFillPrompt);
    setAiFillPromptAuthor(settings.aiFillPromptAuthor || userDisplayName);
    setAiFillPromptVersions(settings.aiFillPromptVersions ?? []);
    setAiFactCheckPrompt(settings.aiFactCheckPrompt ?? DEFAULT_FACTCHECK_PROMPT);
    setAiFactCheckPromptAuthor(settings.aiFactCheckPromptAuthor || userDisplayName);
    setAiFactCheckPromptVersions(settings.aiFactCheckPromptVersions ?? []);
    setDailyGoal(settings.dailyGoal ?? 100);
    setAudioMode(settings.audioMode ?? false);
    setAudioSpeed(settings.audioSpeed ?? 1.0);
    setAudioPrefetch(settings.audioPrefetch ?? 0);
    setSkipRevealOnCorrect(settings.skipRevealOnCorrect ?? false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.aiPrompt, settings.aiRefinePrompt, settings.studyGuidePrompt, settings.aiFactCheckPrompt, settings.audioMode, settings.audioSpeed, settings.audioPrefetch, settings.skipRevealOnCorrect, userDisplayName]);

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
    updateSettings({
      aiPrompt, aiPromptAuthor, aiPromptVersions,
      aiRefinePrompt, aiRefinePromptAuthor, aiRefinePromptVersions,
      studyGuidePrompt, studyGuidePromptAuthor, studyGuidePromptVersions,
      aiFillPrompt, aiFillPromptAuthor, aiFillPromptVersions,
      aiFactCheckPrompt, aiFactCheckPromptAuthor, aiFactCheckPromptVersions,
      dailyGoal, audioMode, audioSpeed, audioPrefetch, skipRevealOnCorrect,
    });
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

  const promptConfigs: PromptConfig[] = [
    {
      key: "explain",
      label: t("aiPrompt"),
      icon: <Sparkles size={13} className="text-violet-400" />,
      accentClass: "text-violet-400",
      ringClass: "focus:ring-violet-400",
      defaultPrompt: DEFAULT_EXPLAIN_PROMPT,
      defaultLabel: "default",
    },
    {
      key: "refine",
      label: t("aiRefinePrompt"),
      icon: <Wand2 size={13} className="text-amber-400" />,
      accentClass: "text-amber-400",
      ringClass: "focus:ring-amber-400",
      defaultPrompt: DEFAULT_REFINE_PROMPT,
      defaultLabel: "default",
    },
    {
      key: "studyguide",
      label: "Study Guide Prompt",
      icon: <BookOpen size={13} className="text-emerald-500" />,
      accentClass: "text-emerald-500",
      ringClass: "focus:ring-emerald-400",
      defaultPrompt: DEFAULT_STUDY_GUIDE_PROMPT,
      defaultLabel: "default",
    },
    {
      key: "fill",
      label: "AI Fill Prompt",
      icon: <Sparkles size={13} className="text-sky-400" />,
      accentClass: "text-sky-400",
      ringClass: "focus:ring-sky-400",
      defaultPrompt: DEFAULT_FILL_PROMPT,
      defaultLabel: "default",
    },
    {
      key: "factcheck",
      label: t("aiFactCheckPrompt"),
      icon: <ShieldCheck size={13} className="text-indigo-400" />,
      accentClass: "text-indigo-400",
      ringClass: "focus:ring-indigo-400",
      defaultPrompt: DEFAULT_FACTCHECK_PROMPT,
      defaultLabel: "default",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col pt-14">
      <main className="flex-1 px-4 sm:px-8 py-8 max-w-xl mx-auto w-full space-y-8">

        {/* Prompts (accordion) */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Prompts</h2>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
            <PromptSection
              config={promptConfigs[0]}
              prompt={aiPrompt}
              setPrompt={setAiPrompt}
              author={aiPromptAuthor}
              setAuthor={setAiPromptAuthor}
              versions={aiPromptVersions}
              setVersions={setAiPromptVersions}
            />
            <PromptSection
              config={promptConfigs[1]}
              prompt={aiRefinePrompt}
              setPrompt={setAiRefinePrompt}
              author={aiRefinePromptAuthor}
              setAuthor={setAiRefinePromptAuthor}
              versions={aiRefinePromptVersions}
              setVersions={setAiRefinePromptVersions}
            />
            <PromptSection
              config={promptConfigs[2]}
              prompt={studyGuidePrompt}
              setPrompt={setStudyGuidePrompt}
              author={studyGuidePromptAuthor}
              setAuthor={setStudyGuidePromptAuthor}
              versions={studyGuidePromptVersions}
              setVersions={setStudyGuidePromptVersions}
            />
            <PromptSection
              config={promptConfigs[3]}
              prompt={aiFillPrompt}
              setPrompt={setAiFillPrompt}
              author={aiFillPromptAuthor}
              setAuthor={setAiFillPromptAuthor}
              versions={aiFillPromptVersions}
              setVersions={setAiFillPromptVersions}
            />
            <PromptSection
              config={promptConfigs[4]}
              prompt={aiFactCheckPrompt}
              setPrompt={setAiFactCheckPrompt}
              author={aiFactCheckPromptAuthor}
              setAuthor={setAiFactCheckPromptAuthor}
              versions={aiFactCheckPromptVersions}
              setVersions={setAiFactCheckPromptVersions}
            />
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
              max={500}
              step={5}
              value={dailyGoal}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 5 && v <= 500) setDailyGoal(v);
              }}
              className="w-20 text-center rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setDailyGoal((v) => Math.min(500, v + 5))}
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
            {/* Pre-load audio slider */}
            <div className="px-4 py-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">Pre-load audio</span>
                <span className="text-sm font-semibold text-gray-700 tabular-nums">{audioPrefetch === 0 ? "off" : `k=${audioPrefetch}`}</span>
              </div>
              <p className="text-xs text-gray-400 mb-2">Chunks to pre-fetch ahead while playing (0 = off)</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 shrink-0">0</span>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={audioPrefetch}
                  onChange={(e) => setAudioPrefetch(Number(e.target.value))}
                  className="quiz-slider flex-1"
                  style={{ "--fill": `${(audioPrefetch / 10) * 100}%` } as React.CSSProperties}
                />
                <span className="text-xs text-gray-400 shrink-0">10</span>
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

        {/* Import Exam */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <FileUp size={11} className="text-gray-400" />
            Admin Tools
          </h2>
          <Link
            href="/admin/import"
            className="flex items-center gap-2 h-10 px-4 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors w-full"
          >
            <FileUp size={14} />
            Import Exam from File (agentic)
          </Link>
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
