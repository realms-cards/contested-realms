"use client";

import { useState, useEffect, useCallback } from "react";
import { DEFAULT_DRAFTABLE_SETS } from "./available-sets-constants";

// Re-export constants from the non-client file for backwards compatibility
export {
  DEFAULT_DRAFTABLE_SETS,
  DEFAULT_SET,
  buildDefaultPackCounts,
} from "./available-sets-constants";

export interface AvailableSet {
  id: number;
  name: string;
  releasedAt: string | null;
  hasPacks: boolean;
}

interface UseAvailableSetsResult {
  sets: AvailableSet[];
  setNames: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch available sets from the API.
 * Returns draftable sets (sets with pack configurations) by default.
 */
export function useAvailableSets(draftableOnly = true): UseAvailableSetsResult {
  const [sets, setSets] = useState<AvailableSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = draftableOnly ? "/api/sets" : "/api/sets?draftable=false";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to fetch sets: ${res.status}`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setSets(data);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      console.error("[useAvailableSets] Error:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch sets");
      // Keep existing sets on error, or use defaults if empty
      setSets((prev) =>
        prev.length > 0
          ? prev
          : DEFAULT_DRAFTABLE_SETS.map((name, idx) => ({
              id: idx,
              name,
              releasedAt: null,
              hasPacks: true,
            }))
      );
    } finally {
      setLoading(false);
    }
  }, [draftableOnly]);

  useEffect(() => {
    fetchSets();
  }, [fetchSets]);

  const setNames = sets.map((s) => s.name);

  return {
    sets,
    setNames,
    loading,
    error,
    refresh: fetchSets,
  };
}
