/**
 * Attack of the Realm Eater - Game State Types
 *
 * Main game state interface and phase types
 */

import type { CardRef, CellKey, Thresholds, BoardSize } from "@/lib/game/store";
import type {
  AotreTile,
  RealmEaterEntity,
  MinionEntity,
  DestinationMarker,
  AotreCombat,
} from "./entities";
import type { PlayerSlot, CoopPlayer, PlayerAction } from "./player";

// ============================================================================
// Game Phases
// ============================================================================

/** Main game phases */
export type AotreGamePhase =
  | "Setup" // Initial setup (deck selection, board generation)
  | "Mulligan" // Players mulligan hands
  | "PlayerTurn" // Players take interleaved actions
  | "RealmEaterTurn" // AI executes all phases
  | "GameEnd"; // Game over (win or lose)

/** Realm Eater AI sub-phases during its turn */
export type RealmEaterAIPhase =
  | "Start" // Untap, collect resources
  | "Movement" // Move toward destination marker
  | "SiteConsumption" // Previous site becomes rubble, old rubble becomes void
  | "Spawning" // Summon minions using Power Pool
  | "MinionActions" // Each minion moves and/or attacks
  | "Magic" // Cast spells from magic deck
  | "End"; // End of turn cleanup

// ============================================================================
// Difficulty Settings
// ============================================================================

/** Difficulty levels */
export type Difficulty = "easy" | "normal" | "hard";

/** Configuration for each difficulty level */
export interface DifficultyConfig {
  /** Realm Eater health multiplier */
  healthMultiplier: number;
  /** Power Pool generation rate multiplier */
  powerPoolMultiplier: number;
  /** Mana generation multiplier for RE */
  manaMultiplier: number;
  /** Turns between minion spawns */
  spawnCooldown: number;
  /** Magic casting frequency */
  magicFrequency: number;
  /** Description for UI */
  description: string;
}

// ============================================================================
// Board Configuration
// ============================================================================

/** Board layout configuration based on player count */
export interface BoardConfig {
  /** Board dimensions */
  size: BoardSize;
  /** Total number of sites to place */
  siteCount: number;
  /** Avatar starting positions for each player slot */
  avatarPositions: Record<PlayerSlot, [number, number]>;
  /** Realm Eater starting position */
  realmEaterStartPosition: [number, number];
  /** Initial destination marker position */
  destinationStartPosition: [number, number];
}

// ============================================================================
// Main Game State
// ============================================================================

/** Complete AOTRE game state */
export interface AotreGameState {
  // ====== Configuration ======
  /** Selected difficulty */
  difficulty: Difficulty;
  /** Number of players (1-4) */
  playerCount: 1 | 2 | 3 | 4;
  /** Board dimensions */
  boardSize: BoardSize;

  // ====== Board State ======
  /** All tiles on the board */
  tiles: Record<CellKey, AotreTile>;
  /** Permanents (player units) at each cell */
  permanents: Record<CellKey, CardRef[]>;
  /** Instance IDs of permanents with summoning sickness (summoned this turn) */
  summoningSickness: Set<string>;

  // ====== Shared Resources ======
  /** Shared mana pool for all players */
  sharedMana: number;
  /** Shared threshold totals from all sites */
  sharedThresholds: Thresholds;
  /** Mana spent this round */
  manaSpentThisRound: number;

  // ====== Player State ======
  /** All players in the game */
  players: Partial<Record<PlayerSlot, CoopPlayer>>;
  /** Currently active player (whose turn to act) */
  activePlayer: PlayerSlot;
  /** Players who have passed this round */
  passedPlayers: Set<PlayerSlot>;
  /** Action history for this turn */
  actionHistory: PlayerAction[];

  // ====== Realm Eater State ======
  /** The Realm Eater entity */
  realmEater: RealmEaterEntity;
  /** Destination marker */
  destination: DestinationMarker;
  /** All minions controlled by the Realm Eater */
  minions: MinionEntity[];

  // ====== Phase State ======
  /** Current main game phase */
  phase: AotreGamePhase;
  /** Current AI sub-phase (only during RealmEaterTurn) */
  aiPhase: RealmEaterAIPhase | null;
  /** Current turn number */
  turn: number;
  /** Current round number (increases when all players pass) */
  round: number;

  // ====== Combat State ======
  /** Active combat instances */
  activeCombat: AotreCombat | null;

  // ====== Game End State ======
  /** Whether the game has ended */
  gameEnded: boolean;
  /** Whether players won (true) or Realm Eater won (false), null if ongoing */
  playersWon: boolean | null;
  /** Reason for game end */
  endReason: string | null;

  // ====== UI State ======
  /** Currently selected card in hand */
  selectedHandCard: { player: PlayerSlot; index: number } | null;
  /** Currently selected unit on board */
  selectedUnit: { cellKey: CellKey; index: number } | null;
  /** Whether to show AI turn animation */
  showAIAnimation: boolean;
  /** AI action log for display */
  aiActionLog: string[];
}

// ============================================================================
// Store Actions (Methods)
// ============================================================================

/** Actions available on the AOTRE store */
export interface AotreGameActions {
  // ====== Setup Actions ======
  /** Initialize a new game */
  initializeGame: (
    playerCount: 1 | 2 | 3 | 4,
    difficulty: Difficulty,
    playerDecks: Array<{ avatarId: number; spellbookIds: number[]; atlasIds: number[] }>
  ) => void;
  /** Initialize board with sites */
  initializeBoard: (playerCount: 1 | 2 | 3 | 4, siteCards: CardRef[]) => void;
  /** Initialize players */
  initializePlayers: (
    playerCount: 1 | 2 | 3 | 4,
    playerDecks: Array<{ avatarId: number; spellbookIds: number[]; atlasIds: number[] }>
  ) => void;
  /** Initialize Realm Eater */
  initializeRealmEater: (
    playerCount: 1 | 2 | 3 | 4,
    difficulty: Difficulty,
    magicDeck: CardRef[],
    minionDeck: CardRef[]
  ) => void;
  /** Reset to setup screen */
  resetGame: () => void;

  // ====== Mulligan Actions ======
  /** Complete mulligan for a player */
  completeMulligan: (player: PlayerSlot, keepHand: boolean) => void;

  // ====== Player Actions ======
  /** Play a card from hand */
  playCard: (player: PlayerSlot, cardIndex: number, targetCell: CellKey) => boolean;
  /** Move a unit on the board */
  moveUnit: (fromCell: CellKey, unitIndex: number, toCell: CellKey) => boolean;
  /** Attack with a unit */
  attack: (
    attackerCell: CellKey,
    attackerIndex: number,
    targetCell: CellKey,
    targetIndex?: number
  ) => boolean;
  /** Draw a card */
  drawCard: (player: PlayerSlot, fromDeck: "spellbook" | "atlas") => boolean;
  /** Pass the current action */
  pass: (player: PlayerSlot) => void;

  // ====== Turn Management ======
  /** Advance to next player or phase */
  advanceTurn: () => void;
  /** Execute the Realm Eater's turn */
  executeRealmEaterTurn: () => Promise<void>;

  // ====== Mana Management ======
  /** Get current shared mana */
  getSharedMana: () => number;
  /** Spend mana from shared pool */
  spendMana: (amount: number) => boolean;
  /** Recalculate mana from all sites */
  recalculateMana: () => void;
  /** Check if can afford a card cost */
  canAffordCost: (manaCost: number, thresholds?: Partial<Thresholds>) => boolean;

  // ====== Board Actions ======
  /** Get a tile */
  getTile: (cellKey: CellKey) => AotreTile | undefined;
  /** Set tile state (site -> rubble -> void) */
  setTileState: (cellKey: CellKey, state: "site" | "rubble" | "void") => void;
  /** Consume a site (returns the consumed card) */
  consumeSite: (cellKey: CellKey) => CardRef | null;
  /** Add permanent to cell */
  addPermanent: (cellKey: CellKey, card: CardRef) => void;
  /** Remove permanent from cell */
  removePermanent: (cellKey: CellKey, index: number) => CardRef | null;
  /** Move permanent between cells */
  movePermanent: (fromCell: CellKey, index: number, toCell: CellKey) => boolean;
  /** Check if a unit has summoning sickness (cannot move/attack) */
  hasSummoningSickness: (instanceId: string) => boolean;
  /** Clear all summoning sickness (called at start of player turn) */
  clearSummoningSickness: () => void;

  // ====== Player Management ======
  /** Remove card from player hand */
  removeCardFromHand: (slot: PlayerSlot, index: number) => CardRef | null;
  /** Record a player action */
  recordAction: (action: PlayerAction) => void;
  /** Deal damage to avatar */
  dealDamageToAvatar: (slot: PlayerSlot, damage: number) => void;
  /** Draw multiple cards */
  drawCards: (slot: PlayerSlot, count: number, fromDeck: "spellbook" | "atlas") => CardRef[];

  // ====== Minion Management ======
  /** Get first minion at position */
  getMinionAt: (position: CellKey) => MinionEntity | undefined;
  /** Get all minions at position */
  getMinionsAt: (position: CellKey) => MinionEntity[];
  /** Deal damage to minion */
  dealDamageToMinion: (minionId: string, damage: number) => boolean;
  /** Remove minion */
  removeMinion: (minionId: string) => MinionEntity | null;

  // ====== Realm Eater Management ======
  /** Deal damage to Realm Eater */
  dealDamageToRealmEater: (damage: number) => void;
  /** Draw a card from the Realm Eater's magic deck */
  drawMagicCard: () => CardRef | null;
  /** Draw a card from the Realm Eater's minion deck */
  drawMinionCard: () => CardRef | null;

  // ====== Combat Management ======
  /** Resolve active combat */
  resolveCombat: () => void;
  /** Clear combat */
  clearCombat: () => void;

  // ====== Win Condition Checks ======
  /** Check win/loss conditions */
  checkWinConditions: () => void;

  // ====== UI Actions ======
  /** Select a card in hand */
  selectHandCard: (player: PlayerSlot, index: number) => void;
  /** Clear hand selection */
  clearHandSelection: () => void;
  /** Select a unit on board */
  selectUnit: (cellKey: CellKey, index: number) => void;
  /** Clear unit selection */
  clearUnitSelection: () => void;
}

/** Complete store type (state + actions) */
export type AotreStore = AotreGameState & AotreGameActions;
