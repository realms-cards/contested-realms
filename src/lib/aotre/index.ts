/**
 * Attack of the Realm Eater (AOTRE)
 *
 * Solo/co-op game mode for Sorcery: Contested Realm
 * Based on the community variant by OOPMan
 * https://codeberg.org/OOPMan/attack-of-the-realm-eater
 *
 * This module is completely isolated from the main game codebase.
 */

// Types
export * from "./types";

// Constants
export * from "./constants";

// Store
export {
  useAotreStore,
  createAotreStore,
  useAotreSelector,
  getAotreStoreApi,
  type AotreStore,
} from "./store";

// Board utilities
export { cellKey, parseKey, isInBounds, getAdjacentCells } from "./store/slices/board";
