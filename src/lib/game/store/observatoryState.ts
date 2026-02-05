import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { CardRef, CellKey, GameState, PlayerKey, ServerPatchT, Zones } from "./types";

// Observatory site: "Genesis → Look at your next three spells. Put them back in any order."
export const OBSERVATORY_SITE_NAME = "observatory";

export function isObservatoryCard(cardName: string | null | undefined): boolean {
  if (!cardName) return false;
  return cardName.toLowerCase() === OBSERVATORY_SITE_NAME;
}

function newObservatoryId() {
  return `obs_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type ObservatoryPhase = "ordering" | "resolving" | "complete";

export type PendingObservatory = {
  id: string;
  siteName: string;
  cellKey: CellKey;
  ownerSeat: PlayerKey;
  phase: ObservatoryPhase;
  // Top 3 cards from spellbook
  revealedCards: CardRef[];
  // The new order for the cards (indices into revealedCards)
  newOrder: number[];
  createdAt: number;
};

export type ObservatorySlice = Pick<
  GameState,
  | "pendingObservatory"
  | "beginObservatory"
  | "setObservatoryOrder"
  | "resolveObservatory"
  | "cancelObservatory"
>;

export const createObservatorySlice: StateCreator<
  GameState,
  [],
  [],
  ObservatorySlice
> = (set, get) => ({
  pendingObservatory: null,

  beginObservatory: (input) => {
    const state = get();
    const { siteName, cellKey, ownerSeat } = input;
    const id = newObservatoryId();

    // Get the top 3 spells from owner's spellbook
    const spellbook = state.zones[ownerSeat]?.spellbook || [];
    const revealedCards = spellbook.slice(0, 3);

    if (revealedCards.length === 0) {
      state.log(`${siteName} Genesis: No spells in spellbook to look at`);
      return;
    }

    // Default order is original order
    const newOrder = revealedCards.map((_, i) => i);

    set({
      pendingObservatory: {
        id,
        siteName,
        cellKey,
        ownerSeat,
        phase: "ordering",
        revealedCards,
        newOrder,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = state.transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "observatoryBegin",
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
      `[p${playerNum}:PLAYER] ${siteName} Genesis: Looking at top ${revealedCards.length} spell${revealedCards.length !== 1 ? "s" : ""}...`
    );
  },

  setObservatoryOrder: (order) => {
    const pending = get().pendingObservatory;
    if (!pending || pending.phase !== "ordering") return;

    // Validate order contains all indices
    if (order.length !== pending.revealedCards.length) return;
    const orderSet = new Set(order);
    const expectedIndices = pending.revealedCards.map((_, i) => i);
    if (!expectedIndices.every((i) => orderSet.has(i))) return;

    set({
      pendingObservatory: {
        ...pending,
        newOrder: order,
      },
    } as Partial<GameState> as GameState);

    // Broadcast order change
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "observatorySetOrder",
          id: pending.id,
          order,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveObservatory: () => {
    const pending = get().pendingObservatory;
    if (!pending || pending.phase !== "ordering") return;

    const { ownerSeat, siteName, revealedCards, newOrder } = pending;
    const zones = get().zones;
    const spellbook = [...(zones[ownerSeat]?.spellbook || [])];

    // Remove the revealed cards from spellbook (they were at the top)
    spellbook.splice(0, revealedCards.length);

    // Put them back in the new order (first in newOrder = top of spellbook)
    const reorderedCards = newOrder.map((i) => revealedCards[i]);
    spellbook.unshift(...reorderedCards);

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
      pendingObservatory: null,
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
          type: "observatoryResolve",
          id: pending.id,
          newOrder,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const playerNum = ownerSeat === "p1" ? "1" : "2";
    get().log(
      `[p${playerNum}:PLAYER] ${siteName} Genesis: Reordered top ${revealedCards.length} spell${revealedCards.length !== 1 ? "s" : ""}`
    );
  },

  cancelObservatory: () => {
    const pending = get().pendingObservatory;
    if (!pending) return;

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "observatoryCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(`${pending.siteName} Genesis cancelled`);
    set({ pendingObservatory: null } as Partial<GameState> as GameState);
  },
});
