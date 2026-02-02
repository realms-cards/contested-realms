/**
 * Attack of the Realm Eater - Players State Slice
 *
 * Handles 1-4 cooperative player state
 */

import type { StateCreator } from "zustand";
import type { CardRef } from "@/lib/game/store";
import {
  getActivePlayerSlots,
  PLAYER_STARTING_HAND_SIZE,
  DEFAULT_AVATAR_HEALTH,
  BOARD_CONFIGS,
} from "../../constants";
import type { AotreStore } from "../../types";
import type {
  PlayerSlot,
  CoopPlayer,
  PlayerAction,
  PlayerLifeState,
} from "../../types/player";

/** Initial players state */
const initialPlayersState = {
  players: {} as Partial<Record<PlayerSlot, CoopPlayer>>,
  activePlayer: "player1" as PlayerSlot,
  passedPlayers: new Set<PlayerSlot>(),
  actionHistory: [] as PlayerAction[],
};

type PlayersState = typeof initialPlayersState;

export interface PlayersSlice extends PlayersState {
  initializePlayers: (
    playerCount: 1 | 2 | 3 | 4,
    playerDecks: Array<{
      avatarId: number;
      spellbookIds: number[];
      atlasIds: number[];
    }>
  ) => void;
  getPlayer: (slot: PlayerSlot) => CoopPlayer | undefined;
  drawCards: (slot: PlayerSlot, count: number, fromDeck: "spellbook" | "atlas") => CardRef[];
  drawCard: (slot: PlayerSlot, fromDeck: "spellbook" | "atlas") => boolean;
  removeCardFromHand: (slot: PlayerSlot, index: number) => CardRef | null;
  dealDamageToAvatar: (slot: PlayerSlot, damage: number) => void;
  setPlayerLifeState: (slot: PlayerSlot, lifeState: PlayerLifeState) => void;
  pass: (slot: PlayerSlot) => void;
  completeMulligan: (slot: PlayerSlot, keepHand: boolean) => void;
  resetPassedPlayers: () => void;
  recordAction: (action: PlayerAction) => void;
}

/**
 * Create an empty player state
 */
function createEmptyPlayer(slot: PlayerSlot, name: string): CoopPlayer {
  return {
    slot,
    name,
    avatar: null,
    avatarPosition: null,
    health: DEFAULT_AVATAR_HEALTH,
    maxHealth: DEFAULT_AVATAR_HEALTH,
    lifeState: "alive",
    avatarTapped: false,
    hand: [],
    spellbook: [],
    atlas: [],
    graveyard: [],
    banished: [],
    isAlive: true,
    hasPassed: false,
    cardsDrawnThisTurn: 0,
  };
}

export const createPlayersSlice: StateCreator<
  AotreStore,
  [],
  [],
  PlayersSlice
> = (set, get) => ({
  ...initialPlayersState,

  /**
   * Initialize all players for the game
   */
  initializePlayers: (playerCount, playerDecks) => {
    const activeSlots = getActivePlayerSlots(playerCount);
    const players: Partial<Record<PlayerSlot, CoopPlayer>> = {};
    const boardConfig = BOARD_CONFIGS[playerCount];

    for (let i = 0; i < activeSlots.length; i++) {
      const slot = activeSlots[i];
      const deck = playerDecks[i];
      const player = createEmptyPlayer(slot, `Player ${i + 1}`);

      // Set up avatar (placeholder - would need card lookup)
      player.avatar = {
        cardId: deck.avatarId,
        name: `Avatar ${i + 1}`,
        type: "Avatar",
      };

      // Set avatar position from board config
      const [avatarX, avatarY] = boardConfig.avatarPositions[slot];
      player.avatarPosition = `${avatarX},${avatarY}`;

      // Set up spellbook (placeholder cards)
      player.spellbook = deck.spellbookIds.map((id) => ({
        cardId: id,
        name: `Spell ${id}`,
        type: "Spell",
      }));

      // Set up atlas (placeholder cards)
      player.atlas = deck.atlasIds.map((id) => ({
        cardId: id,
        name: `Site ${id}`,
        type: "Site",
      }));

      // Draw initial hand
      for (let j = 0; j < PLAYER_STARTING_HAND_SIZE; j++) {
        if (player.spellbook.length > 0) {
          const card = player.spellbook.shift();
          if (card) player.hand.push(card);
        }
      }

      players[slot] = player;
    }

    set({
      players,
      activePlayer: activeSlots[0],
      passedPlayers: new Set(),
      actionHistory: [],
    });
  },

  /**
   * Get a player by slot
   */
  getPlayer: (slot) => {
    return get().players[slot];
  },

  /**
   * Draw multiple cards for a player
   */
  drawCards: (slot, count, fromDeck) => {
    const state = get();
    const player = state.players[slot];
    if (!player) return [];

    const deck = fromDeck === "spellbook" ? player.spellbook : player.atlas;
    const drawn: CardRef[] = [];

    for (let i = 0; i < count && deck.length > 0; i++) {
      const card = deck.shift();
      if (card) {
        drawn.push(card);
      }
    }

    set({
      players: {
        ...state.players,
        [slot]: {
          ...player,
          hand: [...player.hand, ...drawn],
          spellbook: fromDeck === "spellbook" ? [...deck] : player.spellbook,
          atlas: fromDeck === "atlas" ? [...deck] : player.atlas,
          cardsDrawnThisTurn: player.cardsDrawnThisTurn + drawn.length,
        },
      },
    });

    return drawn;
  },

  /**
   * Draw a single card (AOTRE draws 2 per turn)
   */
  drawCard: (slot, fromDeck) => {
    const drawn = get().drawCards(slot, 1, fromDeck);
    return drawn.length > 0;
  },

  /**
   * Remove a card from a player's hand
   */
  removeCardFromHand: (slot, index) => {
    const state = get();
    const player = state.players[slot];
    if (!player || index < 0 || index >= player.hand.length) return null;

    const card = player.hand[index];
    const newHand = [...player.hand];
    newHand.splice(index, 1);

    set({
      players: {
        ...state.players,
        [slot]: {
          ...player,
          hand: newHand,
        },
      },
    });

    return card;
  },

  /**
   * Deal damage to a player's avatar
   */
  dealDamageToAvatar: (slot, damage) => {
    const state = get();
    const player = state.players[slot];
    if (!player || !player.isAlive) return;

    const newHealth = Math.max(0, player.health - damage);
    let newLifeState: PlayerLifeState = player.lifeState;
    let isAlive: boolean = player.isAlive;

    // Check for Death's Door or death
    if (newHealth <= 0) {
      if (player.lifeState === "alive") {
        // Enter Death's Door
        newLifeState = "deaths_door";
      } else if (player.lifeState === "deaths_door") {
        // Already in Death's Door - death blow!
        newLifeState = "dead";
        isAlive = false;
      }
    }

    set({
      players: {
        ...state.players,
        [slot]: {
          ...player,
          health: newHealth,
          lifeState: newLifeState,
          isAlive,
        },
      },
    });

    // Check win conditions after damage
    get().checkWinConditions();
  },

  /**
   * Directly set a player's life state
   */
  setPlayerLifeState: (slot, lifeState) => {
    const state = get();
    const player = state.players[slot];
    if (!player) return;

    set({
      players: {
        ...state.players,
        [slot]: {
          ...player,
          lifeState,
          isAlive: lifeState !== "dead",
        },
      },
    });
  },

  /**
   * Player passes their action
   */
  pass: (slot) => {
    const state = get();

    // Add to passed players set
    const newPassedPlayers = new Set(state.passedPlayers);
    newPassedPlayers.add(slot);

    // Update player state
    const player = state.players[slot];
    if (player) {
      set({
        passedPlayers: newPassedPlayers,
        players: {
          ...state.players,
          [slot]: {
            ...player,
            hasPassed: true,
          },
        },
      });
    } else {
      set({ passedPlayers: newPassedPlayers });
    }

    // Record the action
    get().recordAction({
      player: slot,
      type: "pass",
      payload: { type: "pass" },
      timestamp: Date.now(),
    });

    // Advance turn
    get().advanceTurn();
  },

  /**
   * Complete mulligan for a player
   */
  completeMulligan: (slot, keepHand) => {
    const state = get();
    const player = state.players[slot];
    if (!player) return;

    if (!keepHand) {
      // Shuffle hand back into spellbook and draw new hand
      const newSpellbook = [...player.spellbook, ...player.hand];
      // Simple shuffle
      for (let i = newSpellbook.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newSpellbook[i], newSpellbook[j]] = [newSpellbook[j], newSpellbook[i]];
      }

      const newHand: CardRef[] = [];
      for (let i = 0; i < PLAYER_STARTING_HAND_SIZE && newSpellbook.length > 0; i++) {
        const card = newSpellbook.shift();
        if (card) newHand.push(card);
      }

      set({
        players: {
          ...state.players,
          [slot]: {
            ...player,
            hand: newHand,
            spellbook: newSpellbook,
          },
        },
      });
    }

    // Check if all players have completed mulligan
    const _activePlayers = getActivePlayerSlots(state.playerCount);
    // For now, just advance to player turn after any mulligan action
    // In a full implementation, track mulligan completion per player
    set({ phase: "PlayerTurn" });
  },

  /**
   * Reset passed players for a new round
   */
  resetPassedPlayers: () => {
    const state = get();
    const updatedPlayers = { ...state.players };

    for (const slot of Object.keys(updatedPlayers) as PlayerSlot[]) {
      const player = updatedPlayers[slot];
      if (player) {
        updatedPlayers[slot] = {
          ...player,
          hasPassed: false,
          cardsDrawnThisTurn: 0,
        };
      }
    }

    set({
      passedPlayers: new Set(),
      players: updatedPlayers,
    });
  },

  /**
   * Record an action in the history
   */
  recordAction: (action) => {
    const state = get();
    set({
      actionHistory: [...state.actionHistory, action],
    });
  },
});
