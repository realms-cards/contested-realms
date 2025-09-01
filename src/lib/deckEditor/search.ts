export type SearchType = "all" | "site" | "spell" | "avatar";

export type SearchResult = {
  variantId: number;
  slug: string;
  finish: "Standard" | "Foil";
  product: string;
  cardId: number;
  cardName: string;
  set: string;
  type: string | null;
  rarity: string | null;
};

function dedupeByCardId(list: SearchResult[]): SearchResult[] {
  const byCard = new Map<number, SearchResult>();
  for (const r of list) {
    const prev = byCard.get(r.cardId);
    if (!prev) {
      byCard.set(r.cardId, r);
    } else if (prev.finish !== "Standard" && r.finish === "Standard") {
      byCard.set(r.cardId, r);
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
