import type { CardRef } from "@/lib/game/store/types";
import { findCard } from "@sorcery/shared";

/** Our printing ids per card name, from /api/cards/search-index (preferred printing first). */
export interface PrintingRef {
  cardId: number;
  variantId: number;
  slug: string;
}

type SearchIndexEntry = [number, number, number, string, string, string, boolean, boolean];

let index: Map<string, PrintingRef> | null = null;
let loading: Promise<Map<string, PrintingRef>> | null = null;

export function loadCardIndex(): Promise<Map<string, PrintingRef>> {
  if (index) return Promise.resolve(index);
  loading ??= fetch("/api/cards/search-index")
    .then((res) => res.json() as Promise<{ entries: SearchIndexEntry[] }>)
    .then(({ entries }) => {
      const map = new Map<string, PrintingRef>();
      for (const [cardId, variantId, , name, slug] of entries) {
        if (!map.has(name)) map.set(name, { cardId, variantId, slug });
      }
      index = map;
      return map;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

const refCache = new Map<string, Omit<CardRef, "instanceId" | "owner">>();

/** A CardRef for an engine card name: our printing for art, the engine's card data for text and stats. */
export function cardRefFor(name: string): Omit<CardRef, "instanceId" | "owner"> {
  const cached = refCache.get(name);
  if (cached) return cached;
  const printing = index?.get(name);
  const def = findCard(name);
  const ref: Omit<CardRef, "instanceId" | "owner"> = {
    cardId: printing?.cardId ?? 0,
    variantId: printing?.variantId ?? null,
    slug: printing?.slug ?? null,
    name,
    type: def?.type ?? null,
    subTypes: def?.subtypes?.join(" ") ?? null,
    thresholds: def?.thresholds ?? null,
    cost: def?.cost ?? null,
    text: def?.text ?? null,
    attack: def?.attack ?? null,
    defence: def?.defence ?? null,
    rarity: def?.rarity ?? null,
  };
  // Only cache once art is resolvable, so refs built before the index loads get their slug later.
  if (index) refCache.set(name, ref);
  return ref;
}
