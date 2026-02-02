/**
 * Attack of the Realm Eater - Realm Eater State Slice
 *
 * Handles the Realm Eater entity state
 */

import type { StateCreator } from "zustand";
import type { CellKey, CardRef } from "@/lib/game/store";
import { cellKey } from "./board";
import {
  BOARD_CONFIGS,
  calculateRealmEaterHealth,
  calculateRealmEaterMana,
  calculateRealmEaterPowerPool,
} from "../../constants";
import type { AotreStore, Difficulty } from "../../types";
import type { RealmEaterEntity, DestinationMarker } from "../../types/entities";

/** Initial Realm Eater state */
const initialRealmEaterState = {
  realmEater: {
    position: "2,0",
    health: 30,
    maxHealth: 30,
    powerPool: 0,
    manaPool: 0,
    magicDeck: [],
    magicGraveyard: [],
    minionDeck: [],
    minionGraveyard: [],
    hand: [],
    previousPositions: [],
    abilities: {
      voidwalk: true,
      submerge: true,
      burrowing: true,
    },
  } as RealmEaterEntity,
  destination: {
    cellKey: "2,0",
    turnsAtPosition: 0,
  } as DestinationMarker,
};

type RealmEaterState = typeof initialRealmEaterState;

export interface RealmEaterSlice extends RealmEaterState {
  initializeRealmEater: (
    playerCount: 1 | 2 | 3 | 4,
    difficulty: Difficulty,
    magicDeck: CardRef[],
    minionDeck: CardRef[]
  ) => void;
  moveRealmEater: (newPosition: CellKey) => void;
  dealDamageToRealmEater: (damage: number) => void;
  healRealmEater: (amount: number) => void;
  addToRealmEaterHand: (card: CardRef) => void;
  removeFromRealmEaterHand: (index: number) => CardRef | null;
  updateDestination: (newPosition: CellKey) => void;
  refreshRealmEaterResources: () => void;
  drawMagicCard: () => CardRef | null;
  drawMinionCard: () => CardRef | null;
  spendRealmEaterMana: (amount: number) => boolean;
  spendRealmEaterPower: (amount: number) => boolean;
}

export const createRealmEaterSlice: StateCreator<
  AotreStore,
  [],
  [],
  RealmEaterSlice
> = (set, get) => ({
  ...initialRealmEaterState,

  /**
   * Initialize the Realm Eater for a new game
   */
  initializeRealmEater: (playerCount, difficulty, magicDeck, minionDeck) => {
    const config = BOARD_CONFIGS[playerCount];
    const [startX, startY] = config.realmEaterStartPosition;
    const startPosition = cellKey(startX, startY);
    const maxHealth = calculateRealmEaterHealth(playerCount, difficulty);

    set({
      realmEater: {
        position: startPosition,
        health: maxHealth,
        maxHealth,
        powerPool: 0,
        manaPool: 0,
        magicDeck: [...magicDeck],
        magicGraveyard: [],
        minionDeck: [...minionDeck],
        minionGraveyard: [],
        hand: [],
        previousPositions: [],
        abilities: {
          voidwalk: true,
          submerge: true,
          burrowing: true,
        },
      },
      destination: {
        cellKey: startPosition,
        turnsAtPosition: 0,
      },
    });
  },

  /**
   * Move the Realm Eater to a new position
   */
  moveRealmEater: (newPosition) => {
    const state = get();
    const re = state.realmEater;

    set({
      realmEater: {
        ...re,
        previousPositions: [...re.previousPositions, re.position],
        position: newPosition,
      },
    });

    // Log the action
    set({
      aiActionLog: [
        ...state.aiActionLog,
        `Realm Eater moves to ${newPosition}`,
      ],
    });
  },

  /**
   * Deal damage to the Realm Eater
   */
  dealDamageToRealmEater: (damage) => {
    const state = get();
    const re = state.realmEater;
    const newHealth = Math.max(0, re.health - damage);

    set({
      realmEater: {
        ...re,
        health: newHealth,
      },
    });

    // Check win conditions
    get().checkWinConditions();
  },

  /**
   * Heal the Realm Eater
   */
  healRealmEater: (amount) => {
    const state = get();
    const re = state.realmEater;
    const newHealth = Math.min(re.maxHealth, re.health + amount);

    set({
      realmEater: {
        ...re,
        health: newHealth,
      },
    });
  },

  /**
   * Add a card to the Realm Eater's hand (consumed sites)
   */
  addToRealmEaterHand: (card) => {
    const state = get();
    set({
      realmEater: {
        ...state.realmEater,
        hand: [...state.realmEater.hand, card],
      },
    });
  },

  /**
   * Remove a card from the Realm Eater's hand
   */
  removeFromRealmEaterHand: (index) => {
    const state = get();
    const hand = state.realmEater.hand;

    if (index < 0 || index >= hand.length) return null;

    const card = hand[index];
    const newHand = [...hand];
    newHand.splice(index, 1);

    set({
      realmEater: {
        ...state.realmEater,
        hand: newHand,
      },
    });

    return card;
  },

  /**
   * Update the destination marker position
   */
  updateDestination: (newPosition) => {
    const state = get();

    if (newPosition === state.destination.cellKey) {
      // Same position - increment turns at position
      set({
        destination: {
          ...state.destination,
          turnsAtPosition: state.destination.turnsAtPosition + 1,
        },
      });
    } else {
      // New position
      set({
        destination: {
          cellKey: newPosition,
          turnsAtPosition: 0,
        },
      });
    }
  },

  /**
   * Refresh Realm Eater resources at start of its turn
   */
  refreshRealmEaterResources: () => {
    const state = get();
    const sitesInHand = state.realmEater.hand.length;

    const newMana = calculateRealmEaterMana(
      state.playerCount,
      state.difficulty,
      sitesInHand
    );
    const newPower = calculateRealmEaterPowerPool(
      state.playerCount,
      state.difficulty,
      sitesInHand
    );

    set({
      realmEater: {
        ...state.realmEater,
        manaPool: newMana,
        powerPool: newPower,
      },
    });

    set({
      aiActionLog: [
        ...state.aiActionLog,
        `Realm Eater gains ${newMana} mana and ${newPower} power`,
      ],
    });
  },

  /**
   * Draw a card from the magic deck
   */
  drawMagicCard: () => {
    const state = get();
    let magicDeck = [...state.realmEater.magicDeck];

    // If deck is empty, shuffle graveyard back in
    if (magicDeck.length === 0) {
      magicDeck = [...state.realmEater.magicGraveyard];
      // Simple shuffle
      for (let i = magicDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [magicDeck[i], magicDeck[j]] = [magicDeck[j], magicDeck[i]];
      }

      set({
        realmEater: {
          ...state.realmEater,
          magicDeck,
          magicGraveyard: [],
        },
      });
    }

    if (magicDeck.length === 0) return null;

    const card = magicDeck.shift() as CardRef;
    set({
      realmEater: {
        ...state.realmEater,
        magicDeck,
      },
    });

    return card;
  },

  /**
   * Draw a card from the minion deck
   */
  drawMinionCard: () => {
    const state = get();
    let minionDeck = [...state.realmEater.minionDeck];

    // If deck is empty, shuffle graveyard back in
    if (minionDeck.length === 0) {
      minionDeck = [...state.realmEater.minionGraveyard];
      // Simple shuffle
      for (let i = minionDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [minionDeck[i], minionDeck[j]] = [minionDeck[j], minionDeck[i]];
      }

      set({
        realmEater: {
          ...state.realmEater,
          minionDeck,
          minionGraveyard: [],
        },
      });
    }

    if (minionDeck.length === 0) return null;

    const card = minionDeck.shift() as CardRef;
    set({
      realmEater: {
        ...state.realmEater,
        minionDeck,
      },
    });

    return card;
  },

  /**
   * Spend Realm Eater mana
   */
  spendRealmEaterMana: (amount) => {
    const state = get();
    if (state.realmEater.manaPool < amount) return false;

    set({
      realmEater: {
        ...state.realmEater,
        manaPool: state.realmEater.manaPool - amount,
      },
    });

    return true;
  },

  /**
   * Spend Realm Eater power (for spawning)
   */
  spendRealmEaterPower: (amount) => {
    const state = get();
    if (state.realmEater.powerPool < amount) return false;

    set({
      realmEater: {
        ...state.realmEater,
        powerPool: state.realmEater.powerPool - amount,
      },
    });

    return true;
  },
});
