/**
 * Attack of the Realm Eater - Minions State Slice
 *
 * Handles Realm Eater minion tracking and management
 */

import { v4 as uuidv4 } from "uuid";
import type { StateCreator } from "zustand";
import type { CellKey, CardRef } from "@/lib/game/store";
import type { AotreStore } from "../../types";
import type { MinionEntity } from "../../types/entities";

/** Initial minions state */
const initialMinionsState = {
  minions: [] as MinionEntity[],
};

type MinionsState = typeof initialMinionsState;

export interface MinionsSlice extends MinionsState {
  spawnMinion: (card: CardRef, position: CellKey) => MinionEntity;
  removeMinion: (minionId: string) => MinionEntity | null;
  moveMinion: (minionId: string, newPosition: CellKey) => boolean;
  tapMinion: (minionId: string) => void;
  untapAllMinions: () => void;
  dealDamageToMinion: (minionId: string, damage: number) => boolean;
  getMinionAt: (position: CellKey) => MinionEntity | undefined;
  getMinionsAt: (position: CellKey) => MinionEntity[];
  getMinionById: (minionId: string) => MinionEntity | undefined;
  getUntappedMinions: () => MinionEntity[];
}

/**
 * Generate a unique minion ID
 */
function generateMinionId(): string {
  return `minion-${uuidv4()}`;
}

export const createMinionsSlice: StateCreator<
  AotreStore,
  [],
  [],
  MinionsSlice
> = (set, get) => ({
  ...initialMinionsState,

  /**
   * Spawn a new minion at the specified position
   */
  spawnMinion: (card, position) => {
    const state = get();
    const turn = state.turn;

    const minion: MinionEntity = {
      id: generateMinionId(),
      position,
      card,
      health: card.defence ?? 1,
      attack: card.attack ?? 1,
      tapped: false,
      summonedOnTurn: turn,
      owner: "realm_eater",
    };

    set({
      minions: [...state.minions, minion],
    });

    // Log the spawn
    set({
      aiActionLog: [
        ...state.aiActionLog,
        `Realm Eater spawns ${card.name} at ${position}`,
      ],
    });

    return minion;
  },

  /**
   * Remove a minion from the board (destroyed)
   */
  removeMinion: (minionId) => {
    const state = get();
    const minionIndex = state.minions.findIndex((m) => m.id === minionId);

    if (minionIndex === -1) return null;

    const minion = state.minions[minionIndex];
    const newMinions = [...state.minions];
    newMinions.splice(minionIndex, 1);

    set({ minions: newMinions });

    // Add to Realm Eater's minion graveyard
    set({
      realmEater: {
        ...state.realmEater,
        minionGraveyard: [...state.realmEater.minionGraveyard, minion.card],
      },
    });

    return minion;
  },

  /**
   * Move a minion to a new position
   */
  moveMinion: (minionId, newPosition) => {
    const state = get();
    const minionIndex = state.minions.findIndex((m) => m.id === minionId);

    if (minionIndex === -1) return false;

    const newMinions = [...state.minions];
    const oldPosition = newMinions[minionIndex].position;
    newMinions[minionIndex] = {
      ...newMinions[minionIndex],
      position: newPosition,
    };

    set({ minions: newMinions });

    // Log the movement
    set({
      aiActionLog: [
        ...state.aiActionLog,
        `Minion ${state.minions[minionIndex].card.name} moves from ${oldPosition} to ${newPosition}`,
      ],
    });

    return true;
  },

  /**
   * Tap a minion (mark as having acted this turn)
   */
  tapMinion: (minionId) => {
    const state = get();
    const minionIndex = state.minions.findIndex((m) => m.id === minionId);

    if (minionIndex === -1) return;

    const newMinions = [...state.minions];
    newMinions[minionIndex] = {
      ...newMinions[minionIndex],
      tapped: true,
    };

    set({ minions: newMinions });
  },

  /**
   * Untap all minions (at start of Realm Eater turn)
   */
  untapAllMinions: () => {
    const state = get();
    const newMinions = state.minions.map((minion) => ({
      ...minion,
      tapped: false,
    }));

    set({ minions: newMinions });
  },

  /**
   * Deal damage to a minion
   * Returns true if minion was destroyed
   */
  dealDamageToMinion: (minionId, damage) => {
    const state = get();
    const minionIndex = state.minions.findIndex((m) => m.id === minionId);

    if (minionIndex === -1) return false;

    const minion = state.minions[minionIndex];
    const newHealth = minion.health - damage;

    if (newHealth <= 0) {
      // Minion is destroyed
      get().removeMinion(minionId);
      return true;
    }

    // Update minion health
    const newMinions = [...state.minions];
    newMinions[minionIndex] = {
      ...newMinions[minionIndex],
      health: newHealth,
    };

    set({ minions: newMinions });
    return false;
  },

  /**
   * Get the first minion at a position
   */
  getMinionAt: (position) => {
    return get().minions.find((m) => m.position === position);
  },

  /**
   * Get all minions at a position
   */
  getMinionsAt: (position) => {
    return get().minions.filter((m) => m.position === position);
  },

  /**
   * Get a minion by ID
   */
  getMinionById: (minionId) => {
    return get().minions.find((m) => m.id === minionId);
  },

  /**
   * Get all untapped minions
   */
  getUntappedMinions: () => {
    return get().minions.filter((m) => !m.tapped);
  },
});
