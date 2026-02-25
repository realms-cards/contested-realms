/**
 * Tutorial Mode type definitions.
 *
 * The tutorial teaches Sorcery: Contested Realm rules through scripted,
 * single-player lessons. Each lesson sets up an initial game state and
 * walks the player through a sequence of narration, highlights, forced
 * player actions, and scripted opponent actions.
 */

import type {
  Phase,
  PlayerKey,
  Thresholds,
} from "@/lib/game/store/baseTypes";
import type { CardRef, CellKey, SiteTile } from "@/lib/game/store/types";

// ────────────────────────────── Tile Helpers ──────────────────────────────

/**
 * Convert a tile number (1-20) to a CellKey ("x,y") for the 5×4 board.
 *
 * Grid layout (tiles numbered left-to-right, top-to-bottom as seen on screen):
 *   1  2  3  4  5   ← opponent side (y=0 in store, top of screen)
 *   6  7  8  9  10
 *  11 12 13 14 15
 *  16 17 18 19 20   ← player side   (y=3 in store, bottom of screen)
 */
export function tileToCellKey(tile: number): CellKey {
  const width = 5;
  const index = tile - 1;
  const x = index % width;
  const y = Math.floor(index / width);
  return `${x},${y}` as CellKey;
}

/** Convert a CellKey ("x,y") to a tile number (1-20) for the 5×4 board. */
export function cellKeyToTile(cellKey: CellKey): number {
  const [rawX, rawY] = cellKey.split(",", 2);
  const x = Number(rawX);
  const y = Number(rawY);
  return y * 5 + x + 1;
}

// ────────────────────────────── Concepts ──────────────────────────────

/** A game concept that a lesson teaches. */
export type TutorialConcept =
  | "introduction"
  | "elements"
  | "card_types"
  | "game_zones"
  | "setup"
  | "turn_sequence"
  | "playing_sites"
  | "mana_thresholds"
  | "casting_spells"
  | "summoning_minions"
  | "movement"
  | "combat"
  | "defending"
  | "intercepting"
  | "deaths_door"
  | "win_condition";

// ────────────────────────────── Game State ──────────────────────────────

/** Minimal player state used to seed a tutorial lesson. */
export interface TutorialPlayerState {
  avatar: CardRef;
  life: number;
  mana?: number;
  thresholds?: Partial<Thresholds>;
  hand: CardRef[];
  spellbook: CardRef[];
  atlas: CardRef[];
  graveyard?: CardRef[];
  battlefield?: CardRef[];
}

/** The initial game snapshot for a tutorial lesson. */
export interface TutorialGameState {
  p1: TutorialPlayerState;
  p2: TutorialPlayerState;
  board?: {
    /** Sites keyed by tile number (1-20). */
    sites: Record<number, SiteTile>;
  };
  /** Which permanents (minions, artifacts, auras) are on the board. */
  permanents?: TutorialPermanent[];
  phase?: Phase;
  currentPlayer?: PlayerKey;
  turn?: number;
}

/** A permanent card placed on the board at lesson start. */
export interface TutorialPermanent {
  owner: PlayerKey;
  /** Tile number (1-20) where the permanent is placed. */
  tile: number;
  card: CardRef;
  tapped?: boolean;
}

// ────────────────────────────── Steps ──────────────────────────────

/** The types of scripted tutorial steps. */
export type TutorialStepType =
  | "narration" // Show text overlay, wait for "Next"
  | "highlight" // Highlight a UI element with explanation
  | "forced_action" // Player must perform a specific action
  | "scripted_action" // Opponent automatically performs an action
  | "wait" // Wait for animation to complete
  | "checkpoint"; // Save progress

/** One step in a tutorial lesson. */
export interface TutorialStep {
  id: string;
  type: TutorialStepType;
  /** Narration / explanation text (supports markdown subset). */
  text?: string;
  /** Optional title displayed above the text. */
  title?: string;
  /** For `highlight` steps: what to spotlight. */
  highlightTarget?: TutorialHighlightTarget;
  /** For `forced_action` steps: the exact action the player must take. */
  requiredAction?: TutorialAction;
  /** Hint text shown if the player does something wrong on a forced_action. */
  hintText?: string;
  /** For `scripted_action` steps: what the opponent (or game) does. */
  scriptedAction?: TutorialAction;
  /** State mutations applied after this step resolves. */
  statePatches?: TutorialStatePatch[];
  /** Duration in ms for `wait` steps. */
  duration?: number;
  /** Show an animated arrow pointing to the required action target. */
  showHint?: boolean;
  /** HUD elements to reveal when this step is reached (progressive disclosure). */
  revealHud?: TutorialHudElement[];
  /** Show a large card image in the center of the screen during this step. */
  showCard?: { name: string; slug: string; type: string };
}

/** HUD elements that can be progressively revealed during a lesson. */
export type TutorialHudElement = "lifeCounters" | "hand" | "piles" | "resourcePanels";

// ────────────────────────────── Highlight Targets ──────────────────────────────

export type TutorialHighlightTarget =
  | { type: "zone"; zone: "hand" | "spellbook" | "atlas" | "graveyard" | "battlefield" }
  | { type: "card"; cardName: string; zone: string }
  | { type: "tile"; tile: number }
  | { type: "tiles"; tiles: number[] }
  | { type: "ui"; element: "life_counter" | "mana_display" | "phase_indicator" | "end_turn_button" | "avatar" }
  | { type: "avatar"; player: PlayerKey }
  | { type: "board" }
  | { type: "piles"; player: PlayerKey };

// ────────────────────────────── Actions ──────────────────────────────

export type TutorialAction =
  | { type: "play_site"; cardName: string; tile: number }
  | { type: "cast_spell"; cardName: string; tile: number }
  | { type: "move_unit"; unitName: string; from: number; to: number }
  | { type: "attack"; attackerName: string; targetName: string; attackerTile: number; targetTile: number }
  | { type: "end_turn" }
  | { type: "draw"; deck: "spellbook" | "atlas" }
  | { type: "tap_avatar" }
  | { type: "pass" };

// ────────────────────────────── State Patches ──────────────────────────────

/** A granular state mutation applied during a lesson step. */
export type TutorialStatePatch =
  | { op: "set_life"; player: PlayerKey; value: number }
  | { op: "set_mana"; player: PlayerKey; value: number }
  | { op: "set_thresholds"; player: PlayerKey; value: Partial<Thresholds> }
  | { op: "set_phase"; value: Phase }
  | { op: "set_current_player"; value: PlayerKey }
  | { op: "set_turn"; value: number }
  | { op: "add_card_to_zone"; player: PlayerKey; zone: keyof TutorialZoneNames; card: CardRef }
  | { op: "remove_card_from_zone"; player: PlayerKey; zone: keyof TutorialZoneNames; cardName: string }
  | { op: "place_site"; tile: number; site: SiteTile }
  | { op: "remove_site"; tile: number }
  | { op: "place_permanent"; permanent: TutorialPermanent }
  | { op: "remove_permanent"; tile: number; cardName: string }
  | { op: "deal_damage"; player: PlayerKey; amount: number }
  | { op: "tap_permanent"; tile: number; cardName: string }
  | { op: "untap_all"; player: PlayerKey };

/** Zone name mapping for state patches. */
export interface TutorialZoneNames {
  hand: true;
  spellbook: true;
  atlas: true;
  graveyard: true;
  battlefield: true;
}

// ────────────────────────────── Lesson ──────────────────────────────

/** A complete tutorial lesson. */
export interface TutorialLesson {
  id: string;
  title: string;
  description: string;
  /** Display order (1-based). */
  order: number;
  /** Concepts taught in this lesson. */
  concepts: TutorialConcept[];
  /** Initial game state for the lesson. */
  initialState: TutorialGameState;
  /** The scripted step sequence. */
  steps: TutorialStep[];
}

// ────────────────────────────── Progress ──────────────────────────────

/** Persisted tutorial progress (stored in localStorage). */
export interface TutorialProgress {
  completedLessons: string[];
  currentLesson: string | null;
  currentStep: number;
  lastAccessed: number;
}
