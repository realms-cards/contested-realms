/**
 * Attack of the Realm Eater - Entity Types
 *
 * Types for Realm Eater, minions, tiles, and destination marker
 */

import type { CardRef, CellKey, Thresholds } from "@/lib/game/store";

// ============================================================================
// Tile Types
// ============================================================================

/** Tile state progression: site -> rubble -> void */
export type TileState = "site" | "rubble" | "void";

/** Extended tile information for AOTRE mode */
export interface AotreTile {
  /** Grid position key (e.g., "2,3") */
  cellKey: CellKey;
  /** Current state of the tile */
  state: TileState;
  /** Site card if state is "site", null otherwise */
  site: CardRef | null;
  /** Who owns this site (for threshold contribution) */
  owner: "neutral" | "player1" | "player2" | "player3" | "player4";
  /** Mana contribution to shared pool (0 if rubble/void) */
  manaValue: number;
  /** Threshold contribution (null if rubble/void) */
  thresholds: Partial<Thresholds> | null;
  /** Turn number when this became rubble (for void transition) */
  rubbleSinceTurn: number | null;
}

// ============================================================================
// Realm Eater Entity
// ============================================================================

/** The Realm Eater - main antagonist */
export interface RealmEaterEntity {
  /** Current position on the board */
  position: CellKey;
  /** Current health (players win when this reaches 0) */
  health: number;
  /** Maximum health (based on player count and difficulty) */
  maxHealth: number;
  /** Power Pool - used for spawning minions */
  powerPool: number;
  /** Mana Pool - used for casting spells */
  manaPool: number;
  /** Magic deck (spells the RE can cast) */
  magicDeck: CardRef[];
  /** Magic graveyard (used spells) */
  magicGraveyard: CardRef[];
  /** Minion deck (creatures the RE can spawn) */
  minionDeck: CardRef[];
  /** Minion graveyard (defeated minions) */
  minionGraveyard: CardRef[];
  /** Cards in RE's "hand" (consumed sites) */
  hand: CardRef[];
  /** Previous positions for tracking movement path */
  previousPositions: CellKey[];
  /** Whether RE has special abilities active */
  abilities: {
    voidwalk: boolean;
    submerge: boolean;
    burrowing: boolean;
  };
}

// ============================================================================
// Minion Entity
// ============================================================================

/** A minion controlled by the Realm Eater */
export interface MinionEntity {
  /** Unique identifier for this minion instance */
  id: string;
  /** Current position on the board */
  position: CellKey;
  /** Card data for this minion */
  card: CardRef;
  /** Current health */
  health: number;
  /** Base attack value */
  attack: number;
  /** Whether this minion has acted this turn */
  tapped: boolean;
  /** Turn this minion was summoned (for summoning sickness if applicable) */
  summonedOnTurn: number;
  /** Owner is always the Realm Eater */
  owner: "realm_eater";
}

// ============================================================================
// Destination Marker
// ============================================================================

/** The destination marker that the Realm Eater moves toward */
export interface DestinationMarker {
  /** Current target position */
  cellKey: CellKey;
  /** Number of turns at current position */
  turnsAtPosition: number;
}

// ============================================================================
// Combat Types
// ============================================================================

/** Combat instance for tracking attacks */
export interface AotreCombat {
  /** Attacker info */
  attacker: {
    type: "player_unit" | "realm_eater_minion" | "realm_eater" | "player_avatar";
    id: string;
    position: CellKey;
  };
  /** Defender info */
  defender: {
    type: "player_unit" | "realm_eater_minion" | "realm_eater" | "player_avatar" | "site";
    id: string;
    position: CellKey;
  };
  /** Damage to be dealt */
  damage: number;
  /** Whether combat has been resolved */
  resolved: boolean;
}
