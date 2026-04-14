/**
 * Shared helper to trigger custom card resolvers when a card is placed on the board.
 * Used by playSelectedTo, castFromMorganaHand, castFromOmphalosHand, and dropStolenCard
 * so that cards cast from special hands still get their custom abilities.
 */
import type { CardRef, CellKey, GameState, PlayerKey } from "../types";

export type ResolverContext = {
  card: CardRef;
  key: CellKey;
  permanentIndex: number;
  instanceId: string | null;
  owner: 1 | 2;
  ownerSeat: PlayerKey;
  get: () => GameState;
};

/**
 * Trigger custom card resolvers for a card that was just placed on the board.
 * This handles spell resolvers, minion ETB/genesis abilities, artifact registration,
 * and the generic magic cast fallback.
 *
 * @returns true if a custom resolver was triggered, false otherwise
 */
export function triggerCardResolvers(ctx: ResolverContext): boolean {
  const { card, key, permanentIndex, instanceId, owner, ownerSeat, get } = ctx;

  if (get().resolversDisabled) {
    console.log("[resolverTriggers] Resolvers globally disabled, skipping");
    return false;
  }

  const cardNameLower = (card.name || "").toLowerCase();
  const type = (card.type || "").toLowerCase();

  const spellRef = {
    at: key,
    index: permanentIndex,
    instanceId,
    owner,
    card,
  };

  let triggered = false;

  // ─── SPELL RESOLVERS ─────────────────────────────────────────────
  if (cardNameLower.includes("chaos twister")) {
    try {
      get().beginChaosTwister({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "browse") {
    try {
      get().beginBrowse({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "shapeshift") {
    try {
      get().beginShapeshift({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "common sense") {
    try {
      get().beginCommonSense({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "call to war") {
    try {
      get().beginCallToWar({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "searing truth") {
    try {
      get().beginSearingTruth({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "accusation") {
    try {
      get().beginAccusation({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "feast for crows") {
    try {
      get().beginFeastForCrows({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "earthquake") {
    try {
      get().beginEarthquake({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "corpse explosion") {
    try {
      get().beginCorpseExplosion({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "black mass") {
    try {
      get().beginBlackMass({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "assorted animals") {
    try {
      const manaCost = (card as CardRef & { cost?: number }).cost ?? 0;
      const xValue = Math.max(0, manaCost);
      get().beginAssortedAnimals({
        spell: spellRef,
        casterSeat: ownerSeat,
        xValue,
      });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "dhol chants") {
    try {
      get().beginDholChants({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "atlantean fate") {
    try {
      get().beginAtlanteanFate({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "raise dead") {
    try {
      get().beginRaiseDead({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "legion of gall") {
    try {
      get().beginLegionOfGall({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "betrayal") {
    try {
      get().beginBetrayal({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  } else if (cardNameLower === "infiltrate") {
    try {
      get().beginInfiltrate({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  }

  // ─── MINION GENESIS / ETB RESOLVERS ──────────────────────────────
  // Morgana le Fay genesis (uses else-if chain with spells above)
  else if (
    cardNameLower.includes("morgana le fay") &&
    type.includes("minion")
  ) {
    try {
      get().triggerMorganaGenesis({
        minion: { at: key, index: permanentIndex, instanceId, owner, card },
        ownerSeat,
      });
      triggered = true;
    } catch {}
  }
  // Pith Imp genesis
  else if (cardNameLower.includes("pith imp") && type.includes("minion")) {
    try {
      get().triggerPithImpGenesis({
        minion: { at: key, index: permanentIndex, instanceId, owner, card },
        ownerSeat,
      });
      triggered = true;
    } catch {}
  }
  // Omphalos artifact registration
  else if (cardNameLower.includes("omphalos") && type.includes("artifact")) {
    try {
      get().registerOmphalos({
        artifact: { at: key, index: permanentIndex, instanceId, owner, card },
        ownerSeat,
      });
      triggered = true;
    } catch {}
  }

  // ─── STANDALONE RESOLVERS (use `if`, not `else if`) ──────────────
  // These trigger independently of the else-if chain above

  // Lilith registration
  if (cardNameLower === "lilith" && type.includes("minion")) {
    try {
      get().registerLilith({
        instanceId: instanceId ?? `lilith_${Date.now()}`,
        location: key,
        ownerSeat,
        cardName: card.name || "Lilith",
      });
      triggered = true;
    } catch {}
  }

  // Merlin registration
  if (cardNameLower === "merlin" && type.includes("minion")) {
    try {
      get().registerMerlin({
        instanceId: instanceId ?? `merlin_${Date.now()}`,
        location: key,
        ownerSeat,
        cardName: card.name || "Merlin",
      });
      triggered = true;
    } catch {}
  }

  // Mother Nature registration
  if (cardNameLower === "mother nature" && type.includes("minion")) {
    try {
      get().registerMotherNature({
        instanceId: instanceId ?? `mother_nature_${Date.now()}`,
        location: key,
        ownerSeat,
        cardName: card.name || "Mother Nature",
      });
      triggered = true;
    } catch {}
  }

  // The Inquisition genesis
  if (cardNameLower === "the inquisition" && type.includes("minion")) {
    try {
      get().beginInquisition({
        minion: { at: key, index: permanentIndex, instanceId, owner, card },
        casterSeat: ownerSeat,
      });
      triggered = true;
    } catch {}
  }

  // Highland Princess genesis
  if (cardNameLower === "highland princess" && type.includes("minion")) {
    try {
      get().triggerHighlandPrincessGenesis({
        minion: { at: key, index: permanentIndex, instanceId, owner, card },
        ownerSeat,
      });
      triggered = true;
    } catch {}
  }

  // Mephistopheles confirmation
  if (cardNameLower.includes("mephistopheles") && type.includes("minion")) {
    try {
      get().beginMephistopheles({ spell: spellRef, casterSeat: ownerSeat });
      triggered = true;
    } catch {}
  }

  // ─── GENERIC MAGIC FALLBACK ──────────────────────────────────────
  // If no custom spell resolver triggered and it's a magic card,
  // fall back to generic magic cast flow
  if (!triggered && type.includes("magic")) {
    try {
      get().beginMagicCast({
        tile: {
          x: parseInt(key.split(",")[0], 10),
          y: parseInt(key.split(",")[1], 10),
        },
        spell: spellRef,
      });
    } catch {}
  }

  return triggered;
}
