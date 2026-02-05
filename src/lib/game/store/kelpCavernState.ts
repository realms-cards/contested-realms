import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { CardRef, CellKey, GameState, PlayerKey, ServerPatchT, Zones } from "./types";

// Kelp Cavern site: "Genesis → Look at your bottom three spells. Put one on top of your spellbook."
export const KELP_CAVERN_SITE_NAME = "kelp cavern";

export function isKelpCavernCard(cardName: string | null | undefined): boolean {
  if (!cardName) return false;
  return cardName.toLowerCase() === KELP_CAVERN_SITE_NAME;
}

function newKelpCavernId() {
  return `kelp_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type KelpCavernPhase = "selecting" | "resolving" | "complete";

export type PendingKelpCavern = {
  id: string;
  siteName: string;
  cellKey: CellKey;
  ownerSeat: PlayerKey;
  phase: KelpCavernPhase;
  // Bottom 3 cards from spellbook
  revealedCards: CardRef[];
  // Original indices in spellbook (from the bottom)
  originalIndices: number[];
  // Index of selected card in revealedCards to put on top
  selectedCardIndex: number | null;
  createdAt: number;
};

export type KelpCavernSlice = Pick<
  GameState,
  | "pendingKelpCavern"
  | "beginKelpCavern"
  | "selectKelpCavernCard"
  | "resolveKelpCavern"
  | "cancelKelpCavern"
>;

export const createKelpCavernSlice: StateCreator<
  GameState,
  [],
  [],
  KelpCavernSlice
> = (set, get) => ({
  pendingKelpCavern: null,

  beginKelpCavern: (input) => {
    const state = get();
    const { siteName, cellKey, ownerSeat } = input;
    const id = newKelpCavernId();

    // Get the bottom 3 spells from owner's spellbook
    const spellbook = state.zones[ownerSeat]?.spellbook || [];
    const bottomCount = Math.min(3, spellbook.length);
    
    if (bottomCount === 0) {
      state.log(`${siteName} Genesis: No spells in spellbook to look at`);
      return;
    }

    // Get cards from the bottom
    const startIndex = spellbook.length - bottomCount;
    const revealedCards = spellbook.slice(startIndex);
    const originalIndices = revealedCards.map((_, i) => startIndex + i);

    set({
      pendingKelpCavern: {
        id,
        siteName,
        cellKey,
        ownerSeat,
        phase: "selecting",
        revealedCards,
        originalIndices,
        selectedCardIndex: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = state.transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "kelpCavernBegin",
          id,
          siteName,
          cellKey,
          ownerSeat,
          revealedCount: revealedCards.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const playerNum = ownerSeat === "p1" ? "1" : "2";
    state.log(
      `[p${playerNum}:PLAYER] ${siteName} Genesis: Looking at bottom ${revealedCards.length} spell${revealedCards.length !== 1 ? "s" : ""}...`
    );
  },

  selectKelpCavernCard: (cardIndex) => {
    const pending = get().pendingKelpCavern;
    if (!pending || pending.phase !== "selecting") return;
    if (cardIndex < 0 || cardIndex >= pending.revealedCards.length) return;

    set({
      pendingKelpCavern: {
        ...pending,
        selectedCardIndex: cardIndex,
      },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "kelpCavernSelect",
          id: pending.id,
          cardIndex,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveKelpCavern: () => {
    const pending = get().pendingKelpCavern;
    if (!pending || pending.phase !== "selecting" || pending.selectedCardIndex === null) return;

    const { ownerSeat, siteName, revealedCards, originalIndices, selectedCardIndex } = pending;
    const zones = get().zones;
    const spellbook = [...(zones[ownerSeat]?.spellbook || [])];

    // Get the selected card
    const selectedCard = revealedCards[selectedCardIndex];
    if (!selectedCard) return;

    // Find the actual index in spellbook
    const actualIndex = originalIndices[selectedCardIndex];

    // Remove the selected card from its position at the bottom
    spellbook.splice(actualIndex, 1);

    // Put it on top
    spellbook.unshift(selectedCard);

    // Update zones
    const zonesNext = {
      ...zones,
      [ownerSeat]: {
        ...zones[ownerSeat],
        spellbook,
      },
    };

    set({
      zones: zonesNext,
      pendingKelpCavern: null,
    } as Partial<GameState> as GameState);

    // Send zone patch
    const zonePatch: ServerPatchT = {
      zones: { [ownerSeat]: zonesNext[ownerSeat] } as Record<PlayerKey, Zones>,
    };
    get().trySendPatch(zonePatch);

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "kelpCavernResolve",
          id: pending.id,
          selectedCardIndex,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const playerNum = ownerSeat === "p1" ? "1" : "2";
    get().log(
      `[p${playerNum}:PLAYER] ${siteName} Genesis: Put a spell on top of spellbook`
    );
  },

  cancelKelpCavern: () => {
    const pending = get().pendingKelpCavern;
    if (!pending) return;

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "kelpCavernCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(`${pending.siteName} Genesis cancelled`);
    set({ pendingKelpCavern: null } as Partial<GameState> as GameState);
  },
});
