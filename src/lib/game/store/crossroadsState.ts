import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { CardRef, CellKey, GameState, PlayerKey, ServerPatchT, Zones } from "./types";

// Crossroads site: "Genesis → Look at your next four sites. Put three on the bottom of your atlas."
export const CROSSROADS_SITE_NAME = "crossroads";

export function isCrossroadsCard(cardName: string | null | undefined): boolean {
  if (!cardName) return false;
  return cardName.toLowerCase() === CROSSROADS_SITE_NAME;
}

function newCrossroadsId() {
  return `xroads_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type CrossroadsPhase = "selecting" | "resolving" | "complete";

export type PendingCrossroads = {
  id: string;
  siteName: string;
  cellKey: CellKey;
  ownerSeat: PlayerKey;
  phase: CrossroadsPhase;
  // Top 4 cards from atlas
  revealedCards: CardRef[];
  // Index of the card the player wants to keep on top (into revealedCards)
  selectedCardIndex: number | null;
  createdAt: number;
};

export type CrossroadsSlice = Pick<
  GameState,
  | "pendingCrossroads"
  | "beginCrossroads"
  | "selectCrossroadsCard"
  | "resolveCrossroads"
  | "cancelCrossroads"
>;

export const createCrossroadsSlice: StateCreator<
  GameState,
  [],
  [],
  CrossroadsSlice
> = (set, get) => ({
  pendingCrossroads: null,

  beginCrossroads: (input) => {
    const state = get();
    const { siteName, cellKey, ownerSeat } = input;
    const id = newCrossroadsId();

    // Get the top 4 sites from owner's atlas
    const atlas = state.zones[ownerSeat]?.atlas || [];
    const revealedCards = atlas.slice(0, 4);

    if (revealedCards.length === 0) {
      state.log(`${siteName} Genesis: No sites in atlas to look at`);
      return;
    }

    set({
      pendingCrossroads: {
        id,
        siteName,
        cellKey,
        ownerSeat,
        phase: "selecting",
        revealedCards,
        selectedCardIndex: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = state.transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "crossroadsBegin",
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
      `[p${playerNum}:PLAYER] ${siteName} Genesis: Looking at top ${revealedCards.length} site${revealedCards.length !== 1 ? "s" : ""} in atlas...`
    );
  },

  selectCrossroadsCard: (cardIndex) => {
    const pending = get().pendingCrossroads;
    if (!pending || pending.phase !== "selecting") return;
    if (cardIndex < 0 || cardIndex >= pending.revealedCards.length) return;

    set({
      pendingCrossroads: {
        ...pending,
        selectedCardIndex: cardIndex,
      },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "crossroadsSelect",
          id: pending.id,
          cardIndex,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveCrossroads: () => {
    const pending = get().pendingCrossroads;
    if (
      !pending ||
      pending.phase !== "selecting" ||
      pending.selectedCardIndex === null
    )
      return;

    const { ownerSeat, siteName, revealedCards, selectedCardIndex } = pending;
    const zones = get().zones;
    const atlas = [...(zones[ownerSeat]?.atlas || [])];

    // Remove the revealed cards from the top of atlas
    atlas.splice(0, revealedCards.length);

    // The selected card goes back on top
    const keptCard = revealedCards[selectedCardIndex];
    atlas.unshift(keptCard);

    // The other 3 go to the bottom of atlas
    const bottomCards = revealedCards.filter((_, i) => i !== selectedCardIndex);
    atlas.push(...bottomCards);

    // Update zones
    const zonesNext = {
      ...zones,
      [ownerSeat]: {
        ...zones[ownerSeat],
        atlas,
      },
    };

    set({
      zones: zonesNext,
      pendingCrossroads: null,
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
          type: "crossroadsResolve",
          id: pending.id,
          selectedCardIndex,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const playerNum = ownerSeat === "p1" ? "1" : "2";
    get().log(
      `[p${playerNum}:PLAYER] ${siteName} Genesis: Kept 1 site on top, put ${bottomCards.length} on bottom of atlas`
    );
  },

  cancelCrossroads: () => {
    const pending = get().pendingCrossroads;
    if (!pending) return;

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "crossroadsCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(`${pending.siteName} Genesis cancelled`);
    set({ pendingCrossroads: null } as Partial<GameState> as GameState);
  },
});
