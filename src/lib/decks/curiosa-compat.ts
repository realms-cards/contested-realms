/**
 * Curiosa-Compatible Deck List Builder
 *
 * Builds a deck list in the same shape as Curiosa's tRPC API response.
 * Used by both the public /api/decks/[id]/list endpoint and the
 * league match reporter (to embed deck data in match reports).
 */

import { prisma } from "@/lib/prisma";

/** Single card entry matching Curiosa's CuriosatrpcDeck shape */
export interface CuriosaCompatEntry {
  quantity: number;
  variantId: string;
  card: {
    id: string;
    slug: string;
    name: string;
    type: string;
    category: string;
    variants: Array<{
      id: string;
      slug: string;
      setCard?: { set?: { name?: string } };
    }>;
  };
}

/** Full deck list matching CuriosatrpcResult shape */
export interface CuriosaCompatDeckList {
  deckList: CuriosaCompatEntry[];
  sideboardList: CuriosaCompatEntry[];
  avatarName: string | null;
  deckName: string | null;
  format: string;
  source: "realms.cards";
}

/** Map card types to Curiosa-style categories */
function typeToCategory(type: string): string {
  const lower = type.toLowerCase();
  if (lower.includes("avatar")) return "avatar";
  if (lower.includes("site")) return "site";
  if (lower.includes("minion")) return "creature";
  if (lower.includes("magic")) return "spell";
  if (lower.includes("artifact")) return "artifact";
  if (lower.includes("aura")) return "aura";
  return "spell";
}

/**
 * Build a Curiosa-compatible deck list from a deck ID.
 * Returns null if the deck doesn't exist.
 */
export async function buildCuriosaCompatDeckList(
  deckId: string,
): Promise<CuriosaCompatDeckList | null> {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    select: {
      name: true,
      format: true,
      cards: {
        select: {
          cardId: true,
          setId: true,
          zone: true,
          count: true,
          variantId: true,
          card: {
            select: {
              name: true,
              variants: {
                select: {
                  id: true,
                  slug: true,
                  set: { select: { name: true } },
                },
              },
            },
          },
          variant: {
            select: {
              id: true,
              slug: true,
              set: { select: { name: true } },
            },
          },
          set: { select: { name: true } },
        },
      },
    },
  });

  if (!deck) return null;

  // Fetch card type metadata for all (cardId, setId) pairs
  const pairs = deck.cards
    .filter((dc) => dc.setId != null)
    .map((dc) => ({ cardId: dc.cardId, setId: dc.setId as number }));

  const metaMap = new Map<string, string>();
  if (pairs.length > 0) {
    const metas = await prisma.cardSetMetadata.findMany({
      where: { OR: pairs },
      select: { cardId: true, setId: true, type: true },
    });
    for (const m of metas) {
      metaMap.set(`${m.cardId}:${m.setId}`, m.type);
    }
  }

  // Aggregate cards by (cardId, variantId, zone)
  interface AggEntry {
    quantity: number;
    cardId: number;
    variantId: number | null;
    zone: string;
    cardName: string;
    cardSlug: string;
    type: string;
    variants: Array<{
      id: number;
      slug: string;
      setName: string | null;
    }>;
  }

  const agg = new Map<string, AggEntry>();

  for (const dc of deck.cards) {
    const count = dc.count ?? 1;
    if (count <= 0) continue;

    const key = `${dc.cardId}:${dc.variantId ?? "x"}:${dc.zone ?? "Spellbook"}`;
    const existing = agg.get(key);

    if (existing) {
      existing.quantity += count;
      continue;
    }

    // Resolve type from metadata (authoritative) or fall back
    const metaKey = dc.setId != null ? `${dc.cardId}:${dc.setId}` : null;
    const metaType = metaKey ? metaMap.get(metaKey) ?? null : null;
    const type = metaType
      ?? (dc.variant?.slug?.toLowerCase().includes("avatar") ? "Avatar" : "");
    const resolvedType = type || (dc.zone === "Atlas" ? "Site" : "Spell");

    const variants = (dc.card.variants ?? []).map((v) => ({
      id: v.id,
      slug: v.slug,
      setName: v.set?.name ?? null,
    }));

    const variantSlug = dc.variant?.slug ?? variants[0]?.slug ?? "";

    agg.set(key, {
      quantity: count,
      cardId: dc.cardId,
      variantId: dc.variantId,
      zone: dc.zone ?? "Spellbook",
      cardName: dc.card.name,
      cardSlug: variantSlug,
      type: resolvedType,
      variants,
    });
  }

  // Split into deckList, sideboardList, and extract avatar
  const deckList: CuriosaCompatEntry[] = [];
  const sideboardList: CuriosaCompatEntry[] = [];
  let avatarName: string | null = null;

  for (const entry of agg.values()) {
    const curiosaEntry: CuriosaCompatEntry = {
      quantity: entry.quantity,
      variantId: String(entry.variantId ?? entry.cardId),
      card: {
        id: String(entry.cardId),
        slug: entry.cardSlug,
        name: entry.cardName,
        type: entry.type,
        category: typeToCategory(entry.type),
        variants: entry.variants.map((v) => ({
          id: String(v.id),
          slug: v.slug,
          ...(v.setName ? { setCard: { set: { name: v.setName } } } : {}),
        })),
      },
    };

    const isAvatar = entry.type.toLowerCase().includes("avatar");
    const isCollection = entry.zone === "Collection" || entry.zone === "Sideboard";

    if (isAvatar && !isCollection) {
      avatarName = entry.cardName;
      continue;
    }

    if (isCollection) {
      sideboardList.push(curiosaEntry);
    } else {
      deckList.push(curiosaEntry);
    }
  }

  return {
    deckList,
    sideboardList,
    avatarName,
    deckName: deck.name,
    format: deck.format,
    source: "realms.cards",
  };
}
