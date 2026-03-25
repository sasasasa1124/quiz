"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Home, Brain, BookOpen, BookOpenCheck, ClipboardList,
  Layers, AlertCircle, History, Copy, Globe, Volume2, VolumeOff,
  Loader2, Settings, Zap, RotateCcw, SlidersHorizontal,
} from "lucide-react";
import { LANG_OPTIONS } from "@/lib/i18n";
import { useSettings } from "@/lib/settings-context";
import { useAudio } from "@/hooks/useAudio";
import FilterPanel from "./FilterPanel";
import type { FilterConfig, RichQuizStats, Question } from "@/lib/types";

interface QuizHeaderProps {
  examId: string;
  examName: string;
  mode: "quiz" | "review" | "answers" | "mock";
  activeCategory?: string | null;

  // Navigation callbacks — provide to run side-effects (e.g. session save) before navigating
  onBack?: () => void;   // Back arrow → /exam/{examId}
  onHome?: () => void;   // Home icon → /  (only shown when onBack is provided)
  // Custom settings link (default: /settings)
  settingsHref?: string;

  // Stats (optional — rendered when provided)
  totalCorrect?: number;
  totalQuestions?: number;
  overallRate?: number | null;
  streak?: number;

  // Filter buttons (optional — rendered when onFilterChange is provided)
  filter?: "all" | "continue" | "wrong" | "custom";
  onFilterChange?: (f: "all" | "continue" | "wrong" | "custom") => void;
  wrongCount?: number;
  hasContinue?: boolean;
  continueDisplayNum?: number | null;
  duplicateCount?: number;
  excludeDuplicates?: boolean;
  onToggleDuplicates?: () => void;

  // Custom filter
  filterConfig?: FilterConfig;
  onFilterConfigChange?: (c: FilterConfig) => void;
  allQuestions?: Question[];
  richStats?: RichQuizStats;
  customFilterCount?: number;

  // Audio replay
  onReplay?: () => void;
  audioPlaying?: boolean;

  // Custom right slot (e.g. timer for Mock)
  rightExtra?: React.ReactNode;
}

const MODE_ICONS = {
  quiz: Brain,
  review: BookOpen,
  answers: BookOpenCheck,
  mock: ClipboardList,
} as const;

export default function QuizHeader({
  examId,
  examName,
  mode,
  activeCategory,
  onBack,
  onHome,
  settingsHref,
  totalCorrect,
  totalQuestions,
  overallRate,
  streak,
  filter,
  onFilterChange,
  wrongCount = 0,
  hasContinue,
  continueDisplayNum,
  duplicateCount = 0,
  excludeDuplicates,
  onToggleDuplicates,
  filterConfig,
  onFilterConfigChange,
  allQuestions = [],
  richStats = {},
  customFilterCount,
  onReplay,
  audioPlaying,
  rightExtra,
}: QuizHeaderProps) {
  const { settings, updateSettings, t } = useSettings();
  const { loading: audioLoading } = useAudio();
  const backHref = `/exam/${encodeURIComponent(examId)}`;

  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  const handleLangOutside = useCallback((e: MouseEvent) => {
    if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleLangOutside);
    return () => document.removeEventListener("mousedown", handleLangOutside);
  }, [handleLangOutside]);

  const handleFilterPanelOutside = useCallback((e: MouseEvent) => {
    if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) setFilterPanelOpen(false);
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleFilterPanelOutside);
    return () => document.removeEventListener("mousedown", handleFilterPanelOutside);
  }, [handleFilterPanelOutside]);

  const ModeIcon = MODE_ICONS[mode];
  const showStats = totalCorrect !== undefined && totalQuestions !== undefined;
  const showFilters = !!onFilterChange;

  return (
    <header className="shrink-0 sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 h-14 border-b border-gray-200 bg-canvas">
      {/* Left: back, home, exam info */}
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        {onBack ? (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors shrink-0"
          >
            <ArrowLeft size={14} />
          </button>
        ) : (
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors shrink-0"
          >
            <ArrowLeft size={14} />
          </Link>
        )}

        {/* Home button — only shown when onBack is provided (quiz/review modes) */}
        {onHome && (
          <button
            onClick={onHome}
            className="p-1 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
            title="Home"
          >
            <Home size={13} />
          </button>
        )}

        <div className="flex items-center gap-1.5 text-xs text-gray-400 min-w-0">
          <ModeIcon size={13} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate">{examName}</span>
          {activeCategory && (
            <>
              <span className="text-gray-200 shrink-0">·</span>
              <span className="truncate text-scholion-500 font-medium">{activeCategory}</span>
            </>
          )}
        </div>
      </div>

      {/* Right: stats, streak, filters, extra, language, audio, settings */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Streak badge */}
        {streak !== undefined && streak >= 2 && (
          <div key={streak} className="quiz-streak-badge flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
            <Zap size={11} fill="currentColor" />
            {streak}
          </div>
        )}

        {/* Stats */}
        {showStats && overallRate !== null && overallRate !== undefined && (
          <span className={`text-xs font-semibold tabular-nums hidden sm:inline ${overallRate >= 80 ? "text-emerald-600" : overallRate >= 60 ? "text-amber-500" : "text-rose-500"}`}>
            {totalCorrect}/{totalQuestions}
            <span className="font-normal text-gray-400 ml-1">({overallRate}%)</span>
          </span>
        )}

        {/* Filter buttons */}
        {showFilters && (
          <div className="flex items-center gap-1">
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => onFilterChange("all")}
                className={`flex items-center gap-1 text-xs font-medium px-2 sm:px-2.5 py-1 rounded-md transition-colors ${filter === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Layers size={11} />
                <span className="hidden sm:inline">{t("all")}</span>
                {totalQuestions}
              </button>
              {hasContinue && (
                <button
                  onClick={() => onFilterChange("continue")}
                  className={`flex items-center gap-1 text-xs font-medium px-2 sm:px-2.5 py-1 rounded-md transition-colors ${filter === "continue" ? "bg-white text-scholion-500 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  <History size={11} />
                  <span className="hidden sm:inline">{t("continueFrom")}</span>
                  <span className="hidden sm:inline text-gray-400 ml-0.5">Q{continueDisplayNum}</span>
                </button>
              )}
              <button
                onClick={() => onFilterChange("wrong")}
                disabled={wrongCount === 0}
                className={`flex items-center gap-1 text-xs font-medium px-2 sm:px-2.5 py-1 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${filter === "wrong" ? "bg-white text-rose-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                <AlertCircle size={11} />
                <span className="hidden sm:inline">{t("wrong")}</span>
                {wrongCount}
              </button>
              {duplicateCount > 0 && (
                <button
                  onClick={onToggleDuplicates}
                  className={`flex items-center gap-1 text-xs font-medium px-2 sm:px-2.5 py-1 rounded-md transition-colors ${excludeDuplicates ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  title={excludeDuplicates ? "Include duplicates" : "Exclude duplicates"}
                >
                  <Copy size={11} />
                  <span className="hidden sm:inline">{t("uniq")}</span>
                </button>
              )}
            </div>

            {/* Custom filter button */}
            {onFilterConfigChange && (
              <div ref={filterPanelRef} className="relative">
                <button
                  onClick={() => {
                    onFilterChange("custom");
                    setFilterPanelOpen((o) => !o);
                  }}
                  className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${filter === "custom" ? "bg-white text-scholion-500 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}
                  title="Custom filter"
                >
                  <SlidersHorizontal size={11} />
                  <span className="hidden sm:inline">{t("filter")}</span>
                  {filter === "custom" && customFilterCount !== undefined && (
                    <span className="ml-0.5">{customFilterCount}</span>
                  )}
                </button>
                {filterPanelOpen && filterConfig && (
                  <FilterPanel
                    filterConfig={filterConfig}
                    onApply={(cfg) => {
                      onFilterConfigChange(cfg);
                      setFilterPanelOpen(false);
                    }}
                    questions={allQuestions}
                    richStats={richStats}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Custom right slot (e.g. timer for Mock) */}
        {rightExtra}

        {/* Language selector */}
        <div ref={langRef} className="relative">
          <button
            onClick={() => setLangOpen((o) => !o)}
            className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Language"
          >
            <Globe size={13} />
          </button>
          {langOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-[90px]">
              {LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { updateSettings({ language: opt.value }); setLangOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${settings.language === opt.value ? "font-semibold text-scholion-500" : "text-gray-700"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Audio replay button */}
        {settings.audioMode && onReplay && (
          <button
            onClick={onReplay}
            className="p-1.5 rounded-lg transition-colors text-gray-300 hover:text-sky-500 hover:bg-gray-100"
            title="Replay audio"
          >
            {audioPlaying
              ? <Loader2 size={13} className="animate-spin text-sky-400" />
              : <RotateCcw size={13} />}
          </button>
        )}

        {/* Audio toggle */}
        <button
          onClick={() => updateSettings({ audioMode: !settings.audioMode })}
          className="p-1.5 rounded-lg transition-colors text-gray-300 hover:text-gray-600 hover:bg-gray-100"
          title={settings.audioMode ? "Audio on (click to turn off)" : "Audio off (click to turn on)"}
        >
          {settings.audioMode && audioLoading
            ? <Loader2 size={13} className="animate-spin text-sky-400" />
            : settings.audioMode
            ? <Volume2 size={13} className="text-sky-500" />
            : <VolumeOff size={13} />}
        </button>

        {/* Settings */}
        <Link
          href={settingsHref ?? "/settings"}
          className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="Settings"
        >
          <Settings size={13} />
        </Link>
      </div>
    </header>
  );
}
