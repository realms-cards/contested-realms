import { useGameStore } from "@/lib/game/store";
import type { CardRef, Phase } from "@/lib/game/store";

export async function loadDeckFor(
  who: "p1" | "p2",
  deckId: string,
  setError: (error: string) => void
): Promise<boolean> {
  if (!deckId) return false;
  
  try {
    const res = await fetch(`/api/decks/${encodeURIComponent(deckId)}`, {
      cache: "no-store",
    });
    
    if (!res.ok) {
      setError("Failed to load deck");
      return false;
    }
    
    const data = await res.json();
    const rawSpellbook: CardRef[] = Array.isArray(data?.spellbook)
      ? (data.spellbook as CardRef[])
      : [];
    const rawAtlas: CardRef[] = Array.isArray(data?.atlas)
      ? (data.atlas as CardRef[])
      : [];

    const isAvatar = (c: CardRef) =>
      typeof c?.type === "string" && c.type.toLowerCase().includes("avatar");
    const avatars = [...rawSpellbook, ...rawAtlas].filter(isAvatar);
    
    if (avatars.length !== 1) {
      setError(
        avatars.length === 0
          ? "Deck requires exactly 1 Avatar"
          : "Deck has multiple Avatars. Keep only one."
      );
      return false;
    }
    
    const avatar = avatars[0];
    const spellbook = rawSpellbook.filter((c: CardRef) => !isAvatar(c));

    if (rawAtlas.length < 12) {
      setError("Atlas needs at least 12 sites");
      return false;
    }
    
    if (spellbook.length < 24) {
      setError("Spellbook needs at least 24 cards (excluding Avatar)");
      return false;
    }

    const {
      initLibraries,
      shuffleSpellbook,
      shuffleAtlas,
      setAvatarCard,
      placeAvatarAtStart,
      drawOpening,
    } = useGameStore.getState();

    initLibraries(who, spellbook, rawAtlas);
    shuffleSpellbook(who);
    shuffleAtlas(who);
    setAvatarCard(who, avatar);
    placeAvatarAtStart(who);
    drawOpening(who);
    
    return true;
  } catch {
    setError("Error loading deck");
    return false;
  }
}

export function setPhase(phase: Phase) {
  useGameStore.getState().setPhase(phase);
}

export async function loadSealedDeckFor(
  who: "p1" | "p2",
  deckData: unknown,
  setError: (error: string) => void
): Promise<boolean> {
  if (!deckData) return false;

  try {
    // deckData is an array of cards from sealed construction
    const sealedCards = Array.isArray(deckData) ? deckData : [];

    if (sealedCards.length === 0) {
      setError("No cards in sealed deck");
      return false;
    }

    // Convert sealed card format to CardRef format
    const cards: CardRef[] = sealedCards.map((card: Record<string, unknown>) => ({
      cardId: parseInt(String(card.id || card.cardId)),
      variantId: (card.variantId as number) || null,
      name: String(card.name || card.cardName),
      type: card.type as string,
      slug: card.slug as string,
      thresholds: (card.thresholds as Record<string, number>) || null,
    }));

    // Separate cards by type
    const isAvatar = (c: CardRef) =>
      typeof c?.type === "string" && c.type.toLowerCase().includes("avatar");
    const isSite = (c: CardRef) =>
      typeof c?.type === "string" && c.type.toLowerCase().includes("site");

    const avatars = cards.filter(isAvatar);
    const rawAtlas = cards.filter(isSite);
    const spellbook = cards.filter((c: CardRef) => !isAvatar(c) && !isSite(c));

    if (avatars.length !== 1) {
      setError(
        avatars.length === 0
          ? "Sealed deck requires exactly 1 Avatar"
          : "Sealed deck has multiple Avatars. This shouldn't happen."
      );
      return false;
    }

    const avatar = avatars[0];

    if (rawAtlas.length < 12) {
      setError("Sealed deck needs at least 12 sites");
      return false;
    }

    if (spellbook.length < 24) {
      setError("Sealed deck needs at least 24 cards (excluding Avatar)");
      return false;
    }

    const {
      initLibraries,
      shuffleSpellbook,
      shuffleAtlas,
      setAvatarCard,
      placeAvatarAtStart,
      drawOpening,
    } = useGameStore.getState();

    initLibraries(who, spellbook, rawAtlas);
    shuffleSpellbook(who);
    shuffleAtlas(who);
    setAvatarCard(who, avatar);
    placeAvatarAtStart(who);
    drawOpening(who);

    return true;
  } catch (e) {
    console.error("Error loading sealed deck:", e);
    setError("Error loading sealed deck");
    return false;
  }
}

/**
 * Load a constructed tournament deck from the full deck object
 * This is used for tournament constructed matches where deck data is pre-loaded
 */
export async function loadTournamentConstructedDeck(
  who: "p1" | "p2",
  deckData: unknown,
  setError: (error: string) => void
): Promise<boolean> {
  if (!deckData || typeof deckData !== 'object') return false;

  try {
    const deck = deckData as { cards: Array<Record<string, unknown>> };
    if (!Array.isArray(deck.cards)) {
      setError("Invalid deck format");
      return false;
    }

    // Convert database deck format to CardRef format
    // Group cards by zone (spellbook/atlas)
    const rawSpellbook: CardRef[] = [];
    const rawAtlas: CardRef[] = [];

    for (const deckCard of deck.cards) {
      const card = deckCard.card as Record<string, unknown>;
      const variant = deckCard.variant as Record<string, unknown> | null;
      const count = Number(deckCard.count || 1);
      const zone = String(deckCard.zone || 'spellbook');

      const cardRef: CardRef = {
        cardId: Number(card.id),
        variantId: variant ? Number(variant.id) : null,
        name: String(card.name),
        type: String(variant?.typeText || card.type || ''),
        slug: String(variant?.slug || card.slug || ''),
        thresholds: (card.thresholds as Record<string, number>) || null,
      };

      // Add the card `count` times
      for (let i = 0; i < count; i++) {
        if (zone === 'atlas') {
          rawAtlas.push(cardRef);
        } else {
          rawSpellbook.push(cardRef);
        }
      }
    }

    // Validate and separate
    const isAvatar = (c: CardRef) =>
      typeof c?.type === "string" && c.type.toLowerCase().includes("avatar");

    const avatars = [...rawSpellbook, ...rawAtlas].filter(isAvatar);

    if (avatars.length !== 1) {
      setError(
        avatars.length === 0
          ? "Deck requires exactly 1 Avatar"
          : "Deck has multiple Avatars. Keep only one."
      );
      return false;
    }

    const avatar = avatars[0];
    const spellbook = rawSpellbook.filter((c: CardRef) => !isAvatar(c));

    if (rawAtlas.length < 12) {
      setError("Atlas needs at least 12 sites");
      return false;
    }

    if (spellbook.length < 24) {
      setError("Spellbook needs at least 24 cards (excluding Avatar)");
      return false;
    }

    const {
      initLibraries,
      shuffleSpellbook,
      shuffleAtlas,
      setAvatarCard,
      placeAvatarAtStart,
      drawOpening,
    } = useGameStore.getState();

    initLibraries(who, spellbook, rawAtlas);
    shuffleSpellbook(who);
    shuffleAtlas(who);
    setAvatarCard(who, avatar);
    placeAvatarAtStart(who);
    drawOpening(who);

    return true;
  } catch (e) {
    console.error("Error loading tournament constructed deck:", e);
    setError("Error loading tournament deck");
    return false;
  }
}