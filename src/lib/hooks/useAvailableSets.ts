"use client";

import { useState, useEffect, useCallback } from "react";

export interface AvailableSet {
  id: number;
  name: string;
  releasedAt: string | null;
  hasPacks: boolean;
}

// Default sets to use before API loads or on error
export const DEFAULT_DRAFTABLE_SETS = [
  "Beta",
  "Arthurian Legends",
  "Dragonlord",
  "Gothic",
];

// Fallback default set for pack configs
export const DEFAULT_SET = "Beta";

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

/**
 * Build default pack counts object from set names.
 * First set gets the default count, others get 0.
 */
export function buildDefaultPackCounts(
  setNames: string[],
  defaultSet: string = DEFAULT_SET,
  defaultCount: number = 6
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of setNames) {
    counts[name] = name === defaultSet ? defaultCount : 0;
  }
  // Ensure default set is included even if not in setNames
  if (!(defaultSet in counts) && setNames.length > 0) {
    counts[setNames[0]] = defaultCount;
  }
  return counts;
}
