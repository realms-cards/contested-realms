import type { StateCreator } from "zustand";
import type {
  CellKey,
  GameState,
  ServerPatchT,
  SiteTile,
} from "./types";
import {
  computeAvailableMana,
  getCachedThresholdTotals,
} from "./utils/resourceHelpers";

type ResourceSlice = Pick<
  GameState,
  | "getPlayerSites"
  | "getUntappedSitesCount"
  | "getAvailableMana"
  | "getThresholdTotals"
  | "addMana"
  | "addThreshold"
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
      ([, site]) => site.owner === owner
    ) as Array<[CellKey, SiteTile]>;
  },

  getUntappedSitesCount: (who) => {
    const state = get();
    const owner = who === "p1" ? 1 : 2;
    let count = 0;
    for (const site of Object.values(state.board.sites)) {
      if (site.owner === owner && !site.tapped) count++;
    }
    return count;
  },

  getAvailableMana: (who) => {
    const state = get();
    const base = computeAvailableMana(state.board, state.permanents, who);
    const offset = Number(state.players[who]?.mana || 0);
    return Math.max(0, base + offset);
  },

  getThresholdTotals: (who) => {
    const state = get();
    return getCachedThresholdTotals(state, who);
  },

  addMana: (who, delta) =>
    set((state) => {
      const current = Number(state.players[who]?.mana || 0);
      const next = current + delta;
      if (next === current) return state as GameState;

      const newState = {
        players: {
          ...state.players,
          [who]: {
            ...state.players[who],
            mana: next,
          },
        },
      } as Partial<GameState> as GameState;

      const patch: ServerPatchT = { players: newState.players };
      get().trySendPatch(patch);

      return newState;
    }),

  addThreshold: (who, element, delta) =>
    set((state) => {
      const currentThreshold = state.players[who].thresholds[element];
      const newThreshold = Math.max(0, currentThreshold + delta);

      const newState = {
        players: {
          ...state.players,
          [who]: {
            ...state.players[who],
            thresholds: {
              ...state.players[who].thresholds,
              [element]: newThreshold,
            },
          },
        },
      };

      const patch = { players: newState.players };
      get().trySendPatch(patch);

      if (currentThreshold !== newThreshold) {
        const changeText = delta > 0 ? `gains` : `loses`;
        const elementEmoji =
          element === "fire"
            ? "🔥"
            : element === "water"
            ? "💧"
            : element === "earth"
            ? "🌍"
            : "💨";
        get().log(
          `${who.toUpperCase()} ${changeText} ${Math.abs(
            delta
          )} ${elementEmoji} ${element} threshold (${currentThreshold} → ${newThreshold})`
        );
      }

      return newState;
    }),
});
