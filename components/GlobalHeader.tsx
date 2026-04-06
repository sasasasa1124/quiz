"use client";

import { useHeaderConfig } from "@/lib/header-context";
import { useSettings } from "@/lib/settings-context";
import { LANG_OPTIONS } from "@/lib/i18n";
import PageHeader from "./PageHeader";

function LangSelector() {
  const { settings, updateSettings } = useSettings();
  return (
    <div className="flex items-center gap-0.5">
      {LANG_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => updateSettings({ language: opt.value })}
          className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
            settings.language === opt.value
              ? "bg-gray-900 text-white"
              : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function GlobalHeader() {
  const { config } = useHeaderConfig();
  if (config.hidden) return null;
  return (
    <PageHeader
      back={config.back}
      title={config.title}
      right={
        config.right ?? <LangSelector />
      }
      hideSettingsIcon={config.hideSettingsIcon}
    />
  );
}
