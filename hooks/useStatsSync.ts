import { useState, useEffect } from "react";
import type { QuizStats } from "@/lib/types";
import { loadLocalStats, saveLocalStats } from "@/lib/statsStorage";

/**
 * Loads quiz stats from localStorage on mount, then merges with DB scores
 * (DB wins). Saves the merged result back to localStorage.
 *
 * Returns { stats, setStats, statsLoaded } where:
 * - statsLoaded: true once the initial localStorage read is complete
 * - setStats: allows callers to update stats inline (e.g., after answering)
 */
export function useStatsSync(examId: string) {
  const [stats, setStats] = useState<QuizStats>({});
  const [statsLoaded, setStatsLoaded] = useState(false);

  useEffect(() => {
    const local = loadLocalStats(examId);
    setStats(local);
    setStatsLoaded(true);

    fetch(`/api/scores?examId=${encodeURIComponent(examId)}`)
      .then((r) => r.json() as Promise<QuizStats>)
      .then((db) => {
        setStats((prev) => {
          const merged = { ...prev, ...db };
          saveLocalStats(examId, merged);
          return merged;
        });
      })
      .catch(() => {}); // silently fail – local stats remain usable
  }, [examId]);

  return { stats, setStats, statsLoaded };
}
