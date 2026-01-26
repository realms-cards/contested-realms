import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CellKey,
  ElementChoice,
  GameState,
  PlayerKey,
  SpecialSiteState,
} from "./types";

// Unique ID generator for Annual Fair activation
function newAnnualFairId() {
  return `annualfair_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// Pending Annual Fair activation state
export type PendingAnnualFair = {
  id: string;
  cellKey: CellKey;
  ownerSeat: PlayerKey;
  createdAt: number;
};

export type AnnualFairSlice = Pick<
  GameState,
  | "pendingAnnualFair"
  | "beginAnnualFair"
  | "completeAnnualFair"
  | "cancelAnnualFair"
>;

export const createAnnualFairSlice: StateCreator<
  GameState,
  [],
  [],
  AnnualFairSlice
> = (set, get) => ({
  pendingAnnualFair: null,

  beginAnnualFair: (cellKey: CellKey, ownerSeat: PlayerKey) => {
    const state = get();
    const id = newAnnualFairId();

    // Check if player has at least 1 mana
    const availableMana = state.getAvailableMana(ownerSeat);
    if (availableMana < 1) {
      state.log(`Annual Fair: Not enough mana (need 1, have ${availableMana})`);
      return;
    }

    set({
      pendingAnnualFair: {
        id,
        cellKey,
        ownerSeat,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    state.log(`[${ownerSeat.toUpperCase()}] Annual Fair: Choose an element...`);

    // Broadcast to opponent
    const transport = state.transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "annualFairBegin",
          id,
          cellKey,
          ownerSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  completeAnnualFair: (element: ElementChoice) => {
    const state = get();
    const pending = state.pendingAnnualFair;
    if (!pending) return;

    const { ownerSeat, cellKey } = pending;

    // Pay the mana cost (1)
    state.addMana(ownerSeat, -1);

    // Register the threshold bonus for this turn
    const turn = state.turn;
    const thresholds: Partial<{
      air: number;
      water: number;
      earth: number;
      fire: number;
    }> = {
      [element]: 1,
    };

    // Add to bloom bonuses (reuse existing mechanism for temporary thresholds)
    const newBonus = {
      cellKey,
      siteName: "Annual Fair",
      thresholds,
      turnPlayed: turn,
      owner: (ownerSeat === "p1" ? 1 : 2) as 1 | 2,
    };

    const newState: SpecialSiteState = {
      ...state.specialSiteState,
      bloomBonuses: [...state.specialSiteState.bloomBonuses, newBonus],
    };

    set({
      specialSiteState: newState,
      pendingAnnualFair: null,
    } as Partial<GameState> as GameState);

    state.trySendPatch({ specialSiteState: newState });

    const elementName = element.charAt(0).toUpperCase() + element.slice(1);
    state.log(
      `[${ownerSeat.toUpperCase()}] Annual Fair: Paid (1), gain ${elementName} threshold this turn`,
    );

    // Broadcast resolution
    const transport = state.transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "annualFairComplete",
          id: pending.id,
          ownerSeat,
          element,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  cancelAnnualFair: () => {
    const state = get();
    const pending = state.pendingAnnualFair;
    if (!pending) return;

    set({ pendingAnnualFair: null } as Partial<GameState> as GameState);

    state.log(`[${pending.ownerSeat.toUpperCase()}] Annual Fair: Cancelled`);
  },
});
