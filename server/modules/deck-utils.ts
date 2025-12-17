"use strict";

export interface DeckCard {
  type?: string | null;
  name?: string | null;
}

export interface NormalizedDeckCard extends DeckCard {
  [key: string]: unknown;
}

export interface DeckValidationResult {
  isValid: boolean;
  errors: string[];
  counts: {
    avatarCount: number;
    siteCount: number;
    spellCount: number;
  };
}

export type DeckPayload =
  | NormalizedDeckCard[]
  | {
      main?: NormalizedDeckCard[];
      mainboard?: NormalizedDeckCard[];
      [key: string]: unknown;
    }
  | null
  | undefined;

export function normalizeDeckPayload(
  deckPayload: DeckPayload
): NormalizedDeckCard[] {
  if (!deckPayload) return [];
  if (Array.isArray(deckPayload)) return deckPayload;
  if (deckPayload.main && Array.isArray(deckPayload.main))
    return deckPayload.main;
  if (deckPayload.mainboard && Array.isArray(deckPayload.mainboard))
    return deckPayload.mainboard;
  return [];
}

/**
 * Check if a card is in the collection zone (not main deck).
 * Collection cards are identified by zone field being "collection".
 */
function isCollectionCard(card: NormalizedDeckCard): boolean {
  const zone = card?.zone as string | undefined;
  return typeof zone === "string" && zone.toLowerCase() === "collection";
}

function isSiteType(type: string | null | undefined): boolean {
  return typeof type === "string" && type.toLowerCase().includes("site");
}

function isAvatarType(type: string | null | undefined): boolean {
  return typeof type === "string" && type.toLowerCase().includes("avatar");
}

export function validateDeckCards(
  cards: NormalizedDeckCard[]
): DeckValidationResult {
  const errors: string[] = [];
  if (!Array.isArray(cards) || cards.length === 0) {
    errors.push("Deck is empty or invalid");
  }

  let avatarCount = 0;
  let siteCount = 0;
  let spellCount = 0;
  let _collectionAvatarCount = 0; // Tracked for debugging but not validated

  for (const card of cards) {
    const type = card?.type || "";
    const inCollection = isCollectionCard(card);

    if (isAvatarType(type)) {
      if (inCollection) {
        // Avatars in collection are allowed (for Imposter ability)
        _collectionAvatarCount++;
      } else {
        avatarCount++;
      }
    } else if (
      isSiteType(type) ||
      (typeof card?.name === "string" &&
        ["Spire", "Stream", "Valley", "Wasteland"].includes(card.name))
    ) {
      if (!inCollection) siteCount++;
    } else {
      if (!inCollection) spellCount++;
    }
  }

  // Main deck must have exactly 1 avatar; collection can have additional avatars
  if (avatarCount !== 1) {
    errors.push(
      avatarCount === 0
        ? "Deck requires exactly 1 Avatar"
        : "Deck has multiple Avatars in main deck"
    );
  }
  if (siteCount < 12) errors.push("Atlas needs at least 12 sites");
  if (spellCount < 24)
    errors.push("Spellbook needs at least 24 cards (excluding Avatar)");

  return {
    isValid: errors.length === 0,
    errors,
    counts: { avatarCount, siteCount, spellCount },
  };
}
