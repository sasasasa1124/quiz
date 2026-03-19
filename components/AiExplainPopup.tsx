"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, X, CheckCheck, ExternalLink, Send, MessageSquarePlus } from "lucide-react";
import type { AiExplainResponse } from "@/app/api/ai/explain/route";
import type { AiChatRequest, AiChatResponse } from "@/app/api/ai/chat/route";
import type { Choice } from "@/lib/types";
import { useSettings } from "@/lib/settings-context";

interface Props {
  loading: boolean;
  result: AiExplainResponse | null;
  error: string | null;
  adopting: boolean;
  onAdopt: () => Promise<void>;
  onDismiss: () => void;
  onSuggest: () => Promise<void>;
  suggesting: boolean;
  // context needed for follow-up chat
  question?: string;
  choices?: Choice[];
  answers?: string[];
}

type ChatMessage = { role: "user" | "model"; text: string };

export default function AiExplainPopup({
  loading,
  result,
  error,
  adopting,
  onAdopt,
  onDismiss,
  onSuggest,
  suggesting,
  question = "",
  choices = [],
  answers = [],
}: Props) {
  const { t } = useSettings();
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reset chat when result changes (new explain)
  useEffect(() => {
    setChatHistory([]);
    setChatInput("");
  }, [result]);

  // Scroll to bottom of chat on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // Keyboard: Enter = Adopt, Backspace = Dismiss (only when not typing in chat)
  useEffect(() => {
    if (!result || loading) return;
    const handler = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.target === inputRef.current) return; // don't intercept chat input
      if (e.key === "Enter" && !adopting) { e.preventDefault(); onAdopt(); }
      if (e.key === "Backspace" || e.key === "Escape") { e.preventDefault(); onDismiss(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [result, loading, adopting, onAdopt, onDismiss]);

  async function handleChatSend() {
    if (!chatInput.trim() || chatLoading || !result) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    const newHistory: ChatMessage[] = [...chatHistory, { role: "user", text: userMsg }];
    setChatHistory(newHistory);
    setChatLoading(true);

    try {
      const body: AiChatRequest = {
        context: {
          question,
          choices,
          answers,
          explanation: result.explanation,
        },
        history: chatHistory,
        message: userMsg,
      };
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as AiChatResponse;
      setChatHistory([...newHistory, { role: "model", text: data.reply }]);
    } catch {
      setChatHistory([...newHistory, { role: "model", text: "Failed to get response." }]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="fixed bottom-20 right-4 sm:right-8 z-60 w-80 sm:w-[22rem] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-white shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-violet-500" />
          <span className="text-sm font-semibold text-gray-800">{t("explain")}</span>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3 overflow-y-auto max-h-72">
        {loading && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 size={20} className="animate-spin text-violet-400" />
            <span className="text-xs text-gray-400">{t("aiExplaining")}</span>
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-500 leading-relaxed">{error}</p>
        )}

        {result && (
          <>
            {/* Suggested answers */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                {t("aiSuggestedAnswer")}
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {result.answers.map((a) => (
                  <span
                    key={a}
                    className="w-7 h-7 rounded-lg bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>

            {/* Explanation */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                {t("aiExplanation")}
              </p>
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                {result.explanation}
              </p>
            </div>

            {/* Reasoning */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                {t("aiReasoning")}
              </p>
              <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap">
                {result.reasoning}
              </p>
            </div>

            {/* Sources */}
            {result.sources && result.sources.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Sources
                </p>
                <div className="flex flex-col gap-1">
                  {result.sources.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-700 hover:underline"
                    >
                      <ExternalLink size={10} className="shrink-0" />
                      <span className="truncate">{url}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Chat history */}
            {chatHistory.length > 0 && (
              <div className="border-t border-gray-100 pt-3 space-y-2">
                {chatHistory.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-violet-600 text-white"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-xl px-3 py-2">
                      <Loader2 size={12} className="animate-spin text-gray-400" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {result && (
        <>
          {/* Chat input */}
          <div className="px-3 pb-2 pt-2 border-t border-gray-100 flex gap-2 items-end shrink-0">
            <textarea
              ref={inputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleChatSend();
                }
              }}
              placeholder="Ask a follow-up question..."
              rows={1}
              className="flex-1 text-xs text-gray-700 placeholder-gray-300 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 resize-none outline-none focus:border-violet-300 focus:ring-1 focus:ring-violet-200 transition-colors"
            />
            <button
              onClick={handleChatSend}
              disabled={!chatInput.trim() || chatLoading}
              className="shrink-0 w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-700 disabled:opacity-30 transition-colors"
            >
              <Send size={12} />
            </button>
          </div>

          {/* Dismiss / Suggest / Adopt */}
          <div className="px-4 pb-4 pt-1 flex gap-2 shrink-0">
            <button
              onClick={onDismiss}
              className="flex-1 h-10 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
            >
              {t("dismiss")}
              <kbd className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-md font-mono hidden sm:inline">⌫</kbd>
            </button>
            <button
              onClick={onSuggest}
              disabled={suggesting}
              className="flex-1 h-10 rounded-xl border border-violet-200 text-violet-600 bg-violet-50 text-sm font-semibold hover:bg-violet-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
            >
              {suggesting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <MessageSquarePlus size={13} />
              )}
              {t("suggest")}
            </button>
            <button
              onClick={onAdopt}
              disabled={adopting}
              className="flex-1 h-10 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
            >
              {adopting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <CheckCheck size={13} />
              )}
              {t("adopt")}
              <kbd className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-md font-mono hidden sm:inline">↵</kbd>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
