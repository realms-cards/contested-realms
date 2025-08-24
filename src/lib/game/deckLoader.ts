import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store";

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

export function setPhase(phase: string) {
  useGameStore.getState().setPhase(phase);
}