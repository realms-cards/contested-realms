/**
 * Attack of the Realm Eater - Player Types
 *
 * Types for cooperative player state (1-4 players)
 */

import type { CardRef, CellKey } from "@/lib/game/store";

// ============================================================================
// Player Identification
// ============================================================================

/** Player slot identifiers (supports 1-4 players) */
export type PlayerSlot = "player1" | "player2" | "player3" | "player4";

/** All possible player slots */
export const ALL_PLAYER_SLOTS: PlayerSlot[] = [
  "player1",
  "player2",
  "player3",
  "player4",
];

// ============================================================================
// Player State
// ============================================================================

/** Life state for player avatars */
export type PlayerLifeState = "alive" | "deaths_door" | "dead";

/** Individual player state in co-op mode */
export interface CoopPlayer {
  /** Player slot identifier */
  slot: PlayerSlot;
  /** Display name */
  name: string;
  /** Avatar card */
  avatar: CardRef | null;
  /** Avatar position on board */
  avatarPosition: CellKey | null;
  /** Avatar health */
  health: number;
  /** Maximum health */
  maxHealth: number;
  /** Life state */
  lifeState: PlayerLifeState;
  /** Whether avatar is tapped */
  avatarTapped: boolean;
  /** Cards in hand */
  hand: CardRef[];
  /** Spellbook (spell library) */
  spellbook: CardRef[];
  /** Atlas (site library) */
  atlas: CardRef[];
  /** Graveyard */
  graveyard: CardRef[];
  /** Banished cards */
  banished: CardRef[];
  /** Whether this player is still in the game */
  isAlive: boolean;
  /** Whether this player has passed this round */
  hasPassed: boolean;
  /** Number of cards drawn this turn */
  cardsDrawnThisTurn: number;
}

// ============================================================================
// Player Actions
// ============================================================================

/** Types of actions a player can take */
export type PlayerActionType =
  | "play_card"
  | "move_unit"
  | "attack"
  | "activate_ability"
  | "draw_card"
  | "pass";

/** A player action in the interleaved turn system */
export interface PlayerAction {
  /** Which player is taking the action */
  player: PlayerSlot;
  /** Type of action */
  type: PlayerActionType;
  /** Action-specific payload */
  payload: PlayerActionPayload;
  /** Timestamp */
  timestamp: number;
}

/** Payload types for different actions */
export type PlayerActionPayload =
  | PlayCardPayload
  | MoveUnitPayload
  | AttackPayload
  | ActivateAbilityPayload
  | DrawCardPayload
  | PassPayload;

export interface PlayCardPayload {
  type: "play_card";
  cardIndex: number;
  targetCell: CellKey;
  additionalTargets?: CellKey[];
}

export interface MoveUnitPayload {
  type: "move_unit";
  fromCell: CellKey;
  unitIndex: number;
  toCell: CellKey;
}

export interface AttackPayload {
  type: "attack";
  attackerCell: CellKey;
  attackerIndex: number;
  targetCell: CellKey;
  targetIndex?: number;
}

export interface ActivateAbilityPayload {
  type: "activate_ability";
  sourceCell: CellKey;
  sourceIndex: number;
  abilityIndex: number;
  targets?: CellKey[];
}

export interface DrawCardPayload {
  type: "draw_card";
  fromDeck: "spellbook" | "atlas";
}

export interface PassPayload {
  type: "pass";
}

// ============================================================================
// Player Setup
// ============================================================================

/** Player deck configuration for game setup */
export interface PlayerDeckConfig {
  /** Player slot */
  slot: PlayerSlot;
  /** Avatar card ID */
  avatarId: number;
  /** Spellbook card IDs */
  spellbookIds: number[];
  /** Atlas card IDs */
  atlasIds: number[];
}

/** Player setup state before game starts */
export interface PlayerSetupState {
  /** Number of players (1-4) */
  playerCount: 1 | 2 | 3 | 4;
  /** Deck configurations for each player */
  decks: Partial<Record<PlayerSlot, PlayerDeckConfig>>;
  /** Whether setup is complete */
  isReady: boolean;
}
