import type { CardRef } from "@/lib/game/store/types";

/**
 * Full card metadata from API/cache
 */
export type CardMetadata = {
  cardId: number;
  variantId?: number | null;
  name: string;
  type: string | null;
  subTypes?: string | null;
  slug?: string | null;
  thresholds?: Record<string, number> | null;
  cost?: number | null;
  text?: string | null;
  attack?: number | null;
  defence?: number | null;
  rarity?: string | null;
};

/**
 * Fetch card metadata from service worker cache or API.
 * Tries cache-first, falls back to network.
 */
export async function fetchCardMetadata(
  cardIds: number[],
): Promise<Map<number, CardMetadata>> {
  const result = new Map<number, CardMetadata>();

  if (cardIds.length === 0) return result;

  try {
    // Try service worker cache first
    if ("caches" in window) {
      const cache = await caches.open("realms-cards-v1");
      const uniqueIds = Array.from(new Set(cardIds));

      // Try to fetch from cache for each card
      const cachePromises = uniqueIds.map(async (id) => {
        const cacheKey = `/api/cards/meta?ids=${id}`;
        const cached = await cache.match(cacheKey);
        if (cached) {
          try {
            const data = await cached.json();
            if (Array.isArray(data) && data.length > 0) {
              return { id, data: data[0] };
            }
          } catch {
            // Invalid cache entry, ignore
          }
        }
        return { id, data: null };
      });

      const cacheResults = await Promise.all(cachePromises);
      const missingIds: number[] = [];

      for (const { id, data } of cacheResults) {
        if (data) {
          result.set(id, data as CardMetadata);
        } else {
          missingIds.push(id);
        }
      }

      // Fetch missing cards from API
      if (missingIds.length > 0) {
        const apiUrl = `/api/cards/meta?ids=${missingIds.join(",")}`;
        const response = await fetch(apiUrl);

        if (response.ok) {
          const apiData = await response.json();
          if (Array.isArray(apiData)) {
            for (const card of apiData) {
              result.set(card.cardId, card as CardMetadata);
            }

            // Cache the response for future use
            try {
              await cache.put(apiUrl, response.clone());
            } catch {
              // Cache write failed, continue anyway
            }
          }
        }
      }
    } else {
      // No cache API, fetch directly
      const apiUrl = `/api/cards/meta?ids=${cardIds.join(",")}`;
      const response = await fetch(apiUrl);

      if (response.ok) {
        const apiData = await response.json();
        if (Array.isArray(apiData)) {
          for (const card of apiData) {
            result.set(card.cardId, card as CardMetadata);
          }
        }
      }
    }
  } catch (error) {
    console.error("[fetchCardMetadata] Error fetching card metadata:", error);
  }

  return result;
}

/**
 * Enrich a CardRef with full metadata.
 * Returns a new CardRef object with metadata fields populated.
 */
export function enrichCardRef(
  card: CardRef,
  metadata: CardMetadata | undefined,
): CardRef {
  if (!metadata) return card;

  return {
    ...card,
    text: metadata.text ?? card.text ?? null,
    attack: metadata.attack ?? card.attack ?? null,
    defence: metadata.defence ?? card.defence ?? null,
    rarity: metadata.rarity ?? card.rarity ?? null,
    // Also update other fields if they're missing
    type: card.type ?? metadata.type ?? null,
    subTypes: card.subTypes ?? metadata.subTypes ?? null,
    slug: card.slug ?? metadata.slug ?? null,
    thresholds: card.thresholds ?? metadata.thresholds ?? null,
    cost: card.cost ?? metadata.cost ?? null,
  };
}

/**
 * Enrich an array of CardRef objects with full metadata.
 * Fetches metadata for all cards in a single batch request.
 */
export async function enrichCardRefs(cards: CardRef[]): Promise<CardRef[]> {
  if (cards.length === 0) return cards;

  // Collect unique card IDs
  const cardIds = Array.from(
    new Set(cards.map((c) => c.cardId).filter((id) => id > 0)),
  );

  // Fetch metadata
  const metadataMap = await fetchCardMetadata(cardIds);

  // Enrich each card
  return cards.map((card) => {
    const metadata = metadataMap.get(card.cardId);
    return enrichCardRef(card, metadata);
  });
}
