"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircleQuestion, X, Send, Eye, Pencil, Loader2, CheckCircle2, ExternalLink, XCircle } from "lucide-react";

interface PastedImage {
  id: string;
  name: string;
  blob: Blob;
  preview: string;
}

interface FeedbackPopupProps {
  /** API route path that handles POST requests. Defaults to "/api/feedback" */
  apiPath?: string;
  /** GitHub issue labels to apply */
  labels?: string[];
  /** Placeholder text for the markdown textarea */
  placeholder?: string;
}

type Status = "idle" | "submitting" | "success" | "error";

export function FeedbackPopup({
  apiPath = "/api/feedback",
  labels,
  placeholder = "Describe the issue or feedback...\n\nSupports Markdown. Paste images with Ctrl+V.",
}: FeedbackPopupProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<PastedImage[]>([]);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [status, setStatus] = useState<Status>("idle");
  const [issueUrl, setIssueUrl] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Focus textarea when popup opens
  useEffect(() => {
    if (open && tab === "write") {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open, tab]);

  // Revoke object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.preview));
    };
  }, [images]);

  function handleClose() {
    if (status === "submitting") return;
    setOpen(false);
    // Reset after close animation
    setTimeout(() => {
      setTitle("");
      setBody("");
      setImages([]);
      setTab("write");
      setStatus("idle");
      setIssueUrl("");
      setErrorMessage("");
    }, 200);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;

    e.preventDefault();
    const newImages: PastedImage[] = imageItems.map((item) => {
      const blob = item.getAsFile()!;
      const ext = item.type.split("/")[1] ?? "png";
      const id = Math.random().toString(36).slice(2);
      return {
        id,
        name: `image-${id}.${ext}`,
        blob,
        preview: URL.createObjectURL(blob),
      };
    });
    setImages((prev) => [...prev, ...newImages]);
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((img) => img.id !== id);
    });
  }

  async function blobToBase64(blob: Blob): Promise<string> {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) return;
    setStatus("submitting");
    setErrorMessage("");

    try {
      const imagePayload = await Promise.all(
        images.map(async (img) => ({
          name: img.name,
          data: await blobToBase64(img.blob),
          mimeType: img.blob.type,
        }))
      );

      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          images: imagePayload,
          labels,
        }),
      });

      const json = await res.json() as { issueUrl?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to create issue");

      setIssueUrl(json.issueUrl ?? "");
      setStatus("success");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && status === "idle";

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        className="fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
      >
        <MessageCircleQuestion size={20} />
      </button>

      {/* Popup */}
      {open && (
        <div
          className="fixed bottom-20 right-6 z-50 flex w-96 max-w-[calc(100vw-1.5rem)] flex-col rounded-2xl border border-gray-200 bg-white shadow-xl"
          role="dialog"
          aria-label="Send feedback"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageCircleQuestion size={16} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-800">Feedback</span>
            </div>
            <button
              onClick={handleClose}
              disabled={status === "submitting"}
              className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          {status === "success" ? (
            <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
              <CheckCircle2 size={36} className="text-emerald-500" />
              <p className="text-sm font-semibold text-gray-800">Issue created!</p>
              <a
                href={issueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-gray-500 underline hover:text-gray-700"
              >
                View on GitHub
                <ExternalLink size={11} />
              </a>
              <button
                onClick={handleClose}
                className="mt-2 h-8 rounded-lg bg-gray-900 px-4 text-xs font-semibold text-white transition-colors hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 px-4 py-3">
              {/* Title */}
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                disabled={status === "submitting"}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none disabled:opacity-50"
              />

              {/* Write / Preview tabs */}
              <div className="flex gap-1">
                <button
                  onClick={() => setTab("write")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    tab === "write"
                      ? "bg-gray-100 text-gray-800"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <Pencil size={12} />
                  Write
                </button>
                <button
                  onClick={() => setTab("preview")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    tab === "preview"
                      ? "bg-gray-100 text-gray-800"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <Eye size={12} />
                  Preview
                </button>
              </div>

              {/* Editor / Preview */}
              {tab === "write" ? (
                <textarea
                  ref={textareaRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onPaste={handlePaste}
                  placeholder={placeholder}
                  rows={6}
                  disabled={status === "submitting"}
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm leading-relaxed placeholder:text-gray-400 focus:border-gray-400 focus:outline-none disabled:opacity-50"
                />
              ) : (
                <div className="min-h-[9.5rem] rounded-xl border border-gray-200 px-3 py-2.5">
                  {body ? (
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                      {body}
                    </pre>
                  ) : (
                    <p className="text-sm text-gray-400">Nothing to preview.</p>
                  )}
                </div>
              )}

              {/* Image previews */}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((img) => (
                    <div key={img.id} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.preview}
                        alt={img.name}
                        className="h-14 w-14 rounded-lg border border-gray-200 object-cover"
                      />
                      <button
                        onClick={() => removeImage(img.id)}
                        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-800 text-white"
                        aria-label={`Remove ${img.name}`}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {status === "error" && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                  <XCircle size={14} className="shrink-0 text-rose-400" />
                  <p className="text-xs text-rose-600">{errorMessage}</p>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          {status !== "success" && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-xs text-gray-400">
                {images.length > 0
                  ? `${images.length} image${images.length > 1 ? "s" : ""} attached`
                  : "Paste images with Ctrl+V"}
              </p>
              <button
                onClick={status === "error" ? () => { setStatus("idle"); handleSubmit(); } : handleSubmit}
                disabled={!canSubmit}
                className="flex h-8 items-center gap-1.5 rounded-xl bg-gray-900 px-3 text-xs font-semibold text-white transition-colors hover:bg-gray-700 disabled:opacity-40"
              >
                {status === "submitting" ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send size={12} />
                    Submit
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
