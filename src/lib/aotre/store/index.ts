/**
 * Attack of the Realm Eater - Store
 *
 * Zustand store for AOTRE game state, completely isolated from main game store
 */

import { create, type StateCreator, type StoreApi } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { AotreStore } from "../types";
import { createActionsSlice } from "./slices/actions";
import { createBoardSlice } from "./slices/board";
import { createCombatSlice } from "./slices/combat";
import { createCoreSlice } from "./slices/core";
import { createManaSlice } from "./slices/mana";
import { createMinionsSlice } from "./slices/minions";
import { createPlayersSlice } from "./slices/players";
import { createRealmEaterSlice } from "./slices/realm-eater";

/**
 * Combined store creator that merges all slices
 */
const createAotreStoreState: StateCreator<AotreStore> = (set, get, store) => ({
  ...createCoreSlice(set, get, store),
  ...createBoardSlice(set, get, store),
  ...createManaSlice(set, get, store),
  ...createPlayersSlice(set, get, store),
  ...createRealmEaterSlice(set, get, store),
  ...createMinionsSlice(set, get, store),
  ...createActionsSlice(set, get, store),
  ...createCombatSlice(set, get, store),
});

/**
 * Create a new AOTRE store instance
 */
export const createAotreStore = () =>
  create<AotreStore>()(subscribeWithSelector(createAotreStoreState));

/**
 * Default singleton store for the AOTRE route
 * Use this in components via useAotreStore hook
 */
export const useAotreStore = createAotreStore();

/**
 * Hook to get a specific slice of the store
 */
export function useAotreSelector<T>(selector: (state: AotreStore) => T): T {
  return useAotreStore(selector);
}

/**
 * Get the store API for direct access (useful for non-React contexts)
 */
export function getAotreStoreApi(): StoreApi<AotreStore> {
  return useAotreStore;
}

// Re-export types
export type { AotreStore } from "../types";
