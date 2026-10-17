import { prisma } from "@/lib/prisma";

/** What a deck list shows about a deck's avatar: none, one (with its card), or several. */
export type AvatarSummary = {
  state: "none" | "single" | "multiple";
  avatarCard?: { name: string; slug: string | null };
};

/**
 * The avatar summary of each deck, in one query over its Avatar cards. Every requested id gets an
 * entry (`none` when the deck has no avatar).
 */
export async function deckAvatarSummaries(deckIds: string[]): Promise<Map<string, AvatarSummary>> {
  const out = new Map<string, AvatarSummary>();
  if (deckIds.length === 0) return out;
  const avatarCards = await prisma.$queryRaw<
    Array<{ deckId: string; count: number; cardName: string; variantSlug: string | null }>
  >`
    SELECT
      dc."deckId",
      dc.count,
      c.name as "cardName",
      v.slug as "variantSlug"
    FROM "DeckCard" dc
    JOIN "Variant" v ON dc."variantId" = v.id
    JOIN "Card" c ON dc."cardId" = c.id
    JOIN "CardSetMetadata" csm ON dc."cardId" = csm."cardId" AND v."setId" = csm."setId"
    WHERE dc."deckId" = ANY(${deckIds})
      AND dc.zone IN ('Spellbook', 'Atlas', 'Sideboard')
      AND csm.type ILIKE '%Avatar%'
  `;

  const byDeck = new Map<string, typeof avatarCards>();
  for (const entry of avatarCards) {
    const arr = byDeck.get(entry.deckId);
    if (arr) arr.push(entry);
    else byDeck.set(entry.deckId, [entry]);
  }

  for (const deckId of deckIds) {
    const entries = byDeck.get(deckId) ?? [];
    const totalCount = entries.reduce((sum, item) => sum + item.count, 0);
    let summary: AvatarSummary;
    if (totalCount === 1) {
      const avatarEntry = entries.find((item) => item.count > 0) ?? entries[0];
      summary = avatarEntry?.cardName
        ? {
            state: "single",
            avatarCard: { name: avatarEntry.cardName, slug: avatarEntry.variantSlug ? avatarEntry.variantSlug.toLowerCase() : null },
          }
        : { state: "single" };
    } else if (totalCount > 1) {
      summary = { state: "multiple" };
    } else {
      summary = { state: "none" };
    }
    out.set(deckId, summary);
  }
  return out;
}
