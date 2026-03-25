"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { UserSettings } from "./types";
import { DEFAULT_USER_SETTINGS } from "./types";
import { t as translate, type TranslationKey } from "./i18n";

const STORAGE_KEY = "user-settings";

interface SettingsContextValue {
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => void;
  t: (key: TranslationKey) => string;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);

  useEffect(() => {
    // Load from API first; fall back to localStorage
    fetch("/api/user-settings")
      .then((r) => { if (!r.ok) throw new Error("no db"); return r.json() as Promise<{ settings: UserSettings }>; })
      .then(({ settings: remote }) => {
        // Merge defaults, remote wins
        const merged: UserSettings = { ...DEFAULT_USER_SETTINGS, ...remote };
        if (!merged.aiPrompt) merged.aiPrompt = DEFAULT_USER_SETTINGS.aiPrompt;
        if (!merged.aiRefinePrompt) merged.aiRefinePrompt = DEFAULT_USER_SETTINGS.aiRefinePrompt;
        if (!merged.aiFillPrompt) merged.aiFillPrompt = DEFAULT_USER_SETTINGS.aiFillPrompt;
        if (!Array.isArray(merged.aiPromptVersions)) merged.aiPromptVersions = [];
        if (!Array.isArray(merged.aiRefinePromptVersions)) merged.aiRefinePromptVersions = [];
        if (!Array.isArray(merged.studyGuidePromptVersions)) merged.studyGuidePromptVersions = [];
        if (!Array.isArray(merged.aiFillPromptVersions)) merged.aiFillPromptVersions = [];
        setSettings(merged);
        // Sync to localStorage as cache
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
      })
      .catch(() => {
        // API unavailable — fall back to localStorage
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as Partial<UserSettings>;
            const merged = { ...DEFAULT_USER_SETTINGS, ...parsed };
            if (!parsed.aiPrompt) merged.aiPrompt = DEFAULT_USER_SETTINGS.aiPrompt;
            if (!parsed.aiRefinePrompt) merged.aiRefinePrompt = DEFAULT_USER_SETTINGS.aiRefinePrompt;
            if (!parsed.aiFillPrompt) merged.aiFillPrompt = DEFAULT_USER_SETTINGS.aiFillPrompt;
            if (!Array.isArray(merged.aiPromptVersions)) merged.aiPromptVersions = [];
            if (!Array.isArray(merged.aiRefinePromptVersions)) merged.aiRefinePromptVersions = [];
            if (!Array.isArray(merged.studyGuidePromptVersions)) merged.studyGuidePromptVersions = [];
            if (!Array.isArray(merged.aiFillPromptVersions)) merged.aiFillPromptVersions = [];
            setSettings(merged);
          }
        } catch { /* ignore */ }
      });
  }, []);

  function updateSettings(patch: Partial<UserSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      // Fire-and-forget save to server
      fetch("/api/user-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => {});
      return next;
    });
  }

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        t: (key: TranslationKey) => translate(settings.language, key),
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
