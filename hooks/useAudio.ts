"use client";

import { useRef, useState, useCallback } from "react";
import { useSettings } from "@/lib/settings-context";
import { makeCacheKey, getAudioBlob, setAudioBlob } from "@/lib/audioDb";

// Session-scoped cache: text → Object URL (WAV blob)
const audioCache = new Map<string, string>();
// In-flight dedup: text → pending promise
const inFlight = new Map<string, Promise<string | null>>();

export function useAudio() {
  const { settings } = useSettings();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakingTokenRef = useRef<symbol | null>(null);
  const [playing, setPlaying] = useState(false);
  // true while waiting for TTS fetch before playback starts
  const [loading, setLoading] = useState(false);

  const stop = useCallback(() => {
    speakingTokenRef.current = null; // cancel any in-progress sequence
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlaying(false);
    setLoading(false);
  }, []);

  const fetchAudio = useCallback(async (text: string): Promise<string | null> => {
    const cached = audioCache.get(text);
    if (cached) return cached;
    const existing = inFlight.get(text);
    if (existing) return existing;
    const promise = (async () => {
      try {
        // Check IndexedDB persistent cache
        const cacheKey = await makeCacheKey(text).catch(() => null);
        if (cacheKey) {
          const stored = await getAudioBlob(cacheKey).catch(() => null);
          if (stored) {
            const objectUrl = URL.createObjectURL(stored);
            audioCache.set(text, objectUrl);
            return objectUrl;
          }
        }

        const res = await fetch("/api/audio/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        audioCache.set(text, objectUrl);
        if (cacheKey) {
          setAudioBlob(cacheKey, blob).catch(() => {});
        }
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

      for (let i = 0; i < texts.length; i++) {
        if (speakingTokenRef.current !== token) break;

        // Show loading indicator while fetching this chunk (only if not already cached)
        const isCached = audioCache.has(texts[i]) || inFlight.has(texts[i]);
        if (!isCached) setLoading(true);
        const objectUrl = await fetchAudio(texts[i]);
        setLoading(false);
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
          // i+k lookahead: kick off fetch for next k chunks as soon as this one starts playing
          const k = settings.audioPrefetch ?? 3;
          for (let j = 1; j <= k; j++) {
            if (i + j < texts.length) fetchAudio(texts[i + j]).catch(() => {});
          }
          audio.play().catch(() => resolve());
        });
      }

      if (speakingTokenRef.current === token) {
        setPlaying(false);
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.audioMode, settings.audioSpeed, settings.audioPrefetch, fetchAudio, stop],
  );

  // Pre-warm the next question's audio
  const prefetch = useCallback(
    (firstChunk: string) => {
      if (!settings.audioMode) return;
      if (audioCache.has(firstChunk) || inFlight.has(firstChunk)) return;
      fetchAudio(firstChunk).catch(() => {});
    },
    [settings.audioMode, fetchAudio],
  );

  return { speak, stop, prefetch, playing, loading };
}
