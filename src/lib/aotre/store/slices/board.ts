/**
 * Attack of the Realm Eater - Board State Slice
 *
 * Handles board tiles, site placement, and tile state transitions
 */

import type { StateCreator } from "zustand";
import type { CellKey, CardRef } from "@/lib/game/store";
import { BOARD_CONFIGS, DEFAULT_SITE_MANA_VALUE } from "../../constants";
import type { AotreStore } from "../../types";
import type { AotreTile, TileState } from "../../types/entities";

/** Initial board state */
const initialBoardState = {
  tiles: {} as Record<CellKey, AotreTile>,
  permanents: {} as Record<CellKey, CardRef[]>,
  summoningSickness: new Set<string>(),
};

type BoardState = typeof initialBoardState;

export interface BoardSlice extends BoardState {
  initializeBoard: (playerCount: 1 | 2 | 3 | 4, siteCards: CardRef[]) => void;
  getTile: (cellKey: CellKey) => AotreTile | undefined;
  setTileState: (cellKey: CellKey, newState: TileState) => void;
  consumeSite: (cellKey: CellKey) => CardRef | null;
  transitionRubbleToVoid: () => void;
  addPermanent: (cellKey: CellKey, card: CardRef) => void;
  removePermanent: (cellKey: CellKey, index: number) => CardRef | null;
  movePermanent: (fromCell: CellKey, index: number, toCell: CellKey) => boolean;
  hasSummoningSickness: (instanceId: string) => boolean;
  clearSummoningSickness: () => void;
}

/**
 * Generate a cell key from x,y coordinates
 */
export function cellKey(x: number, y: number): CellKey {
  return `${x},${y}`;
}

/**
 * Parse a cell key into x,y coordinates
 */
export function parseKey(key: CellKey): [number, number] {
  const [x, y] = key.split(",").map(Number);
  return [x, y];
}

/**
 * Check if a cell is within board bounds
 */
export function isInBounds(
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

/**
 * Get adjacent cell keys (orthogonal only)
 */
export function getAdjacentCells(
  key: CellKey,
  width: number,
  height: number
): CellKey[] {
  const [x, y] = parseKey(key);
  const adjacent: CellKey[] = [];

  const directions = [
    [0, -1], // up
    [0, 1], // down
    [-1, 0], // left
    [1, 0], // right
  ];

  for (const [dx, dy] of directions) {
    const nx = x + dx;
    const ny = y + dy;
    if (isInBounds(nx, ny, width, height)) {
      adjacent.push(cellKey(nx, ny));
    }
  }

  return adjacent;
}

export const createBoardSlice: StateCreator<AotreStore, [], [], BoardSlice> = (
  set,
  get
) => ({
  ...initialBoardState,

  /**
   * Initialize the board with pre-filled sites
   */
  initializeBoard: (playerCount, siteCards) => {
    const config = BOARD_CONFIGS[playerCount];
    const tiles: Record<CellKey, AotreTile> = {};

    let siteIndex = 0;

    // Create tiles for each cell
    for (let y = 0; y < config.size.h; y++) {
      for (let x = 0; x < config.size.w; x++) {
        const key = cellKey(x, y);

        // Check if this is a corner space that should be excluded (for 3-4 players)
        const isCorner =
          (playerCount >= 3 &&
            ((x === 0 && y === 0) || (x === config.size.w - 1 && y === 0))) ||
          (playerCount === 4 &&
            ((x === 0 && y === config.size.h - 1) ||
              (x === config.size.w - 1 && y === config.size.h - 1)));

        if (isCorner) {
          // Create void tile for corner spaces
          tiles[key] = {
            cellKey: key,
            state: "void",
            site: null,
            owner: "neutral",
            manaValue: 0,
            thresholds: null,
            rubbleSinceTurn: null,
          };
        } else {
          // Create site tile
          const siteCard = siteCards[siteIndex % siteCards.length];
          siteIndex++;

          tiles[key] = {
            cellKey: key,
            state: "site",
            site: siteCard,
            owner: "neutral", // All sites start neutral in AOTRE
            manaValue: DEFAULT_SITE_MANA_VALUE,
            thresholds: siteCard?.thresholds ?? null,
            rubbleSinceTurn: null,
          };
        }
      }
    }

    set({
      tiles,
      permanents: {},
      boardSize: config.size,
    });
  },

  /**
   * Get a tile by its cell key
   */
  getTile: (cellKey) => {
    return get().tiles[cellKey];
  },

  /**
   * Set the state of a tile (site -> rubble -> void)
   */
  setTileState: (cellKey, newState) => {
    const state = get();
    const tile = state.tiles[cellKey];

    if (!tile) return;

    set({
      tiles: {
        ...state.tiles,
        [cellKey]: {
          ...tile,
          state: newState,
          site: newState === "void" ? null : tile.site,
          manaValue: newState === "site" ? tile.manaValue : 0,
          thresholds: newState === "site" ? tile.thresholds : null,
          rubbleSinceTurn: newState === "rubble" ? state.turn : null,
        },
      },
    });

    // Recalculate mana after state change
    get().recalculateMana();
  },

  /**
   * Consume a site (Realm Eater moves through it)
   * Returns the site card that was consumed (added to RE's hand)
   */
  consumeSite: (cellKey) => {
    const state = get();
    const tile = state.tiles[cellKey];

    if (!tile || tile.state !== "site") return null;

    const consumedSite = tile.site;

    // Convert site to rubble
    set({
      tiles: {
        ...state.tiles,
        [cellKey]: {
          ...tile,
          state: "rubble",
          manaValue: 0,
          thresholds: null,
          rubbleSinceTurn: state.turn,
        },
      },
    });

    // Recalculate mana
    get().recalculateMana();

    return consumedSite;
  },

  /**
   * Transition all rubble tiles from previous turns to void
   * Called at the start of Realm Eater turn
   */
  transitionRubbleToVoid: () => {
    const state = get();
    const currentTurn = state.turn;
    const updatedTiles = { ...state.tiles };
    let changed = false;

    for (const [key, tile] of Object.entries(state.tiles)) {
      if (
        tile.state === "rubble" &&
        tile.rubbleSinceTurn !== null &&
        tile.rubbleSinceTurn < currentTurn
      ) {
        updatedTiles[key] = {
          ...tile,
          state: "void",
          site: null,
          manaValue: 0,
          thresholds: null,
          rubbleSinceTurn: null,
        };
        changed = true;
      }
    }

    if (changed) {
      set({ tiles: updatedTiles });
      get().recalculateMana();
    }
  },

  /**
   * Add a permanent (unit) to a cell
   * Units have summoning sickness when first played
   */
  addPermanent: (cellKey, card) => {
    const state = get();
    const existing = state.permanents[cellKey] ?? [];

    // Add to summoning sickness if card has an instanceId
    const newSummoningSickness = new Set(state.summoningSickness);
    if (card.instanceId) {
      newSummoningSickness.add(card.instanceId);
    }

    set({
      permanents: {
        ...state.permanents,
        [cellKey]: [...existing, card],
      },
      summoningSickness: newSummoningSickness,
    });
  },

  /**
   * Remove a permanent from a cell
   */
  removePermanent: (cellKey, index) => {
    const state = get();
    const existing = state.permanents[cellKey];

    if (!existing || index < 0 || index >= existing.length) return null;

    const removed = existing[index];
    const updated = [...existing];
    updated.splice(index, 1);

    set({
      permanents: {
        ...state.permanents,
        [cellKey]: updated.length > 0 ? updated : [],
      },
    });

    return removed;
  },

  /**
   * Move a permanent from one cell to another
   */
  movePermanent: (fromCell, index, toCell) => {
    const card = get().removePermanent(fromCell, index);

    if (!card) return false;

    // Don't re-add summoning sickness when moving (preserve sick state)
    const existing = get().permanents[toCell] ?? [];
    set({
      permanents: {
        ...get().permanents,
        [toCell]: [...existing, card],
      },
    });
    return true;
  },

  /**
   * Check if a unit has summoning sickness
   * Units with summoning sickness cannot move or attack
   */
  hasSummoningSickness: (instanceId) => {
    return get().summoningSickness.has(instanceId);
  },

  /**
   * Clear summoning sickness at end of turn
   * Called when player turn ends - their units lose summoning sickness
   */
  clearSummoningSickness: () => {
    set({ summoningSickness: new Set<string>() });
  },
});
