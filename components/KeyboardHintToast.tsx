"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "quiz-keyboard-hint-shown";

export default function KeyboardHintToast() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dismiss() {
    if (timerRef.current) clearTimeout(timerRef.current);
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
  }

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    setVisible(true);
    timerRef.current = setTimeout(dismiss, 8000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visible) return;
    const handler = () => dismiss();
    window.addEventListener("keydown", handler, { once: true });
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-4 z-30 w-52 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden toast-slide-in-left">
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-600">Keyboard Shortcuts</span>
        <button
          onClick={dismiss}
          className="text-gray-300 hover:text-gray-500 transition-colors"
          aria-label="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
      <div className="px-3 py-2.5">
        <table className="w-full">
          <tbody className="text-xs">
            {([
              ["1–9", "Choose answer"],
              ["Enter", "Submit / Next"],
              ["N", "Next question"],
              ["← →", "Navigate"],
            ] as const).map(([key, label]) => (
              <tr key={key}>
                <td className="py-0.5 pr-2">
                  <kbd className="inline-block bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 font-mono text-[10px] text-gray-600 whitespace-nowrap">
                    {key}
                  </kbd>
                </td>
                <td className="py-0.5 text-gray-500">{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-gray-300 text-center mt-2">Dismisses on first key press</p>
      </div>
    </div>
  );
}
