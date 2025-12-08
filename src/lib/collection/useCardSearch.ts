"use client";

import { useCallback, useEffect, useState } from "react";

// Index entry format: [cardId, variantId, setId, cardName, slug, setName, isFoil, isSite]
type IndexEntry = [
  number,
  number,
  number,
  string,
  string,
  string,
  number,
  number
];

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
  isSite: boolean;
}

// Global cache - shared across all hook instances
let globalIndex: SearchIndex | null = null;
let loadingPromise: Promise<SearchIndex | null> | null = null;

/**
 * Check if a set is a promotional/promo set (should be deprioritized)
 */
function isPromoSet(setName: string): boolean {
  const lower = setName.toLowerCase();
  return lower === "promotional" || lower === "promo";
}

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
      // Dedupe by cardId, track finish and promo status
      const seenCards = new Map<
        number,
        { isFoil: boolean; isPromo: boolean }
      >();

      for (const entry of index.entries) {
        const [
          cardId,
          variantId,
          setId,
          cardName,
          slug,
          setName,
          isFoil,
          isSite,
        ] = entry;

        // Match card name or slug
        if (
          cardName.toLowerCase().includes(q) ||
          slug.toLowerCase().includes(q)
        ) {
          const currIsPromo = isPromoSet(setName);
          const existing = seenCards.get(cardId);

          if (existing) {
            // Prioritize: non-promo over promo, then Standard over Foil
            const shouldReplace =
              (existing.isPromo && !currIsPromo) || // Replace promo with non-promo
              (!existing.isPromo === !currIsPromo && // Same promo status
                existing.isFoil &&
                !isFoil); // Prefer Standard over Foil

            if (shouldReplace) {
              const idx = results.findIndex((r) => r.cardId === cardId);
              if (idx !== -1) {
                results[idx] = {
                  cardId,
                  cardName,
                  variantId,
                  slug,
                  set: setName,
                  setId,
                  finish: isFoil ? "Foil" : "Standard",
                  isSite: !!isSite,
                };
                seenCards.set(cardId, {
                  isFoil: !!isFoil,
                  isPromo: currIsPromo,
                });
              }
            }
            continue;
          }

          seenCards.set(cardId, { isFoil: !!isFoil, isPromo: currIsPromo });

          results.push({
            cardId,
            cardName,
            variantId,
            slug,
            set: setName,
            setId,
            finish: isFoil ? "Foil" : "Standard",
            isSite: !!isSite,
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
