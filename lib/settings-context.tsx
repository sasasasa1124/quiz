"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { UserSettings } from "./types";
import { DEFAULT_USER_SETTINGS, DEFAULT_FACTCHECK_PROMPT } from "./types";
import { t as translate, type TranslationKey } from "./i18n";

const STORAGE_KEY = "user-settings";

/**
 * If `stored` has the same opening line as `current` but different content,
 * it is an old version of the same default prompt → upgrade to `current`.
 * This prevents "(unsaved)" showing after default prompts are updated in code.
 */
function upgradeIfOldDefault(stored: string, current: string): string {
  const s = stored.trim();
  const c = current.trim();
  if (!s || s === c) return stored;
  const sameFirstLine = s.split("\n")[0] === c.split("\n")[0];
  return sameFirstLine ? current : stored;
}

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
        // Upgrade any stored prompts that are old versions of the current defaults
        merged.aiPrompt = upgradeIfOldDefault(merged.aiPrompt, DEFAULT_USER_SETTINGS.aiPrompt);
        merged.aiRefinePrompt = upgradeIfOldDefault(merged.aiRefinePrompt, DEFAULT_USER_SETTINGS.aiRefinePrompt);
        merged.studyGuidePrompt = upgradeIfOldDefault(merged.studyGuidePrompt, DEFAULT_USER_SETTINGS.studyGuidePrompt);
        merged.aiFillPrompt = upgradeIfOldDefault(merged.aiFillPrompt, DEFAULT_USER_SETTINGS.aiFillPrompt);
        merged.aiFactCheckPrompt = upgradeIfOldDefault(merged.aiFactCheckPrompt ?? DEFAULT_FACTCHECK_PROMPT, DEFAULT_USER_SETTINGS.aiFactCheckPrompt);
        if (!Array.isArray(merged.aiPromptVersions)) merged.aiPromptVersions = [];
        if (!Array.isArray(merged.aiRefinePromptVersions)) merged.aiRefinePromptVersions = [];
        if (!Array.isArray(merged.studyGuidePromptVersions)) merged.studyGuidePromptVersions = [];
        if (!Array.isArray(merged.aiFillPromptVersions)) merged.aiFillPromptVersions = [];
        if (!Array.isArray(merged.aiFactCheckPromptVersions)) merged.aiFactCheckPromptVersions = [];
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
            // Upgrade any stored prompts that are old versions of the current defaults
            merged.aiPrompt = upgradeIfOldDefault(merged.aiPrompt, DEFAULT_USER_SETTINGS.aiPrompt);
            merged.aiRefinePrompt = upgradeIfOldDefault(merged.aiRefinePrompt, DEFAULT_USER_SETTINGS.aiRefinePrompt);
            merged.studyGuidePrompt = upgradeIfOldDefault(merged.studyGuidePrompt, DEFAULT_USER_SETTINGS.studyGuidePrompt);
            merged.aiFillPrompt = upgradeIfOldDefault(merged.aiFillPrompt, DEFAULT_USER_SETTINGS.aiFillPrompt);
            merged.aiFactCheckPrompt = upgradeIfOldDefault(merged.aiFactCheckPrompt ?? DEFAULT_FACTCHECK_PROMPT, DEFAULT_USER_SETTINGS.aiFactCheckPrompt);
            if (!Array.isArray(merged.aiPromptVersions)) merged.aiPromptVersions = [];
            if (!Array.isArray(merged.aiRefinePromptVersions)) merged.aiRefinePromptVersions = [];
            if (!Array.isArray(merged.studyGuidePromptVersions)) merged.studyGuidePromptVersions = [];
            if (!Array.isArray(merged.aiFillPromptVersions)) merged.aiFillPromptVersions = [];
            if (!Array.isArray(merged.aiFactCheckPromptVersions)) merged.aiFactCheckPromptVersions = [];
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
