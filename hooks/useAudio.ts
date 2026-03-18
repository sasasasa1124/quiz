"use client";

import { useRef, useState, useCallback } from "react";
import { useSettings } from "@/lib/settings-context";

// Session-scoped cache: text → Object URL (WAV blob)
const audioCache = new Map<string, string>();
// In-flight dedup: text → pending promise (avoids duplicate API calls)
const inFlight = new Map<string, Promise<string | null>>();

export function useAudio() {
  const { settings } = useSettings();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlaying(false);
  }, []);

  const fetchAudio = useCallback(async (text: string): Promise<string | null> => {
    const cached = audioCache.get(text);
    if (cached) return cached;
    // Reuse in-flight request to avoid duplicate API calls
    const existing = inFlight.get(text);
    if (existing) return existing;
    const promise = (async () => {
      try {
        const res = await fetch("/api/audio/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        audioCache.set(text, objectUrl);
        return objectUrl;
      } catch {
        return null;
      } finally {
        inFlight.delete(text);
      }
    })();
    inFlight.set(text, promise);
    return promise;
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!settings.audioMode) return;
      stop();

      try {
        const objectUrl = await fetchAudio(text);
        if (!objectUrl) return;

        const audio = new Audio(objectUrl);
        audio.playbackRate = settings.audioSpeed;
        audioRef.current = audio;

        audio.addEventListener("ended", () => setPlaying(false));
        audio.addEventListener("error", () => setPlaying(false));

        setPlaying(true);
        await audio.play();
      } catch {
        setPlaying(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.audioMode, settings.audioSpeed, fetchAudio],
  );

  // Pre-warm the cache for a text without playing it
  const prefetch = useCallback(
    (text: string) => {
      if (!settings.audioMode) return;
      if (audioCache.has(text)) return;
      fetchAudio(text).catch(() => {});
    },
    [settings.audioMode, fetchAudio],
  );

  return { speak, stop, prefetch, playing };
}
