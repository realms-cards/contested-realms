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
    const sideboard: CardRef[] = Array.isArray(data?.sideboard)
      ? (data.sideboard as CardRef[])
      : [];

    const isAvatar = (c: CardRef) =>
      typeof c?.type === "string" && c.type.toLowerCase().includes("avatar");
    const avatars = [...rawSpellbook, ...sideboard].filter(isAvatar);
    
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