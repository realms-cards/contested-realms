import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { CardRef, CellKey, GameState, PlayerKey } from "./types";

// River site names that trigger this Genesis effect
export const RIVER_GENESIS_SITES = new Set([
  "spring river",
  "summer river",
  "autumn river",
  "winter river",
]);

export function isRiverGenesisSite(
  cardName: string | null | undefined
): boolean {
  if (!cardName) return false;
  return RIVER_GENESIS_SITES.has(cardName.toLowerCase());
}

function newRiverGenesisId() {
  return `river_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type RiverGenesisPhase = "viewing" | "resolved";

export type PendingRiverGenesis = {
  id: string;
  siteName: string;
  cellKey: CellKey;
  ownerSeat: PlayerKey;
  phase: RiverGenesisPhase;
  topSpell: CardRef | null; // The spell being viewed
  choice: "keep" | "bottom" | null; // Player's choice
  createdAt: number;
};

export type RiverGenesisSlice = Pick<
  GameState,
  | "pendingRiverGenesis"
  | "beginRiverGenesis"
  | "completeRiverGenesis"
  | "cancelRiverGenesis"
>;

export const createRiverGenesisSlice: StateCreator<
  GameState,
  [],
  [],
  RiverGenesisSlice
> = (set, get) => ({
  pendingRiverGenesis: null,

  beginRiverGenesis: (input) => {
    const state = get();
    const { siteName, cellKey, ownerSeat } = input;
    const id = newRiverGenesisId();

    // Get the top spell from owner's spellbook
    const spellbook = state.zones[ownerSeat].spellbook;
    const topSpell = spellbook.length > 0 ? spellbook[0] : null;

    if (!topSpell) {
      // No spells in spellbook - nothing to do
      state.log(`${siteName} Genesis: No spells in spellbook to look at`);
      return;
    }

    set({
      pendingRiverGenesis: {
        id,
        siteName,
        cellKey,
        ownerSeat,
        phase: "viewing",
        topSpell,
        choice: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = state.transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "riverGenesisBegin",
          id,
          siteName,
          cellKey,
          ownerSeat,
          // Don't send the actual card to opponent - they just see "viewing"
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const playerNum = ownerSeat === "p1" ? "1" : "2";
    state.log(
      `[p${playerNum}:PLAYER] ${siteName} Genesis: Looking at next spell...`
    );
  },

  completeRiverGenesis: (choice) => {
    const state = get();
    const pending = state.pendingRiverGenesis;
    if (!pending || pending.phase !== "viewing" || !pending.topSpell) return;

    const { ownerSeat, siteName, topSpell } = pending;

    if (choice === "bottom") {
      // Move the top spell to the bottom of the spellbook
      const spellbook = [...state.zones[ownerSeat].spellbook];
      
      // Remove from top (index 0)
      const [movedCard] = spellbook.splice(0, 1);
      if (movedCard) {
        // Add to bottom
        spellbook.push(movedCard);
      }

      // Update zones
      const zonesNext = {
        ...state.zones,
        [ownerSeat]: {
          ...state.zones[ownerSeat],
          spellbook,
        },
      } as GameState["zones"];

      set({
        zones: zonesNext,
        pendingRiverGenesis: null,
      } as Partial<GameState> as GameState);

      // Send patch for zone update
      const transport = state.transport;
      if (transport) {
        state.trySendPatch({
          zones: {
            [ownerSeat]: { spellbook },
          } as GameState["zones"],
        });
      }

      const playerNum = ownerSeat === "p1" ? "1" : "2";
      state.log(
        `[p${playerNum}:PLAYER] ${siteName} Genesis: Put ${topSpell.name} on bottom of spellbook`
      );
    } else {
      // Keep on top - no zone changes needed
      set({ pendingRiverGenesis: null } as Partial<GameState> as GameState);

      const playerNum = ownerSeat === "p1" ? "1" : "2";
      state.log(
        `[p${playerNum}:PLAYER] ${siteName} Genesis: Kept spell on top of spellbook`
      );
    }

    // Broadcast resolution to opponent
    const transport = state.transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "riverGenesisComplete",
          id: pending.id,
          choice,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  cancelRiverGenesis: () => {
    const state = get();
    const pending = state.pendingRiverGenesis;
    if (!pending) return;

    // Broadcast cancellation
    const transport = state.transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "riverGenesisCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    state.log(`${pending.siteName} Genesis cancelled`);
    set({ pendingRiverGenesis: null } as Partial<GameState> as GameState);
  },
});
