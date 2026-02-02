/**
 * Attack of the Realm Eater - Combat State Slice
 *
 * Handles combat resolution
 */

import type { StateCreator } from "zustand";
import type { AotreStore } from "../../types";
import type { AotreCombat } from "../../types/entities";

/** Initial combat state */
const initialCombatState = {
  activeCombat: null as AotreCombat | null,
};

type CombatState = typeof initialCombatState;

export interface CombatSlice extends CombatState {
  resolveCombat: () => void;
  clearCombat: () => void;
}

export const createCombatSlice: StateCreator<
  AotreStore,
  [],
  [],
  CombatSlice
> = (set, get) => ({
  ...initialCombatState,

  /**
   * Resolve the active combat
   */
  resolveCombat: () => {
    const state = get();
    const combat = state.activeCombat;

    if (!combat || combat.resolved) return;

    const damage = combat.damage;

    // Apply damage based on defender type
    switch (combat.defender.type) {
      case "realm_eater":
        // Damage the Realm Eater
        get().dealDamageToRealmEater(damage);
        set({
          aiActionLog: [
            ...state.aiActionLog,
            `Realm Eater takes ${damage} damage!`,
          ],
        });
        break;

      case "realm_eater_minion":
        // Damage the minion
        const destroyed = get().dealDamageToMinion(combat.defender.id, damage);
        if (destroyed) {
          set({
            aiActionLog: [
              ...state.aiActionLog,
              `Minion destroyed!`,
            ],
          });
        }
        break;

      case "player_avatar":
        // Find which player's avatar
        for (const [slot, player] of Object.entries(state.players)) {
          if (player && player.avatarPosition === combat.defender.position) {
            get().dealDamageToAvatar(slot as "player1" | "player2" | "player3" | "player4", damage);
            break;
          }
        }
        break;

      case "player_unit":
        // Damage player unit (simplified - just remove it)
        const [cellKey, indexStr] = combat.defender.id.split(":");
        const index = parseInt(indexStr, 10);
        if (!isNaN(index)) {
          get().removePermanent(cellKey, index);
        }
        break;

      case "site":
        // Sites can't be directly damaged by units in AOTRE
        // (Sites are consumed by Realm Eater movement)
        break;
    }

    // Mark combat as resolved
    set({
      activeCombat: {
        ...combat,
        resolved: true,
      },
    });

    // Clear combat after a short delay (for UI purposes)
    setTimeout(() => {
      get().clearCombat();
    }, 100);
  },

  /**
   * Clear the active combat
   */
  clearCombat: () => {
    set({ activeCombat: null });
  },
});
