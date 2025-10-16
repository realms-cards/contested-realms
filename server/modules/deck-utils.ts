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

export function normalizeDeckPayload(deckPayload: DeckPayload): NormalizedDeckCard[] {
  if (!deckPayload) return [];
  if (Array.isArray(deckPayload)) return deckPayload;
  if (deckPayload.main && Array.isArray(deckPayload.main)) return deckPayload.main;
  if (deckPayload.mainboard && Array.isArray(deckPayload.mainboard)) return deckPayload.mainboard;
  return [];
}

function isSiteType(type: string | null | undefined): boolean {
  return typeof type === "string" && type.toLowerCase().includes("site");
}

function isAvatarType(type: string | null | undefined): boolean {
  return typeof type === "string" && type.toLowerCase().includes("avatar");
}

export function validateDeckCards(cards: NormalizedDeckCard[]): DeckValidationResult {
  const errors: string[] = [];
  if (!Array.isArray(cards) || cards.length === 0) {
    errors.push("Deck is empty or invalid");
  }

  let avatarCount = 0;
  let siteCount = 0;
  let spellCount = 0;

  for (const card of cards) {
    const type = card?.type || "";
    if (isAvatarType(type)) {
      avatarCount++;
    } else if (
      isSiteType(type) ||
      (typeof card?.name === "string" &&
        ["Spire", "Stream", "Valley", "Wasteland"].includes(card.name))
    ) {
      siteCount++;
    } else {
      spellCount++;
    }
  }

  if (avatarCount !== 1) {
    errors.push(avatarCount === 0 ? "Deck requires exactly 1 Avatar" : "Deck has multiple Avatars");
  }
  if (siteCount < 12) errors.push("Atlas needs at least 12 sites");
  if (spellCount < 24) errors.push("Spellbook needs at least 24 cards (excluding Avatar)");

  return {
    isValid: errors.length === 0,
    errors,
    counts: { avatarCount, siteCount, spellCount },
  };
}
