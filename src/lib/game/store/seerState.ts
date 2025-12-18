import type { StateCreator } from "zustand";
import type { GameState, PlayerKey, SeerState, ServerPatchT } from "./types";

/**
 * Creates the initial seer state (null by default, initialized when seer phase starts)
 */
export function createInitialSeerState(): SeerState | null {
  return null;
}

type SeerStateSlice = Pick<
  GameState,
  | "seerState"
  | "initSeerState"
  | "setSeerPile"
  | "revealSeerCard"
  | "completeSeer"
>;

export const createSeerSlice: StateCreator<
  GameState,
  [],
  [],
  SeerStateSlice
> = (set, get) => ({
  seerState: createInitialSeerState(),

  /**
   * Initialize seer state when the seer phase begins.
   * Called after mulligan phase completes.
   */
  initSeerState: (secondSeat: PlayerKey) => {
    const newState: SeerState = {
      secondSeat,
      status: "pending",
      chosenPile: null,
      decision: null,
      setupComplete: false,
    };

    const patch: ServerPatchT = { seerState: newState };
    get().trySendPatch(patch);
    set({ seerState: newState } as Partial<GameState> as GameState);
    get().log(
      `Second Player Seer phase initiated for ${secondSeat.toUpperCase()}`
    );
  },

  /**
   * Set which pile the second player wants to scry
   */
  setSeerPile: (pile: "spellbook" | "atlas") =>
    set((state) => {
      if (!state.seerState) return state;
      if (state.seerState.setupComplete) return state;

      const newSeerState: SeerState = {
        ...state.seerState,
        chosenPile: pile,
      };

      const patch: ServerPatchT = { seerState: newSeerState };
      get().trySendPatch(patch);
      get().log(
        `Seer: ${state.seerState.secondSeat.toUpperCase()} chose ${pile}`
      );

      return { seerState: newSeerState } as Partial<GameState> as GameState;
    }),

  /**
   * Reveal the top card of the chosen pile
   */
  revealSeerCard: () =>
    set((state) => {
      if (!state.seerState) return state;
      if (state.seerState.setupComplete) return state;
      if (!state.seerState.chosenPile) return state;

      const newSeerState: SeerState = {
        ...state.seerState,
        status: "revealed",
      };

      const patch: ServerPatchT = { seerState: newSeerState };
      get().trySendPatch(patch);
      get().log(
        `Seer: ${state.seerState.secondSeat.toUpperCase()} revealed top of ${
          state.seerState.chosenPile
        }`
      );

      return { seerState: newSeerState } as Partial<GameState> as GameState;
    }),

  /**
   * Complete the seer phase with the player's decision
   */
  completeSeer: (decision: "top" | "bottom" | "skip") =>
    set((state) => {
      if (!state.seerState) return state;
      if (state.seerState.setupComplete) return state;

      const { secondSeat, chosenPile } = state.seerState;

      // Apply the scry effect if not skipping
      if (decision !== "skip" && chosenPile) {
        // Call scryTop to actually move the card
        get().scryTop(secondSeat, chosenPile, decision);
      }

      const newSeerState: SeerState = {
        ...state.seerState,
        status: decision === "skip" ? "skipped" : "completed",
        decision,
        setupComplete: true,
      };

      const patch: ServerPatchT = { seerState: newSeerState };
      get().trySendPatch(patch);

      const actionText =
        decision === "skip"
          ? "skipped seer"
          : decision === "top"
          ? "kept card on top"
          : "put card on bottom";
      get().log(`Seer: ${secondSeat.toUpperCase()} ${actionText}`);

      return { seerState: newSeerState } as Partial<GameState> as GameState;
    }),
});

/**
 * Helper: Check if seer phase is complete
 */
export function isSeerComplete(seerState: SeerState | null): boolean {
  if (!seerState) return false;
  return seerState.setupComplete;
}

/**
 * Helper: Check if seer phase needs to run for the second player
 */
export function needsSeerPhase(
  seerState: SeerState | null,
  secondSeat: PlayerKey | null
): boolean {
  // No second seat determined yet
  if (!secondSeat) return false;

  // No seer state initialized yet - need to run seer phase
  if (!seerState) return true;

  // Seer state exists but not complete
  if (!seerState.setupComplete) return true;

  return false;
}
