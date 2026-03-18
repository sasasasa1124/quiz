"use client";

import { useRef, useState, useCallback } from "react";
import { useSettings } from "@/lib/settings-context";

// Session-scoped cache: text → Object URL (WAV blob)
const audioCache = new Map<string, string>();
// In-flight dedup: text → pending promise
const inFlight = new Map<string, Promise<string | null>>();

export function useAudio() {
  const { settings } = useSettings();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakingTokenRef = useRef<symbol | null>(null);
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    speakingTokenRef.current = null; // cancel any in-progress sequence
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
    async (texts: string[]) => {
      if (!settings.audioMode) return;
      stop();

      const token = Symbol();
      speakingTokenRef.current = token;

      for (const text of texts) {
        if (speakingTokenRef.current !== token) break;

        const objectUrl = await fetchAudio(text);
        if (!objectUrl || speakingTokenRef.current !== token) break;

        // Play this chunk and wait for it to finish
        await new Promise<void>((resolve) => {
          const audio = new Audio(objectUrl);
          audio.playbackRate = settings.audioSpeed;
          audioRef.current = audio;
          audio.addEventListener("ended", () => resolve());
          audio.addEventListener("error", () => resolve());
          audio.addEventListener("pause", () => resolve()); // resolve when stop() pauses audio
          setPlaying(true);
          audio.play().catch(() => resolve());
        });
      }

      if (speakingTokenRef.current === token) {
        setPlaying(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.audioMode, settings.audioSpeed, fetchAudio, stop],
  );

  // Pre-warm the first chunk of the next question
  const prefetch = useCallback(
    (firstChunk: string) => {
      if (!settings.audioMode) return;
      if (audioCache.has(firstChunk) || inFlight.has(firstChunk)) return;
      fetchAudio(firstChunk).catch(() => {});
    },
    [settings.audioMode, fetchAudio],
  );

  return { speak, stop, prefetch, playing };
}
