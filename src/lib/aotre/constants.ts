/**
 * Attack of the Realm Eater - Constants
 *
 * Game configuration constants for the AOTRE mode
 */

import type { Thresholds } from "@/lib/game/store";
import type { Difficulty, DifficultyConfig, BoardConfig } from "./types";
import type { PlayerSlot } from "./types/player";

// ============================================================================
// Difficulty Configuration
// ============================================================================

/** Difficulty settings for each level */
export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: {
    healthMultiplier: 0.8,
    powerPoolMultiplier: 0.7,
    manaMultiplier: 2,
    spawnCooldown: 3,
    magicFrequency: 0.3,
    description: "Recommended for learning the mode",
  },
  normal: {
    healthMultiplier: 1.0,
    powerPoolMultiplier: 1.0,
    manaMultiplier: 4,
    spawnCooldown: 2,
    magicFrequency: 0.5,
    description: "Standard challenge",
  },
  hard: {
    healthMultiplier: 1.3,
    powerPoolMultiplier: 1.5,
    manaMultiplier: 6,
    spawnCooldown: 1,
    magicFrequency: 0.8,
    description: "For experienced players",
  },
};

// ============================================================================
// Board Configuration by Player Count
// ============================================================================

/** Board layouts based on player count */
export const BOARD_CONFIGS: Record<1 | 2 | 3 | 4, BoardConfig> = {
  1: {
    size: { w: 5, h: 4 },
    siteCount: 20,
    avatarPositions: {
      player1: [2, 3],
      player2: [0, 0], // unused
      player3: [0, 0], // unused
      player4: [0, 0], // unused
    },
    realmEaterStartPosition: [2, 0],
    destinationStartPosition: [2, 0],
  },
  2: {
    size: { w: 5, h: 4 },
    siteCount: 20,
    avatarPositions: {
      player1: [1, 3],
      player2: [3, 3],
      player3: [0, 0], // unused
      player4: [0, 0], // unused
    },
    realmEaterStartPosition: [2, 0],
    destinationStartPosition: [2, 0],
  },
  3: {
    size: { w: 7, h: 4 },
    siteCount: 26, // 7x4 = 28 - 2 corner spaces
    avatarPositions: {
      player1: [1, 3],
      player2: [3, 3],
      player3: [5, 3],
      player4: [0, 0], // unused
    },
    realmEaterStartPosition: [3, 0],
    destinationStartPosition: [3, 0],
  },
  4: {
    size: { w: 9, h: 4 },
    siteCount: 30, // 9x4 = 36 - 6 corner spaces
    avatarPositions: {
      player1: [1, 3],
      player2: [3, 3],
      player3: [5, 3],
      player4: [7, 3],
    },
    realmEaterStartPosition: [4, 0],
    destinationStartPosition: [4, 0],
  },
};

// ============================================================================
// Realm Eater Configuration
// ============================================================================

/** Base health for Realm Eater (before multipliers) */
export const REALM_EATER_BASE_HEALTH = 10;

/** Health added per player */
export const REALM_EATER_HEALTH_PER_PLAYER = 20;

/** Realm Eater's base power (for abilities) */
export const REALM_EATER_BASE_POWER = 1;

/** Calculate Realm Eater health based on player count and difficulty */
export function calculateRealmEaterHealth(
  playerCount: number,
  difficulty: Difficulty
): number {
  const config = DIFFICULTY_CONFIG[difficulty];
  const baseHealth = REALM_EATER_BASE_HEALTH + playerCount * REALM_EATER_HEALTH_PER_PLAYER;
  return Math.floor(baseHealth * config.healthMultiplier);
}

/** Calculate Realm Eater's power value */
export function calculateRealmEaterPower(playerCount: number): number {
  return REALM_EATER_BASE_POWER + playerCount;
}

/** Calculate Realm Eater's mana pool each turn */
export function calculateRealmEaterMana(
  playerCount: number,
  difficulty: Difficulty,
  sitesInHand: number
): number {
  const config = DIFFICULTY_CONFIG[difficulty];
  // Formula: (2 * playerCount) + difficultyMultiplier + sitesInHand
  return 2 * playerCount + config.manaMultiplier + sitesInHand;
}

/** Calculate Realm Eater's power pool each turn */
export function calculateRealmEaterPowerPool(
  playerCount: number,
  difficulty: Difficulty,
  sitesInHand: number
): number {
  // Power pool is double the mana pool
  return 2 * calculateRealmEaterMana(playerCount, difficulty, sitesInHand);
}

// ============================================================================
// Player Configuration
// ============================================================================

/** Starting hand size for players */
export const PLAYER_STARTING_HAND_SIZE = 6;

/** Cards drawn per turn (AOTRE rule: 2 instead of 1) */
export const CARDS_DRAWN_PER_TURN = 2;

/** Default player avatar health */
export const DEFAULT_AVATAR_HEALTH = 20;

/** Player slots to use based on player count */
export function getActivePlayerSlots(playerCount: 1 | 2 | 3 | 4): PlayerSlot[] {
  const slots: PlayerSlot[] = ["player1", "player2", "player3", "player4"];
  return slots.slice(0, playerCount);
}

// ============================================================================
// Mana and Thresholds
// ============================================================================

/** Default mana value per site */
export const DEFAULT_SITE_MANA_VALUE = 1;

/** Empty thresholds object */
export const EMPTY_THRESHOLDS: Thresholds = {
  air: 0,
  water: 0,
  earth: 0,
  fire: 0,
};

// ============================================================================
// Turn Configuration
// ============================================================================

/** Maximum turns before stalemate (safety limit) */
export const MAX_TURNS = 100;

/** Delay between AI actions for animation (ms) */
export const AI_ACTION_DELAY_MS = 500;

// ============================================================================
// Visual Constants
// ============================================================================

/** Colors for different entities */
export const AOTRE_COLORS = {
  realmEater: "#8b0000", // Dark red
  minionHighlight: "#ff4444", // Bright red
  destinationMarker: "#ffd700", // Gold
  rubbleTile: "#4a4a4a", // Dark gray
  voidTile: "#1a1a1a", // Near black
  sharedMana: "#3b82f6", // Blue
  playerHighlight: "#22c55e", // Green
};

/** Z-index for overlays */
export const AOTRE_OVERLAY_Z = {
  realmEater: 100,
  destinationMarker: 50,
  tileOverlay: 10,
};
