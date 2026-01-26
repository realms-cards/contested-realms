import type { StateCreator } from "zustand";
import type { CellKey, GameState, ServerPatchT, SiteTile } from "./types";
import {
  computeAvailableMana,
  getCachedThresholdTotals,
  siteProvidesMana,
} from "./utils/resourceHelpers";

type ResourceSlice = Pick<
  GameState,
  | "getPlayerSites"
  | "getUntappedSitesCount"
  | "getBaseMana"
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
      ([, site]) => site && site.owner === owner,
    ) as Array<[CellKey, SiteTile]>;
  },

  getUntappedSitesCount: (who) => {
    const state = get();
    const owner = who === "p1" ? 1 : 2;
    let count = 0;
    for (const site of Object.values(state.board.sites)) {
      if (!site) continue;
      if (site.owner === owner && !site.tapped) count++;
    }
    return count;
  },

  getBaseMana: (who) => {
    // Total mana = count of all sites that provide mana (sites don't tap)
    const state = get();
    const owner = who === "p1" ? 1 : 2;
    let total = 0;
    const siteKeys = Object.keys(state.board.sites);
    for (const site of Object.values(state.board.sites)) {
      if (!site) continue;
      if (site.owner === owner && siteProvidesMana(site.card ?? null)) {
        total++;
      }
    }
    // DEBUG: Log if base mana seems abnormally high (more than 20 sites is impossible)
    if (total > 20) {
      console.warn("[getBaseMana] Abnormal site count!", {
        who,
        owner,
        total,
        siteKeysCount: siteKeys.length,
        siteKeys: siteKeys.slice(0, 30), // Log first 30 keys
      });
    }
    return total;
  },

  getAvailableMana: (who) => {
    // Available mana = base mana from sites (with special site handling) + offset
    const state = get();
    const thresholds = getCachedThresholdTotals(state, who);
    const base = computeAvailableMana(
      state.board,
      state.permanents,
      who,
      state.zones,
      state.specialSiteState,
      thresholds,
    );
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

      // Only send the affected player's data to avoid overwriting opponent's state
      const patch: ServerPatchT = {
        players: { [who]: newState.players[who] } as GameState["players"],
      };
      get().trySendPatch(patch);

      if (currentThreshold !== newThreshold) {
        const changeText = delta > 0 ? `gains` : `loses`;
        get().log(
          `${who.toUpperCase()} ${changeText} ${Math.abs(
            delta,
          )} ${element} threshold (${currentThreshold} → ${newThreshold})`,
        );
      }

      return newState;
    }),
});
