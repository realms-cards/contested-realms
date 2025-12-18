import type { StateCreator } from "zustand";
import type {
  GameState,
  PlayerKey,
  PortalPlayerState,
  PortalState,
  ServerPatchT,
} from "./types";

/**
 * Creates the initial empty portal player state
 */
export function createEmptyPortalPlayerState(): PortalPlayerState {
  return {
    rolls: [],
    tileNumbers: [],
    rollPhase: "pending",
  };
}

/**
 * Creates the initial portal state (null by default, initialized when Harbinger detected)
 */
export function createInitialPortalState(): PortalState | null {
  return null;
}

type PortalStateSlice = Pick<
  GameState,
  | "portalState"
  | "initPortalState"
  | "setPortalCurrentRoller"
  | "rollPortalDie"
  | "rerollPortalDie"
  | "finalizePortalRolls"
  | "completePortalSetup"
>;

export const createPortalSlice: StateCreator<
  GameState,
  [],
  [],
  PortalStateSlice
> = (set, get) => ({
  portalState: createInitialPortalState(),

  /**
   * Initialize portal state when Harbinger avatar(s) are detected.
   * Called during game setup after avatars are placed.
   */
  initPortalState: (harbingerSeats: PlayerKey[]) => {
    if (harbingerSeats.length === 0) {
      set({ portalState: null } as Partial<GameState> as GameState);
      return;
    }

    const newState: PortalState = {
      harbingerSeats,
      p1: harbingerSeats.includes("p1") ? createEmptyPortalPlayerState() : null,
      p2: harbingerSeats.includes("p2") ? createEmptyPortalPlayerState() : null,
      // P1 rolls first if both have Harbinger, otherwise the single Harbinger
      currentRoller: harbingerSeats.includes("p1") ? "p1" : "p2",
      setupComplete: false,
    };

    const patch: ServerPatchT = { portalState: newState };
    get().trySendPatch(patch);
    set({ portalState: newState } as Partial<GameState> as GameState);
    get().log(
      `Harbinger portal setup initiated for ${harbingerSeats.join(" and ")}`
    );
  },

  /**
   * Set the current player who is rolling (for sequential dual-harbinger flow)
   */
  setPortalCurrentRoller: (seat: PlayerKey | null) =>
    set((state) => {
      if (!state.portalState) return state;

      const newPortalState: PortalState = {
        ...state.portalState,
        currentRoller: seat,
      };

      const patch: ServerPatchT = { portalState: newPortalState };
      get().trySendPatch(patch);

      return { portalState: newPortalState } as Partial<GameState> as GameState;
    }),

  /**
   * Roll a single D20 die for portal placement.
   * dieIndex is 0, 1, or 2 for the three dice.
   */
  rollPortalDie: (seat: PlayerKey, dieIndex: number) =>
    set((state) => {
      if (!state.portalState) return state;

      const playerState = state.portalState[seat];
      if (!playerState) return state;

      // Generate roll (1-20)
      const roll = Math.floor(Math.random() * 20) + 1;

      // Update rolls array
      const newRolls = [...playerState.rolls];
      newRolls[dieIndex] = roll;

      const newPlayerState: PortalPlayerState = {
        ...playerState,
        rolls: newRolls,
        rollPhase: "rolling",
      };

      const newPortalState: PortalState = {
        ...state.portalState,
        [seat]: newPlayerState,
      };

      const patch: ServerPatchT = { portalState: newPortalState };
      get().trySendPatch(patch);
      get().log(
        `${seat.toUpperCase()} rolled ${roll} for portal die ${dieIndex + 1}`
      );

      return { portalState: newPortalState } as Partial<GameState> as GameState;
    }),

  /**
   * Reroll a specific die that had a duplicate value.
   */
  rerollPortalDie: (seat: PlayerKey, dieIndex: number) =>
    set((state) => {
      if (!state.portalState) return state;

      const playerState = state.portalState[seat];
      if (!playerState) return state;

      // Generate new roll (1-20)
      const roll = Math.floor(Math.random() * 20) + 1;

      // Update rolls array
      const newRolls = [...playerState.rolls];
      const oldRoll = newRolls[dieIndex];
      newRolls[dieIndex] = roll;

      const newPlayerState: PortalPlayerState = {
        ...playerState,
        rolls: newRolls,
      };

      const newPortalState: PortalState = {
        ...state.portalState,
        [seat]: newPlayerState,
      };

      const patch: ServerPatchT = { portalState: newPortalState };
      get().trySendPatch(patch);
      get().log(
        `${seat.toUpperCase()} rerolled die ${
          dieIndex + 1
        }: ${oldRoll} → ${roll}`
      );

      return { portalState: newPortalState } as Partial<GameState> as GameState;
    }),

  /**
   * Finalize the portal rolls for a player after all duplicates are resolved.
   * Converts rolls to tile numbers and marks the player's roll phase complete.
   */
  finalizePortalRolls: (seat: PlayerKey) =>
    set((state) => {
      if (!state.portalState) return state;

      const playerState = state.portalState[seat];
      if (!playerState) return state;

      // Check for duplicates
      const rolls = playerState.rolls;
      const uniqueRolls = new Set(rolls);
      if (uniqueRolls.size !== rolls.length) {
        get().log(
          `${seat.toUpperCase()} has duplicate rolls - reroll required`
        );
        return state;
      }

      // Rolls are tile numbers (1-20 maps directly to tiles 1-20)
      const tileNumbers = [...rolls].sort((a, b) => a - b);

      const newPlayerState: PortalPlayerState = {
        ...playerState,
        tileNumbers,
        rollPhase: "complete",
      };

      // Determine next roller if dual-harbinger
      let nextRoller: PlayerKey | null = null;
      const { harbingerSeats } = state.portalState;
      if (
        harbingerSeats.length === 2 &&
        seat === "p1" &&
        state.portalState.p2?.rollPhase !== "complete"
      ) {
        nextRoller = "p2";
      }

      const newPortalState: PortalState = {
        ...state.portalState,
        [seat]: newPlayerState,
        currentRoller: nextRoller,
      };

      const patch: ServerPatchT = { portalState: newPortalState };
      get().trySendPatch(patch);
      get().log(
        `${seat.toUpperCase()} finalized portal tiles: ${tileNumbers.join(
          ", "
        )}`
      );

      return { portalState: newPortalState } as Partial<GameState> as GameState;
    }),

  /**
   * Complete the entire portal setup phase (called when all Harbinger players have finished rolling)
   */
  completePortalSetup: () =>
    set((state) => {
      if (!state.portalState) return state;

      const newPortalState: PortalState = {
        ...state.portalState,
        currentRoller: null,
        setupComplete: true,
      };

      const patch: ServerPatchT = { portalState: newPortalState };
      get().trySendPatch(patch);
      get().log("Harbinger portal setup complete");

      return { portalState: newPortalState } as Partial<GameState> as GameState;
    }),
});

/**
 * Helper: Check if all rolls for a player are unique (no duplicates)
 */
export function hasNoDuplicateRolls(rolls: number[]): boolean {
  return new Set(rolls).size === rolls.length;
}

/**
 * Helper: Check if portal setup is truly complete for all Harbinger players.
 * Returns true only if:
 * - portalState.setupComplete is true, AND
 * - All harbinger players have exactly 3 unique tile numbers assigned
 */
export function arePortalsFullyAssigned(
  portalState: PortalState | null
): boolean {
  if (!portalState) return false;
  if (!portalState.setupComplete) return false;

  const { harbingerSeats, p1, p2 } = portalState;

  // Check each Harbinger player has 3 unique tiles assigned
  for (const seat of harbingerSeats) {
    const playerState = seat === "p1" ? p1 : p2;
    if (!playerState) return false;
    if (playerState.tileNumbers.length !== 3) return false;
    if (new Set(playerState.tileNumbers).size !== 3) return false;
  }

  return true;
}

/**
 * Helper: Check if a Harbinger game needs portal phase to run.
 * Returns true if any Harbinger player is missing their portal tiles.
 */
export function needsPortalPhaseForHarbinger(
  portalState: PortalState | null,
  harbingerSeats: PlayerKey[]
): boolean {
  // No Harbinger players, no portal phase needed
  if (harbingerSeats.length === 0) return false;

  // No portal state initialized yet - need to run portal phase
  if (!portalState) return true;

  // Portal state exists but not complete
  if (!portalState.setupComplete) return true;

  // Portal state complete but tiles not properly assigned
  if (!arePortalsFullyAssigned(portalState)) return true;

  return false;
}

/**
 * Helper: Find indices of duplicate rolls (returns ALL duplicate indices)
 */
export function findDuplicateIndices(rolls: number[]): number[] {
  const seen = new Map<number, number[]>();
  rolls.forEach((roll, index) => {
    const existing = seen.get(roll);
    if (existing) {
      existing.push(index);
    } else {
      seen.set(roll, [index]);
    }
  });

  const duplicateIndices: number[] = [];
  for (const indices of seen.values()) {
    if (indices.length > 1) {
      // All indices with this value are duplicates
      duplicateIndices.push(...indices);
    }
  }

  return duplicateIndices;
}

/**
 * Helper: Find the index of the last die that caused a duplicate.
 * Only returns the highest index that has a duplicate value (the most recently rolled duplicate).
 * Returns -1 if no duplicates exist.
 */
export function findLastDuplicateIndex(rolls: number[]): number {
  const seen = new Map<number, number[]>();
  rolls.forEach((roll, index) => {
    const existing = seen.get(roll);
    if (existing) {
      existing.push(index);
    } else {
      seen.set(roll, [index]);
    }
  });

  // Find the highest index among all duplicate groups
  let lastDuplicateIndex = -1;
  for (const indices of seen.values()) {
    if (indices.length > 1) {
      // Get the last (highest) index in this duplicate group
      const maxIndex = Math.max(...indices);
      if (maxIndex > lastDuplicateIndex) {
        lastDuplicateIndex = maxIndex;
      }
    }
  }

  return lastDuplicateIndex;
}

/**
 * Helper: Convert tile number (1-20) to cell coordinates.
 *
 * Sorcery TCG tile numbering (from player's perspective):
 * - Tile 1 is at player's bottom-left corner
 * - Tile 5 is at player's bottom-right corner
 * - Tile 16 is at opponent's top-left corner
 * - Tile 20 is at opponent's top-right corner
 *
 * Row-major order from player's view:
 * - Tiles 1-5: bottom row (y=0)
 * - Tiles 6-10: second row (y=1)
 * - Tiles 11-15: third row (y=2)
 * - Tiles 16-20: top row (y=3)
 *
 * Board is 5x4 (w=5, h=4), y=0 is bottom, y=3 is top.
 */
export function tileNumberToCoords(
  tileNumber: number,
  boardWidth: number = 5
): [number, number] {
  // tileNumber 1-20 maps to rows 0-3 from bottom
  // Row 0 (bottom, y=0): tiles 1-5
  // Row 1 (y=1): tiles 6-10
  // Row 2 (y=2): tiles 11-15
  // Row 3 (top, y=3): tiles 16-20
  const zeroIndexed = tileNumber - 1;
  const row = Math.floor(zeroIndexed / boardWidth);
  const col = zeroIndexed % boardWidth;
  // Row directly maps to y coordinate (no inversion needed)
  return [col, row];
}

/**
 * Helper: Check if a cell coordinate is a portal for either player
 */
export function isPortalTile(
  x: number,
  y: number,
  portalState: PortalState | null
): { isPortal: boolean; owner: PlayerKey | null } {
  if (!portalState) {
    return { isPortal: false, owner: null };
  }

  const checkPlayer = (seat: PlayerKey): boolean => {
    const playerState = portalState[seat];
    if (!playerState || playerState.tileNumbers.length === 0) {
      return false;
    }

    return playerState.tileNumbers.some((tileNum) => {
      const [tx, ty] = tileNumberToCoords(tileNum);
      return tx === x && ty === y;
    });
  };

  if (checkPlayer("p1")) {
    return { isPortal: true, owner: "p1" };
  }
  if (checkPlayer("p2")) {
    return { isPortal: true, owner: "p2" };
  }

  return { isPortal: false, owner: null };
}
