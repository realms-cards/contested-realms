export type SearchType = "all" | "site" | "spell" | "avatar";

export type SearchResult = {
  variantId: number;
  slug: string;
  finish: "Standard" | "Foil";
  product: string;
  cardId: number;
  cardName: string;
  set: string;
  setId?: number;
  type: string | null;
  rarity: string | null;
};

/**
 * Check if a set is a promotional/promo set (should be deprioritized)
 */
function isPromoSet(setName: string): boolean {
  const lower = setName.toLowerCase();
  return lower === "promotional" || lower === "promo";
}

/**
 * Deduplicate search results by cardId, prioritizing:
 * 1. Non-promotional sets over promotional
 * 2. Standard finish over Foil
 */
function dedupeByCardId(list: SearchResult[]): SearchResult[] {
  const byCard = new Map<number, SearchResult>();
  for (const r of list) {
    const prev = byCard.get(r.cardId);
    if (!prev) {
      byCard.set(r.cardId, r);
    } else {
      const prevIsPromo = isPromoSet(prev.set);
      const currIsPromo = isPromoSet(r.set);

      // Prefer non-promo over promo
      if (prevIsPromo && !currIsPromo) {
        byCard.set(r.cardId, r);
      } else if (!prevIsPromo && currIsPromo) {
        // Keep prev (non-promo)
      } else if (prev.finish !== "Standard" && r.finish === "Standard") {
        // Same promo status: prefer Standard finish
        byCard.set(r.cardId, r);
      }
    }
  }
  return Array.from(byCard.values());
}

export async function searchCards(params: {
  q: string;
  setName: string;
  type: SearchType;
}): Promise<SearchResult[]> {
  const sp = new URLSearchParams();
  const q = params.q.trim();
  if (q) sp.set("q", q);
  if (params.setName) sp.set("set", params.setName);
  if (params.type !== "all") sp.set("type", params.type);

  const res = await fetch(`/api/cards/search?${sp.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.error) || "Search failed");
  const list = (data as SearchResult[]) || [];
  return dedupeByCardId(list);
}
