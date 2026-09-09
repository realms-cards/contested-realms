import type { StateCreator } from "zustand";
import type { CellKey, GameState, ServerPatchT, SiteTile } from "./types";
import {
  computeAvailableMana,
  getCachedThresholdTotals,
  resourceContextFromState,
} from "./utils/resourceHelpers";

type ResourceSlice = Pick<
  GameState,
  "getPlayerSites" | "getAvailableMana" | "getThresholdTotals" | "addMana"
>;

export const createResourceSlice: StateCreator<
  GameState,
  [],
  [],
  ResourceSlice
> = (set, get) => ({
  getPlayerSites: (who) => {
    const state = get();
    const owner = who === "p1" ? 1 : 2;
    return Object.entries(state.board.sites).filter(
      ([, site]) => site && site.owner === owner,
    ) as Array<[CellKey, SiteTile]>;
  },

  getAvailableMana: (who) => {
    // Available mana = mana from sites and permanents + the spend offset.
    // `players[who].mana` is the single spend ledger: negative when mana has
    // been spent this turn, positive for manual/temporary gains.
    const state = get();
    const base = computeAvailableMana(resourceContextFromState(state, who));
    const offset = Number(state.players[who]?.mana || 0);
    return Math.max(0, base + offset);
  },

  getThresholdTotals: (who) => {
    const state = get();
    return getCachedThresholdTotals(state, who);
  },

  addMana: (who, delta) =>
    set((state) => {
      const playerState = state.players[who];
      if (!playerState) {
        console.warn("[addMana] Player state not initialized for", who);
        return state;
      }
      const current = Number(playerState.mana || 0);
      const next = current + delta;
      if (next === current) return state;

      const newState = {
        players: {
          ...state.players,
          [who]: {
            ...playerState,
            mana: next,
          },
        },
      };

      // Send patch (same pattern as addLife)
      const patch: ServerPatchT = {
        players: { [who]: newState.players[who] } as GameState["players"],
      };
      get().trySendPatch(patch);

      return newState;
    }),
});
