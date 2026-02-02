/**
 * Attack of the Realm Eater - Core State Slice
 *
 * Handles game phases, turns, and win conditions
 */

import type { StateCreator } from "zustand";
import { executeRealmEaterAI } from "../../ai";
import {
  BOARD_CONFIGS,
  getActivePlayerSlots,
} from "../../constants";
import type { AotreStore, AotreGamePhase, RealmEaterAIPhase, Difficulty } from "../../types";
import type { PlayerSlot } from "../../types/player";

/** Initial state for core slice */
const initialCoreState = {
  // Configuration
  difficulty: "normal" as Difficulty,
  playerCount: 1 as 1 | 2 | 3 | 4,
  boardSize: BOARD_CONFIGS[1].size,

  // Phase state
  phase: "Setup" as AotreGamePhase,
  aiPhase: null as RealmEaterAIPhase | null,
  turn: 0,
  round: 1,

  // Game end state
  gameEnded: false,
  playersWon: null as boolean | null,
  endReason: null as string | null,

  // UI state
  selectedHandCard: null as { player: PlayerSlot; index: number } | null,
  selectedUnit: null as { cellKey: string; index: number } | null,
  showAIAnimation: true,
  aiActionLog: [] as string[],
};

type CoreState = typeof initialCoreState;

export interface CoreSlice extends CoreState {
  initializeGame: (
    playerCount: 1 | 2 | 3 | 4,
    difficulty: Difficulty,
    playerDecks: Array<{ avatarId: number; spellbookIds: number[]; atlasIds: number[] }>
  ) => void;
  resetGame: () => void;
  advanceTurn: () => void;
  executeRealmEaterTurn: () => Promise<void>;
  checkWinConditions: () => void;
  selectHandCard: (player: PlayerSlot, index: number) => void;
  clearHandSelection: () => void;
  selectUnit: (cellKey: string, index: number) => void;
  clearUnitSelection: () => void;
}

export const createCoreSlice: StateCreator<AotreStore, [], [], CoreSlice> = (
  set,
  get
) => ({
  ...initialCoreState,

  /**
   * Initialize a new game with the specified configuration
   */
  initializeGame: (playerCount, difficulty, _playerDecks) => {
    const boardConfig = BOARD_CONFIGS[playerCount];

    set({
      // Configuration
      difficulty,
      playerCount,
      boardSize: boardConfig.size,

      // Reset phase state
      phase: "Mulligan",
      aiPhase: null,
      turn: 1,
      round: 1,

      // Reset end state
      gameEnded: false,
      playersWon: null,
      endReason: null,

      // Reset UI state
      selectedHandCard: null,
      selectedUnit: null,
      aiActionLog: [],
    });

    // Initialize other slices (they will read playerCount and difficulty)
    // Board initialization handled by board slice
    // Player initialization handled by players slice
    // Realm Eater initialization handled by realm-eater slice
  },

  /**
   * Reset game to setup screen
   */
  resetGame: () => {
    set({
      ...initialCoreState,
      phase: "Setup",
    });
  },

  /**
   * Advance to the next turn/phase
   */
  advanceTurn: () => {
    const state = get();

    // During PlayerTurn, check if all players have passed
    if (state.phase === "PlayerTurn") {
      const activePlayers = getActivePlayerSlots(state.playerCount);
      const allPassed = activePlayers.every((slot) =>
        state.passedPlayers.has(slot)
      );

      if (allPassed) {
        // All players passed - start Realm Eater turn
        // Set aiPhase to null so PlayerActionPrompt will trigger executeRealmEaterTurn
        set({
          phase: "RealmEaterTurn",
          aiPhase: null,
          passedPlayers: new Set(),
        });
        return;
      }

      // Find next active player who hasn't passed
      const currentIndex = activePlayers.indexOf(state.activePlayer);
      for (let i = 1; i <= activePlayers.length; i++) {
        const nextIndex = (currentIndex + i) % activePlayers.length;
        const nextPlayer = activePlayers[nextIndex];
        if (!state.passedPlayers.has(nextPlayer)) {
          set({ activePlayer: nextPlayer });
          return;
        }
      }
    }

    // After Realm Eater turn, start new player turn
    if (state.phase === "RealmEaterTurn" && state.aiPhase === "End") {
      const activePlayers = getActivePlayerSlots(state.playerCount);

      // Clear summoning sickness at start of new player turn
      // In Sorcery, units lose summoning sickness at start of controller's turn
      get().clearSummoningSickness();

      set({
        phase: "PlayerTurn",
        aiPhase: null,
        turn: state.turn + 1,
        activePlayer: activePlayers[0],
        passedPlayers: new Set(),
        actionHistory: [],
      });

      // Check win conditions after each full round
      get().checkWinConditions();
    }
  },

  /**
   * Check if the game has ended (win or loss)
   */
  checkWinConditions: () => {
    const state = get();

    if (state.gameEnded) return;

    // Win condition: Realm Eater health <= 0
    if (state.realmEater.health <= 0) {
      set({
        gameEnded: true,
        playersWon: true,
        endReason: "The Realm Eater has been defeated!",
        phase: "GameEnd",
      });
      return;
    }

    // Loss condition 1: All player avatars dead
    const activePlayers = getActivePlayerSlots(state.playerCount);
    const allPlayersDead = activePlayers.every((slot) => {
      const player = state.players[slot];
      return player && !player.isAlive;
    });

    if (allPlayersDead) {
      set({
        gameEnded: true,
        playersWon: false,
        endReason: "All players have been defeated!",
        phase: "GameEnd",
      });
      return;
    }

    // Loss condition 2: All sites destroyed (all tiles are void)
    const allSitesDestroyed = Object.values(state.tiles).every(
      (tile) => tile.state === "void"
    );

    if (allSitesDestroyed) {
      set({
        gameEnded: true,
        playersWon: false,
        endReason: "The Realm has been consumed by the Void!",
        phase: "GameEnd",
      });
      return;
    }
  },

  /**
   * Select a card in a player's hand
   */
  selectHandCard: (player, index) => {
    set({ selectedHandCard: { player, index }, selectedUnit: null });
  },

  /**
   * Clear hand card selection
   */
  clearHandSelection: () => {
    set({ selectedHandCard: null });
  },

  /**
   * Select a unit on the board
   */
  selectUnit: (cellKey, index) => {
    set({ selectedUnit: { cellKey, index }, selectedHandCard: null });
  },

  /**
   * Clear unit selection
   */
  clearUnitSelection: () => {
    set({ selectedUnit: null });
  },

  /**
   * Execute the Realm Eater's complete turn
   * Uses the full AI engine for decision making
   */
  executeRealmEaterTurn: async () => {
    const state = get();

    if (state.phase !== "RealmEaterTurn") return;

    // Clear previous action log
    set({ aiActionLog: ["Realm Eater turn begins..."] });

    // Execute the full AI turn
    await executeRealmEaterAI(
      get,
      (partial) => set(partial as Partial<typeof state>)
    );

    // Advance to next player turn
    get().advanceTurn();
  },
});
