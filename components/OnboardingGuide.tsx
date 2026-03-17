"use client";

import { useState, useEffect } from "react";
import { X, Upload, BookOpen, Settings } from "lucide-react";
import { useSettings } from "@/lib/settings-context";

const STORAGE_KEY = "onboarding-done";

const STEP_ICONS = [Upload, BookOpen, Settings];

export default function OnboardingGuide() {
  const { t } = useSettings();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      // ignore
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  function next() {
    if (step < 2) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  }

  if (!visible) return null;

  const steps = [
    { title: t("onboardingStep1Title"), desc: t("onboardingStep1Desc") },
    { title: t("onboardingStep2Title"), desc: t("onboardingStep2Desc") },
    { title: t("onboardingStep3Title"), desc: t("onboardingStep3Desc") },
  ];

  const Icon = STEP_ICONS[step];
  const isLast = step === 2;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center pb-8 px-4 pointer-events-none">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 pointer-events-auto"
        onClick={dismiss}
      />

      {/* Bubble */}
      <div className="relative pointer-events-auto w-full max-w-sm">
        {/* Tail pointing down */}
        <div className="absolute bottom-[-8px] left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45 border-b border-r border-gray-200 shadow-sm" />

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {t("onboardingTitle")}
            </p>
            <button
              onClick={dismiss}
              className="text-gray-300 hover:text-gray-500 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Step content */}
          <div className="flex gap-3 items-start mb-5">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Icon size={16} className="text-blue-500" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800 mb-1">
                {steps[step].title}
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                {steps[step].desc}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between">
            {/* Dots */}
            <div className="flex gap-1.5">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === step ? "bg-blue-500" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={next}
              className={`text-xs font-semibold px-4 py-2 rounded-lg transition-colors ${
                isLast
                  ? "bg-blue-500 text-white hover:bg-blue-600"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {isLast ? t("onboardingDone") : t("onboardingNext")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
