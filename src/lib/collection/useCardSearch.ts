"use client";

import { useCallback, useEffect, useState } from "react";

// Index entry format: [cardId, variantId, setId, cardName, slug, setName, isFoil]
type IndexEntry = [number, number, number, string, string, string, number];

interface SearchIndex {
  v: number;
  entries: IndexEntry[];
}

export interface CardSearchResult {
  cardId: number;
  cardName: string;
  variantId: number;
  slug: string;
  set: string;
  setId: number;
  finish: string;
}

// Global cache - shared across all hook instances
let globalIndex: SearchIndex | null = null;
let loadingPromise: Promise<SearchIndex | null> | null = null;

async function loadIndex(): Promise<SearchIndex | null> {
  if (globalIndex) return globalIndex;
  if (loadingPromise) return loadingPromise;

  loadingPromise = fetch("/api/cards/search-index")
    .then((res) => {
      if (!res.ok) throw new Error("Failed to load search index");
      return res.json();
    })
    .then((data: SearchIndex) => {
      globalIndex = data;
      return data;
    })
    .catch((err) => {
      console.error("Failed to load card search index:", err);
      loadingPromise = null;
      return null;
    });

  return loadingPromise;
}

/**
 * Hook for instant client-side card search.
 * Loads the search index once, then searches locally.
 */
export function useCardSearch() {
  const [index, setIndex] = useState<SearchIndex | null>(globalIndex);
  const [loading, setLoading] = useState(!globalIndex);

  useEffect(() => {
    if (globalIndex) {
      setIndex(globalIndex);
      setLoading(false);
      return;
    }

    loadIndex().then((idx) => {
      setIndex(idx);
      setLoading(false);
    });
  }, []);

  const search = useCallback(
    (query: string, limit = 8): CardSearchResult[] => {
      if (!index || !query.trim()) return [];

      const q = query.toLowerCase();
      const results: CardSearchResult[] = [];
      const seenCards = new Map<number, { isFoil: boolean }>(); // Dedupe by cardId, track finish

      for (const entry of index.entries) {
        const [cardId, variantId, setId, cardName, slug, setName, isFoil] =
          entry;

        // Match card name or slug
        if (
          cardName.toLowerCase().includes(q) ||
          slug.toLowerCase().includes(q)
        ) {
          // Dedupe: prefer Standard finish over Foil (foil images may not exist)
          const existing = seenCards.get(cardId);
          if (existing) {
            // Replace foil with standard if we find a standard version
            if (existing.isFoil && !isFoil) {
              const idx = results.findIndex((r) => r.cardId === cardId);
              if (idx !== -1) {
                results[idx] = {
                  cardId,
                  cardName,
                  variantId,
                  slug,
                  set: setName,
                  setId,
                  finish: "Standard",
                };
                seenCards.set(cardId, { isFoil: false });
              }
            }
            continue;
          }
          seenCards.set(cardId, { isFoil: !!isFoil });

          results.push({
            cardId,
            cardName,
            variantId,
            slug,
            set: setName,
            setId,
            finish: isFoil ? "Foil" : "Standard",
          });

          if (results.length >= limit) break;
        }
      }

      return results;
    },
    [index]
  );

  return { search, loading, ready: !!index };
}
