/**
 * Attack of the Realm Eater - Mana State Slice
 *
 * Handles shared mana pool for all players (key AOTRE mechanic)
 */

import type { StateCreator } from "zustand";
import type { Thresholds } from "@/lib/game/store";
import { EMPTY_THRESHOLDS } from "../../constants";
import type { AotreStore } from "../../types";

/** Initial mana state */
const initialManaState = {
  sharedMana: 0,
  sharedThresholds: { ...EMPTY_THRESHOLDS } as Thresholds,
  manaSpentThisRound: 0,
};

type ManaState = typeof initialManaState;

export interface ManaSlice extends ManaState {
  getSharedMana: () => number;
  spendMana: (amount: number) => boolean;
  recalculateMana: () => void;
  resetManaForRound: () => void;
  canAffordCost: (
    manaCost: number,
    thresholds?: Partial<Thresholds>,
  ) => boolean;
}

export const createManaSlice: StateCreator<AotreStore, [], [], ManaSlice> = (
  set,
  get,
) => ({
  ...initialManaState,

  /**
   * Get current available shared mana
   */
  getSharedMana: () => {
    const state = get();
    return state.sharedMana;
  },

  /**
   * Spend mana from the shared pool
   * Returns true if successful, false if insufficient mana
   */
  spendMana: (amount) => {
    const state = get();

    if (amount > state.sharedMana) {
      return false;
    }

    set({
      sharedMana: state.sharedMana - amount,
      manaSpentThisRound: state.manaSpentThisRound + amount,
    });

    return true;
  },

  /**
   * Recalculate total mana and thresholds from all active sites
   * Called whenever a site is added, removed, or changes state
   */
  recalculateMana: () => {
    const state = get();
    let totalMana = 0;
    const totalThresholds: Thresholds = {
      air: 0,
      water: 0,
      earth: 0,
      fire: 0,
    };

    // Sum up mana and thresholds from all site tiles
    let siteCount = 0;
    for (const tile of Object.values(state.tiles)) {
      if (tile.state === "site") {
        siteCount++;
        totalMana += tile.manaValue;

        if (tile.thresholds) {
          totalThresholds.air += tile.thresholds.air ?? 0;
          totalThresholds.water += tile.thresholds.water ?? 0;
          totalThresholds.earth += tile.thresholds.earth ?? 0;
          totalThresholds.fire += tile.thresholds.fire ?? 0;
        }
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.log(
        `[AOTRE] Recalculated mana from ${siteCount} sites: ${totalMana} mana, thresholds:`,
        totalThresholds,
      );
    }

    set({
      sharedMana: totalMana,
      sharedThresholds: totalThresholds,
    });
  },

  /**
   * Reset mana spent counter for a new round
   * Called at the start of each player turn phase
   */
  resetManaForRound: () => {
    // Recalculate from sites (mana refills each round)
    get().recalculateMana();

    set({
      manaSpentThisRound: 0,
    });
  },

  /**
   * Check if a card cost can be afforded (mana AND thresholds)
   */
  canAffordCost: (manaCost, thresholds) => {
    const state = get();

    // Check mana
    if (manaCost > state.sharedMana) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[AOTRE] Cannot afford: need ${manaCost} mana, have ${state.sharedMana}`,
        );
      }
      return false;
    }

    // Check thresholds - MUST have enough of each element
    if (thresholds) {
      const shared = state.sharedThresholds;
      const airNeeded = thresholds.air ?? 0;
      const waterNeeded = thresholds.water ?? 0;
      const earthNeeded = thresholds.earth ?? 0;
      const fireNeeded = thresholds.fire ?? 0;

      if (airNeeded > shared.air) {
        if (process.env.NODE_ENV === "development") {
          console.log(
            `[AOTRE] Cannot afford: need ${airNeeded} air, have ${shared.air}`,
          );
        }
        return false;
      }
      if (waterNeeded > shared.water) {
        if (process.env.NODE_ENV === "development") {
          console.log(
            `[AOTRE] Cannot afford: need ${waterNeeded} water, have ${shared.water}`,
          );
        }
        return false;
      }
      if (earthNeeded > shared.earth) {
        if (process.env.NODE_ENV === "development") {
          console.log(
            `[AOTRE] Cannot afford: need ${earthNeeded} earth, have ${shared.earth}`,
          );
        }
        return false;
      }
      if (fireNeeded > shared.fire) {
        if (process.env.NODE_ENV === "development") {
          console.log(
            `[AOTRE] Cannot afford: need ${fireNeeded} fire, have ${shared.fire}`,
          );
        }
        return false;
      }
    }

    return true;
  },
});
