import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface DeckCard {
  cardId: number;
  name: string;
  slug: string | null;
  type: string | null;
  rarity: string | null;
  set: string | null;
  zone: string;
  needed: number;
  owned: number;
  missing: number;
}

interface DiffResult {
  deckName: string;
  totalCards: number;
  uniqueCards: number;
  missingCards: DeckCard[];
  ownedCards: DeckCard[];
  summary: {
    totalMissing: number;
    uniqueMissing: number;
    completionPercent: number;
  };
}

// GET /api/collection/deck-diff?deckId=xxx
// Compare a simulator deck against user's collection
export async function GET(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const { searchParams } = new URL(req.url);
    const deckId = searchParams.get("deckId");

    if (!deckId) {
      return new Response(JSON.stringify({ error: "deckId is required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Fetch the deck with its cards
    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
      include: {
        cards: {
          include: {
            variant: {
              select: {
                slug: true,
                typeText: true,
                card: { select: { name: true } },
                set: { select: { name: true } },
              },
            },
            card: { select: { name: true } },
            set: { select: { name: true } },
          },
        },
      },
    });

    if (!deck) {
      return new Response(JSON.stringify({ error: "Deck not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    // Only allow access to own decks or public decks
    if (deck.userId !== session.user.id && !deck.isPublic) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    // Build a map of needed cards by cardId
    const neededByCardId = new Map<
      number,
      {
        count: number;
        name: string;
        slug: string | null;
        type: string | null;
        set: string | null;
        zone: string;
      }
    >();

    for (const dc of deck.cards) {
      const cardId = dc.cardId;
      const name = dc.variant?.card?.name || dc.card?.name || "Unknown";
      const slug = dc.variant?.slug || null;
      const type = dc.variant?.typeText || null;
      const setName = dc.variant?.set?.name || dc.set?.name || null;

      const existing = neededByCardId.get(cardId);
      if (existing) {
        existing.count += dc.count;
        // Prefer spellbook/atlas zone over sideboard for display
        if (dc.zone !== "Sideboard") {
          existing.zone = dc.zone;
        }
      } else {
        neededByCardId.set(cardId, {
          count: dc.count,
          name,
          slug,
          type,
          set: setName,
          zone: dc.zone,
        });
      }
    }

    // Fetch user's collection counts for the needed cards
    const cardIds = Array.from(neededByCardId.keys());
    const collectionCards = await prisma.collectionCard.findMany({
      where: {
        userId: session.user.id,
        cardId: { in: cardIds },
      },
      select: {
        cardId: true,
        quantity: true,
      },
    });

    // Build owned counts map
    const ownedByCardId = new Map<number, number>();
    for (const cc of collectionCards) {
      const existing = ownedByCardId.get(cc.cardId) || 0;
      ownedByCardId.set(cc.cardId, existing + cc.quantity);
    }

    // Get rarity info from CardSetMetadata
    const rarityByCardId = new Map<number, string>();
    const cardMetas = await prisma.cardSetMetadata.findMany({
      where: { cardId: { in: cardIds } },
      select: { cardId: true, rarity: true },
    });
    for (const meta of cardMetas) {
      if (!rarityByCardId.has(meta.cardId) && meta.rarity) {
        rarityByCardId.set(meta.cardId, meta.rarity);
      }
    }

    // Compute diff
    const missingCards: DeckCard[] = [];
    const ownedCards: DeckCard[] = [];
    let totalCards = 0;
    let totalMissing = 0;

    for (const [cardId, info] of neededByCardId) {
      const owned = ownedByCardId.get(cardId) || 0;
      const missing = Math.max(0, info.count - owned);
      totalCards += info.count;

      const deckCard: DeckCard = {
        cardId,
        name: info.name,
        slug: info.slug,
        type: info.type,
        rarity: rarityByCardId.get(cardId) || null,
        set: info.set,
        zone: info.zone,
        needed: info.count,
        owned,
        missing,
      };

      if (missing > 0) {
        missingCards.push(deckCard);
        totalMissing += missing;
      } else {
        ownedCards.push(deckCard);
      }
    }

    // Sort missing cards by rarity (unique > elite > exceptional > ordinary)
    const rarityOrder = ["unique", "elite", "exceptional", "ordinary"];
    missingCards.sort((a, b) => {
      const aIdx = rarityOrder.indexOf(a.rarity?.toLowerCase() || "ordinary");
      const bIdx = rarityOrder.indexOf(b.rarity?.toLowerCase() || "ordinary");
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.name.localeCompare(b.name);
    });

    const result: DiffResult = {
      deckName: deck.name,
      totalCards,
      uniqueCards: neededByCardId.size,
      missingCards,
      ownedCards,
      summary: {
        totalMissing,
        uniqueMissing: missingCards.length,
        completionPercent:
          totalCards > 0
            ? Math.round(((totalCards - totalMissing) / totalCards) * 100)
            : 100,
      },
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Deck diff error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// POST /api/collection/deck-diff
// Body: { cards: [{ name: string, count: number }] }
// Compare an imported/parsed deck against user's collection
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { cards, deckName = "Imported Deck" } = body as {
      cards: Array<{ name: string; count: number }>;
      deckName?: string;
    };

    if (!Array.isArray(cards) || cards.length === 0) {
      return new Response(
        JSON.stringify({ error: "cards array is required" }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }

    // Resolve card names to cardIds
    const cardNames = cards.map((c) => c.name.toLowerCase().trim());
    const dbCards = await prisma.card.findMany({
      where: {
        name: {
          in: cardNames,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const cardIdByName = new Map<string, number>();
    const cardNameById = new Map<number, string>();
    for (const c of dbCards) {
      cardIdByName.set(c.name.toLowerCase(), c.id);
      cardNameById.set(c.id, c.name);
    }

    // Build needed map
    const neededByCardId = new Map<number, { count: number; name: string }>();
    const unresolved: string[] = [];

    for (const { name, count } of cards) {
      const cardId = cardIdByName.get(name.toLowerCase().trim());
      if (!cardId) {
        unresolved.push(name);
        continue;
      }
      const existing = neededByCardId.get(cardId);
      if (existing) {
        existing.count += count;
      } else {
        neededByCardId.set(cardId, {
          count,
          name: cardNameById.get(cardId) || name,
        });
      }
    }

    // Fetch variants for slug/type info
    const cardIds = Array.from(neededByCardId.keys());
    const variants = await prisma.variant.findMany({
      where: { cardId: { in: cardIds } },
      select: {
        cardId: true,
        slug: true,
        typeText: true,
        set: { select: { name: true } },
      },
      distinct: ["cardId"],
    });

    type VariantInfo = {
      cardId: number;
      slug: string;
      typeText: string | null;
      set: { name: string } | null;
    };
    const variantByCardId = new Map<number, VariantInfo>(
      variants.map((v) => [v.cardId, v])
    );

    // Fetch user's collection counts
    const collectionCards = await prisma.collectionCard.findMany({
      where: {
        userId: session.user.id,
        cardId: { in: cardIds },
      },
      select: {
        cardId: true,
        quantity: true,
      },
    });

    const ownedByCardId = new Map<number, number>();
    for (const cc of collectionCards) {
      const existing = ownedByCardId.get(cc.cardId) || 0;
      ownedByCardId.set(cc.cardId, existing + cc.quantity);
    }

    // Get rarity info
    const rarityByCardId = new Map<number, string>();
    const cardMetas = await prisma.cardSetMetadata.findMany({
      where: { cardId: { in: cardIds } },
      select: { cardId: true, rarity: true },
    });
    for (const meta of cardMetas) {
      if (!rarityByCardId.has(meta.cardId) && meta.rarity) {
        rarityByCardId.set(meta.cardId, meta.rarity);
      }
    }

    // Compute diff
    const missingCards: DeckCard[] = [];
    const ownedCards: DeckCard[] = [];
    let totalCards = 0;
    let totalMissing = 0;

    for (const [cardId, info] of neededByCardId) {
      const owned = ownedByCardId.get(cardId) || 0;
      const missing = Math.max(0, info.count - owned);
      totalCards += info.count;

      const variant = variantByCardId.get(cardId);
      const deckCard: DeckCard = {
        cardId,
        name: info.name,
        slug: variant?.slug || null,
        type: variant?.typeText || null,
        rarity: rarityByCardId.get(cardId) || null,
        set: variant?.set?.name || null,
        zone: "Spellbook",
        needed: info.count,
        owned,
        missing,
      };

      if (missing > 0) {
        missingCards.push(deckCard);
        totalMissing += missing;
      } else {
        ownedCards.push(deckCard);
      }
    }

    // Sort missing cards by rarity
    const rarityOrder = ["unique", "elite", "exceptional", "ordinary"];
    missingCards.sort((a, b) => {
      const aIdx = rarityOrder.indexOf(a.rarity?.toLowerCase() || "ordinary");
      const bIdx = rarityOrder.indexOf(b.rarity?.toLowerCase() || "ordinary");
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.name.localeCompare(b.name);
    });

    const result: DiffResult & { unresolved: string[] } = {
      deckName,
      totalCards,
      uniqueCards: neededByCardId.size,
      missingCards,
      ownedCards,
      summary: {
        totalMissing,
        uniqueMissing: missingCards.length,
        completionPercent:
          totalCards > 0
            ? Math.round(((totalCards - totalMissing) / totalCards) * 100)
            : 100,
      },
      unresolved,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Deck diff error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
