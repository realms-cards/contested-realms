import { useGameStore } from "@/lib/game/store";
import type { CardRef, Phase } from "@/lib/game/store";

// Internal helper: extend CardRef with an optional classification zone
type CardRefWithZone = CardRef & { __zone?: string | null };

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
    const rawCollection: CardRef[] = Array.isArray(data?.collection)
      ? (data.collection as CardRef[])
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

    // Collection is optional and does not count towards minimums.
    // Clamp to at most 10 cards to respect collection capacity even for legacy decks.
    const collection = rawCollection.slice(0, 10);

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
      setAvatarChampion,
      placeAvatarAtStart,
      drawOpening,
    } = useGameStore.getState();

    // Initialize libraries, including initial collection zone
    initLibraries(who, spellbook, rawAtlas, collection);
    shuffleSpellbook(who);
    shuffleAtlas(who);
    setAvatarCard(who, avatar);

    // Set Dragonlord champion if present
    if (data.champion) {
      setAvatarChampion(who, {
        cardId: data.champion.cardId,
        name: data.champion.name,
        slug: data.champion.slug || null,
      });
    }

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

    // Convert incoming card format to CardRef format (support optional zone for constructed decks)
    const cards: CardRefWithZone[] = sealedCards.map(
      (card: Record<string, unknown>) => {
        const zoneRaw = (card.zone as string | null) || null;
        const zone = typeof zoneRaw === "string" ? zoneRaw.toLowerCase() : null;
        return {
          cardId: parseInt(String(card.id ?? card.cardId)),
          variantId: (card.variantId as number) || null,
          name: String(card.name ?? card.cardName ?? ""),
          type: (card.type as string) || "",
          slug: String(card.slug ?? ""),
          thresholds: (card.thresholds as Record<string, number>) || null,
          __zone: zone,
        };
      }
    );

    // Separate cards by type
    const isAvatar = (c: CardRef) => {
      if (typeof c?.type !== "string" || c.type.length === 0) {
        if (c.name && c.name.toLowerCase().includes("avatar")) {
          console.warn(
            "[loadSealedDeckFor] Card with 'avatar' in name but empty/null type:",
            { name: c.name, type: c.type }
          );
        }
        return false;
      }
      return c.type.toLowerCase().includes("avatar");
    };
    const isSite = (c: CardRef) =>
      typeof c?.type === "string" &&
      c.type.length > 0 &&
      c.type.toLowerCase().includes("site");

    // Prefer zone-based classification when zones are provided (constructed tournament decks)
    const anyZonesProvided = cards.some((c: CardRefWithZone) => !!c.__zone);
    let rawAtlas: CardRef[];
    let spellbook: CardRef[];
    const avatars = cards.filter(isAvatar);

    if (anyZonesProvided) {
      const atlasZ: CardRefWithZone[] = cards.filter(
        (c: CardRefWithZone) => c.__zone === "atlas"
      );
      const spellZ: CardRefWithZone[] = cards.filter(
        (c: CardRefWithZone) =>
          c.__zone === "spellbook" || c.__zone === "spell" || c.__zone == null
      );
      rawAtlas = atlasZ;
      // Exclude avatar from spellbook later using isAvatar
      spellbook = (spellZ as CardRef[]).filter((c: CardRef) => !isAvatar(c));
    } else {
      // Fallback to type-based classification for sealed/draft inputs
      rawAtlas = cards.filter(isSite);
      spellbook = cards.filter((c: CardRef) => !isAvatar(c) && !isSite(c));
    }

    // For draft/sealed tournament matches, avatar might not be present yet (loaded separately or from sideboard)
    // Allow loading without avatar for now - the game will handle it
    let avatar: CardRef | null = null;
    if (avatars.length > 1) {
      setError("Sealed deck has multiple Avatars. This shouldn't happen.");
      return false;
    }
    if (avatars.length === 1) {
      avatar = avatars[0];
    } else {
      console.warn(
        "[loadSealedDeckFor] No avatar found in deck - this is OK for draft/sealed tournament matches during deck construction"
      );
    }

    if (rawAtlas.length < 12) {
      console.error("[loadSealedDeckFor] Validation failed: not enough sites", {
        atlasCount: rawAtlas.length,
        spellbookCount: spellbook.length,
        avatarsCount: avatars.length,
        totalCards: cards.length,
        anyZonesProvided,
        sampleAtlas: rawAtlas.slice(0, 3),
        sampleSpellbook: spellbook.slice(0, 3).map((c) => ({
          name: c.name,
          type: c.type,
          cardId: (c as { cardId?: unknown }).cardId,
        })),
        allCardsSample: cards.slice(0, 5).map((c) => ({
          name: c.name,
          type: c.type,
          cardId: (c as { cardId?: unknown }).cardId,
          __zone: (c as { __zone?: unknown }).__zone,
        })),
      });
      setError("Sealed deck needs at least 12 sites");
      return false;
    }

    if (spellbook.length < 24) {
      console.error(
        "[loadSealedDeckFor] Validation failed: not enough spells",
        {
          atlasCount: rawAtlas.length,
          spellbookCount: spellbook.length,
          avatarsCount: avatars.length,
          totalCards: cards.length,
        }
      );
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

    // Only set avatar if we have one (draft/sealed might not have avatar yet)
    if (avatar) {
      setAvatarCard(who, avatar);
      placeAvatarAtStart(who);
    }

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
  if (!deckData || typeof deckData !== "object") return false;

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
      const zone = String(deckCard.zone || "spellbook");

      const cardRef: CardRef = {
        cardId: Number(card.id),
        variantId: variant ? Number(variant.id) : null,
        name: String(card.name),
        type: String(card.type || variant?.typeText || ""), // Use card.type (metadata.type) first, not typeText (flavor text)
        subTypes: (card.subTypes as string | null | undefined) || null,
        slug: String(variant?.slug || card.slug || ""),
        thresholds: (card.thresholds as Record<string, number>) || null,
      };

      // Add the card `count` times
      for (let i = 0; i < count; i++) {
        if (zone === "atlas") {
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
      setAvatarChampion,
      placeAvatarAtStart,
      drawOpening,
    } = useGameStore.getState();

    initLibraries(who, spellbook, rawAtlas);
    shuffleSpellbook(who);
    shuffleAtlas(who);
    setAvatarCard(who, avatar);

    // Set Dragonlord champion if present
    const deckWithChampion = deckData as {
      champion?: { cardId: number; name: string; slug?: string | null };
    };
    if (deckWithChampion.champion) {
      setAvatarChampion(who, {
        cardId: deckWithChampion.champion.cardId,
        name: deckWithChampion.champion.name,
        slug: deckWithChampion.champion.slug || null,
      });
    }

    placeAvatarAtStart(who);
    drawOpening(who);

    return true;
  } catch (e) {
    console.error("Error loading tournament constructed deck:", e);
    setError("Error loading tournament deck");
    return false;
  }
}
