import type {
  InteractionDecision,
  InteractionEnvelope,
  InteractionGrant,
  InteractionGrantRequest,
  InteractionMessage,
  InteractionRequestKind,
  InteractionRequestMessage,
  InteractionResponseMessage,
  InteractionResultMessage,
} from "@/lib/net/interactions";
import type { GameTransport, CustomMessage } from "@/lib/net/transport";
import type {
  BurrowAbility,
  ContextMenuAction,
  PermanentPosition,
  PermanentPositionState,
  PlayerPositionReference,
  SitePositionData,
} from "../types";
import type { RemoteCursorState } from "./remoteCursor";
export { REMOTE_CURSOR_TTL_MS } from "./remoteCursor";
export type { RemoteCursorState } from "./remoteCursor";

export type Phase = "Setup" | "Start" | "Draw" | "Main" | "End";
export type PlayerKey = "p1" | "p2";

export type Thresholds = {
  air: number;
  water: number;
  earth: number;
  fire: number;
};

export type LifeState = "alive" | "dd" | "dead";

export type PlayerState = {
  life: number;
  lifeState: LifeState; // 'alive', 'dd' (Death's Door), 'dead'
  mana: number; // manual offset to available mana (can be negative when cards are played)
  thresholds: Thresholds;
};

export type BoardSize = { w: number; h: number };
export type CellKey = string; // `${x},${y}`
export type SiteTile = {
  owner: 1 | 2;
  tapped?: boolean;
  card?: CardRef | null;
};
export type BoardState = {
  size: BoardSize;
  sites: Record<CellKey, SiteTile>;
};

export type BoardPingEvent = {
  id: string;
  position: { x: number; z: number };
  playerId: string | null;
  playerKey: PlayerKey | null;
  ts: number;
};

// --- Remote cursor telemetry -----------------------------------------------

export type InteractionRecordStatus =
  | "pending"
  | InteractionDecision
  | "expired";

export type InteractionRequestEntry = {
  request: InteractionRequestMessage;
  response?: InteractionResponseMessage;
  status: InteractionRecordStatus;
  direction: "inbound" | "outbound";
  grant?: InteractionGrant | null;
  proposedGrant?: InteractionGrantRequest | null;
  receivedAt: number;
  updatedAt: number;
  // Optional result emitted by the server after executing an approved request
  result?: InteractionResultMessage;
};

export type InteractionStateMap = Record<string, InteractionRequestEntry>;

export type SendInteractionRequestInput = {
  from: string;
  to: string;
  kind: InteractionRequestKind;
  matchId?: string;
  payload?: Record<string, unknown>;
  note?: string;
  requestId?: string;
  grant?: InteractionGrantRequest;
};

export type InteractionResponseOptions = {
  reason?: string;
  payload?: Record<string, unknown>;
  grant?: InteractionGrantRequest;
};

// Minimal card reference for zones
export type CardRef = {
  cardId: number;
  variantId?: number | null;
  name: string;
  type: string | null;
  subTypes?: string | null; // card subtypes (e.g., "Monument", "Automaton", "Weapon", etc.)
  slug?: string | null; // variant slug for images
  thresholds?: Partial<Thresholds> | null; // threshold requirements
  cost?: number | null; // mana cost
  owner?: PlayerKey | null;
  instanceId?: string | null;
};

export type Zones = {
  spellbook: CardRef[]; // spells/creatures
  atlas: CardRef[]; // sites
  hand: CardRef[];
  graveyard: CardRef[];
  battlefield: CardRef[]; // non-site permanents for now
  collection: CardRef[];
  banished: CardRef[]; // removed for the rest of the game
};

// Shared base for all board entities (avatars and permanents)
export type EntityBase<TCard> = {
  card: TCard;
  offset?: [number, number] | null;
  tapped?: boolean;
};

// Champion reference for Dragonlord avatar
export type ChampionRef = {
  cardId: number;
  name: string;
  slug?: string | null;
};

export type AvatarState = EntityBase<CardRef | null> & {
  pos: [number, number] | null;
  counters?: number | null;
  champion?: ChampionRef | null; // Dragonlord champion dragon
};

// --- Imposter Mask State (Gothic expansion) --------------------------------
// Imposter can "mask" by banishing an Avatar from collection to gain their abilities.
// The mask breaks when damaged or when putting on a new mask.
export type ImposterMaskState = {
  // The original Imposter avatar card (preserved to restore when unmasked)
  originalAvatar: CardRef;
  // The mask avatar card (from collection, now displayed as the avatar)
  maskAvatar: CardRef;
  // Timestamp when mask was applied (for syncing)
  maskedAt: number;
};

// --- Imposter Mana Cost --------------------------------
export const IMPOSTER_MASK_COST = 3; // Mana cost to mask yourself

// --- Harbinger Portal State (Gothic expansion) --------------------------------
export type PortalRollPhase = "pending" | "rolling" | "complete";

export type PortalPlayerState = {
  rolls: number[]; // Raw D20 results (1-20)
  tileNumbers: number[]; // Final unique tile numbers (1-20)
  rollPhase: PortalRollPhase;
};

export type PortalState = {
  // Which players have Harbinger avatar (detected by name)
  harbingerSeats: PlayerKey[];
  // Per-player portal state
  p1: PortalPlayerState | null;
  p2: PortalPlayerState | null;
  // Current player rolling (for sequential dual-harbinger)
  currentRoller: PlayerKey | null;
  // Overall setup complete flag
  setupComplete: boolean;
};

// --- Second Player Seer State ------------------------------------------------
export type SeerPlayerStatus = "pending" | "revealed" | "completed" | "skipped";

export type SeerState = {
  // Which player is the second seat (gets the seer ability)
  secondSeat: PlayerKey;
  // Status of the seer phase
  status: SeerPlayerStatus;
  // Which pile was chosen (null if not yet chosen)
  chosenPile: "spellbook" | "atlas" | null;
  // The decision made (null if not yet decided)
  decision: "top" | "bottom" | "skip" | null;
  // Overall setup complete flag
  setupComplete: boolean;
};

export type PermanentItem = EntityBase<CardRef> & {
  owner: 1 | 2;
  tilt?: number;
  instanceId?: string | null;
  tapVersion?: number; // Version counter for tap/untap state changes
  version?: number; // Generic version counter for other state changes
  // Optional attachment to a permanent at the same tile
  attachedTo?: { at: CellKey; index: number } | null;
  // Generic numeric counter displayed on the card (e.g., +1 counters)
  counters?: number | null; // absent/0 => no counter badge
  damage?: number | null;
  faceDown?: boolean; // Card is flipped face-down (hidden from opponent)
};
export type Permanents = Record<CellKey, PermanentItem[]>;

// --- Magic Interaction (casting) -------------------------------------------------

export type MagicTarget =
  | { kind: "location"; at: CellKey }
  | { kind: "permanent"; at: CellKey; index: number }
  | { kind: "avatar"; seat: PlayerKey }
  | {
      kind: "projectile";
      direction: "N" | "E" | "S" | "W";
      firstHit?: { kind: "permanent" | "avatar"; at: CellKey; index?: number };
      intended?:
        | { kind: "permanent"; at: CellKey; index: number }
        | { kind: "avatar"; seat: PlayerKey };
    };

export type PendingMagic = {
  id: string;
  tile: { x: number; y: number };
  // The spell card placed on board for UX; resolved to cemetery on completion
  spell: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  caster?:
    | { kind: "avatar"; seat: PlayerKey }
    | { kind: "permanent"; at: CellKey; index: number; owner: 1 | 2 }
    | null;
  target?: MagicTarget | null;
  status:
    | "choosingCaster"
    | "choosingTarget"
    | "confirm"
    | "resolving"
    | "cancelled"
    | "resolved";
  hints?: {
    scope: "here" | "adjacent" | "nearby" | "global" | "projectile" | null;
    allow: { location?: boolean; permanent?: boolean; avatar?: boolean };
  } | null;
  createdAt: number;
  summaryText?: string | null;
  guidesSuppressed?: boolean | null;
};

// --- Chaos Twister Minigame State ------------------------------------------------
export type ChaosTwisterPhase =
  | "selectingMinion"
  | "selectingSite"
  | "minigame"
  | "resolving"
  | "complete";

export type ChaosTwisterAccuracy = "green" | "yellow" | "red";

export type PendingChaosTwister = {
  id: string;
  // The spell card on the board
  spell: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  // The caster (player who played the spell)
  casterSeat: PlayerKey;
  // Phase of the minigame
  phase: ChaosTwisterPhase;
  // Selected target minion
  targetMinion: {
    at: CellKey;
    index: number;
    card: CardRef;
    power: number; // The minion's attack power for damage calculation
  } | null;
  // Selected destination site
  targetSite: {
    x: number;
    y: number;
    cellKey: CellKey;
  } | null;
  // Minigame result
  minigameResult: {
    accuracy: ChaosTwisterAccuracy;
    hitPosition: number; // 0-100 where the slider stopped
    landingOffset: number; // 0 = exact, 1 = one tile off, 2 = two tiles off
  } | null;
  // Final landing site after offset calculation
  landingSite: {
    x: number;
    y: number;
    cellKey: CellKey;
  } | null;
  // Synced slider position for opponent to see (0-100)
  sliderPosition?: number;
  createdAt: number;
};

// --- Browse Spell State ------------------------------------------------
// "Look at your next seven spells. Put one in your hand and the rest on the bottom of your spellbook in any order."
export type BrowsePhase =
  | "viewing" // Player is viewing the 7 cards
  | "ordering" // Player is ordering the remaining cards for bottom of spellbook
  | "resolving"
  | "complete";

export type PendingBrowse = {
  id: string;
  // The spell card on the board
  spell: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  // The caster (player who played the spell)
  casterSeat: PlayerKey;
  // Phase of the Browse flow
  phase: BrowsePhase;
  // The 7 cards revealed from spellbook (or fewer if spellbook has less)
  revealedCards: CardRef[];
  // The card selected to put in hand (index into revealedCards)
  selectedCardIndex: number | null;
  // The order for remaining cards to go to bottom (indices into revealedCards, excluding selectedCardIndex)
  bottomOrder: number[];
  createdAt: number;
};

// Context menu targeting for click-driven actions
export type ContextMenuTarget =
  | { kind: "site"; x: number; y: number }
  | { kind: "permanent"; at: CellKey; index: number }
  | { kind: "avatar"; who: PlayerKey }
  | {
      kind: "pile";
      who: PlayerKey;
      from: "spellbook" | "atlas" | "graveyard" | "collection";
    }
  | { kind: "tokenpile"; who: PlayerKey };

export type GameEvent = {
  id: number;
  ts: number;
  text: string;
  turn?: number;
  player?: 1 | 2;
};
export const MAX_EVENTS = 200;
export const BOARD_PING_LIFETIME_MS = 2500;
export const BOARD_PING_MAX_HISTORY = 8;

// Snapshot of serializable game state we can restore on undo
export type SerializedGame = {
  actorKey: PlayerKey | null;
  players: Record<PlayerKey, PlayerState>;
  currentPlayer: 1 | 2;
  turn: number;
  phase: Phase;
  d20Rolls: Record<PlayerKey, number | null>;
  setupWinner: PlayerKey | null;
  board: BoardState;
  showGridOverlay: boolean;
  showPlaymat: boolean;
  cameraMode: "orbit" | "topdown";
  zones: Record<PlayerKey, Zones>;
  selectedCard: { who: PlayerKey; index: number; card: CardRef } | null;
  selectedPermanent: { at: CellKey; index: number } | null;
  avatars: Record<PlayerKey, AvatarState>;
  permanents: Permanents;
  mulligans: Record<PlayerKey, number>;
  mulliganDrawn: Record<PlayerKey, CardRef[]>;
  permanentPositions: GameState["permanentPositions"];
  permanentAbilities: GameState["permanentAbilities"];
  sitePositions: GameState["sitePositions"];
  playerPositions: GameState["playerPositions"];
  events: GameEvent[];
  eventSeq: number;
  portalState: PortalState | null;
};

export type GameState = {
  players: Record<PlayerKey, PlayerState>;
  currentPlayer: 1 | 2;
  turn: number;
  phase: Phase;
  setPhase: (phase: Phase) => void;
  // Track if current player has drawn their card this turn (for Draw phase enforcement)
  hasDrawnThisTurn: boolean;
  setHasDrawnThisTurn: (drawn: boolean) => void;
  // D20 Setup phase
  d20Rolls: Record<PlayerKey, number | null>;
  rollD20: (who: PlayerKey) => void;
  setupWinner: PlayerKey | null;
  choosePlayerOrder: (winner: PlayerKey, wantsToGoFirst: boolean) => void;
  // D20 pending roll for retry logic
  d20PendingRoll: { seat: PlayerKey; roll: number; ts: number } | null;
  retryD20Roll: () => boolean;
  clearD20Pending: () => void;
  // Server patch integration
  applyServerPatch: (patch: unknown, t?: number) => void;
  applyPatch: (patch: unknown) => void;
  lastServerTs: number;
  // Timestamp of the last local action we attempted to send to server
  lastLocalActionTs: number;
  // Multiplayer transport (null => offline)
  transport: GameTransport | null;
  setTransport: (t: GameTransport | null) => void;
  // Current online match id (null offline). Used for per-match persistence.
  matchId: string | null;
  setMatchId: (id: string | null) => void;
  // Local seat/actor (only set in online play UI; null in offline)
  actorKey: PlayerKey | null;
  setActorKey: (key: PlayerKey | null) => void;
  localPlayerId: string | null;
  setLocalPlayerId: (id: string | null) => void;
  opponentPlayerId: string | null;
  setOpponentPlayerId: (id: string | null) => void;
  // Match end detection
  matchEnded: boolean;
  winner: PlayerKey | null;
  checkMatchEnd: () => void;
  // Manual tie declaration when both players are at Death's Door
  tieGame: () => void;
  // Cross-turn interactions
  interactionLog: InteractionStateMap;
  pendingInteractionId: string | null;
  acknowledgedInteractionIds: Record<string, true>;
  activeInteraction: InteractionRequestEntry | null;
  sendInteractionRequest: (input: SendInteractionRequestInput) => void;
  receiveInteractionEnvelope: (
    envelope: InteractionEnvelope | InteractionMessage
  ) => void;
  // New: handle server-executed interaction outcomes
  receiveInteractionResult: (message: InteractionResultMessage) => void;
  respondToInteraction: (
    requestId: string,
    decision: InteractionDecision,
    actorId: string,
    options?: InteractionResponseOptions
  ) => void;
  expireInteraction: (requestId: string) => void;
  clearInteraction: (requestId: string) => void;
  transportSubscriptions: Array<() => void>;
  // Feature flag: opt-in guided overlays for combat interactions (local preference)
  interactionGuides: boolean;
  setInteractionGuides: (on: boolean) => void;
  // Feature flag: opt-in guided overlays for magic casting (local preference)
  magicGuides: boolean;
  setMagicGuides: (on: boolean) => void;
  // Per-seat guide preferences (match scope; used to derive effective flags)
  combatGuideSeatPrefs: Record<PlayerKey, boolean>;
  magicGuideSeatPrefs: Record<PlayerKey, boolean>;
  // Effective guide state: enabled only when both seats have their toggles on
  combatGuidesActive: boolean;
  magicGuidesActive: boolean;
  // Action notifications (toasts for play/draw/move actions)
  actionNotifications: boolean;
  setActionNotifications: (on: boolean) => void;
  // Card meta cache (subset) used to detect base power quickly
  metaByCardId: Record<
    number,
    { attack: number | null; defence: number | null; cost: number | null }
  >;
  fetchCardMeta: (ids: number[]) => Promise<void>;
  // Pending combat (MVP)
  pendingCombat: {
    id: string;
    tile: { x: number; y: number };
    attacker: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      isAvatar?: boolean; // True if attacker is an avatar
      avatarSeat?: PlayerKey; // Which player's avatar
    };
    target?: {
      kind: "permanent" | "avatar" | "site";
      at: CellKey;
      index: number | null;
    } | null;
    defenderSeat: PlayerKey | null;
    defenders: Array<{
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
    }>;
    status: "declared" | "defending" | "committed" | "resolved" | "cancelled";
    assignment?: Array<{ at: CellKey; index: number; amount: number }> | null;
    createdAt: number;
  } | null;
  // HUD-driven combat UI (lifted from Board for layout-level overlays)
  attackChoice: {
    tile: { x: number; y: number };
    attacker: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      isAvatar?: boolean; // True if attacker is an avatar
      avatarSeat?: PlayerKey; // Which player's avatar
    };
    attackerName?: string | null;
  } | null;
  attackTargetChoice: {
    tile: { x: number; y: number };
    attacker: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      isAvatar?: boolean;
      avatarSeat?: PlayerKey;
    };
    candidates: Array<{
      kind: "permanent" | "avatar" | "site";
      at: CellKey;
      index: number | null;
      label: string;
    }>;
  } | null;
  attackConfirm: {
    tile: { x: number; y: number };
    attacker: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      isAvatar?: boolean;
      avatarSeat?: PlayerKey;
    };
    target: {
      kind: "permanent" | "avatar" | "site";
      at: CellKey;
      index: number | null;
    };
    targetLabel: string;
  } | null;
  setAttackChoice: (v: GameState["attackChoice"]) => void;
  setAttackTargetChoice: (v: GameState["attackTargetChoice"]) => void;
  setAttackConfirm: (v: GameState["attackConfirm"]) => void;
  // Signal Board to revert last cross-tile move (handled locally there)
  revertCrossMoveTick: number;
  requestRevertCrossMove: () => void;
  lastCombatSummary: {
    id: string;
    text: string;
    ts: number;
    actor?: PlayerKey;
    targetSeat?: PlayerKey;
  } | null;
  setLastCombatSummary: (
    smm: {
      id: string;
      text: string;
      ts: number;
      actor?: PlayerKey;
      targetSeat?: PlayerKey;
    } | null
  ) => void;
  declareAttack: (
    tile: { x: number; y: number },
    attacker: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      isAvatar?: boolean;
      avatarSeat?: PlayerKey;
    },
    target?: {
      kind: "permanent" | "avatar" | "site";
      at: CellKey;
      index: number | null;
    } | null
  ) => void;
  // Trigger an intercept offer after a Move Only action by the attacker
  offerIntercept: (
    tile: { x: number; y: number },
    attacker: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      isAvatar?: boolean;
      avatarSeat?: PlayerKey;
    }
  ) => void;
  setDefenderSelection: (
    defenders: Array<{
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
    }>
  ) => void;
  commitDefenders: () => void;
  setDamageAssignment: (
    asgn: Array<{ at: CellKey; index: number; amount: number }>
  ) => boolean;
  resolveCombat: () => void;
  autoResolveCombat: () => void;
  cancelCombat: () => void;
  applyDamageToPermanent: (at: CellKey, index: number, amount: number) => void;
  clearAllDamageForSeat: (seat: PlayerKey) => void;
  setTapPermanent: (at: CellKey, index: number, tapped: boolean) => void;
  // Magic casting flow (MVP)
  pendingMagic: PendingMagic | null;
  // Chaos Twister minigame flow
  pendingChaosTwister: PendingChaosTwister | null;
  beginChaosTwister: (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => void;
  selectChaosTwisterMinion: (minion: {
    at: CellKey;
    index: number;
    card: CardRef;
    power: number;
  }) => void;
  selectChaosTwisterSite: (site: { x: number; y: number }) => void;
  completeChaosTwisterMinigame: (result: {
    accuracy: ChaosTwisterAccuracy;
    hitPosition: number;
  }) => void;
  resolveChaosTwister: () => void;
  cancelChaosTwister: () => void;
  // Browse spell flow
  pendingBrowse: PendingBrowse | null;
  beginBrowse: (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => void;
  selectBrowseCard: (cardIndex: number) => void;
  setBrowseBottomOrder: (order: number[]) => void;
  resolveBrowse: () => void;
  cancelBrowse: () => void;
  beginMagicCast: (input: {
    tile: { x: number; y: number };
    spell: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    presetCaster?:
      | { kind: "avatar"; seat: PlayerKey }
      | { kind: "permanent"; at: CellKey; index: number; owner: 1 | 2 }
      | null;
  }) => void;
  setMagicCasterChoice: (
    caster:
      | { kind: "avatar"; seat: PlayerKey }
      | { kind: "permanent"; at: CellKey; index: number; owner: 1 | 2 }
      | null
  ) => void;
  setMagicTargetChoice: (target: MagicTarget | null) => void;
  confirmMagic: () => void;
  resolveMagic: () => void;
  cancelMagic: () => void;
  // Generic lightweight message handler
  receiveCustomMessage: (msg: CustomMessage) => void;
  // Safe patch sending
  pendingPatches: ServerPatchT[];
  trySendPatch: (patch: ServerPatchT) => boolean;
  // D20 patches bypass batching and send immediately for reliability
  trySendD20Patch: (patch: ServerPatchT) => boolean;
  flushPendingPatches: () => void;
  addLife: (who: PlayerKey, delta: number) => void;
  addMana: (who: PlayerKey, delta: number) => void;
  addThreshold: (
    who: PlayerKey,
    element: keyof Thresholds,
    delta: number
  ) => void;
  nextPhase: () => void; // legacy manual stepping
  endTurn: () => void; // auto-resolve to next player's Main
  // Board
  board: BoardState;
  showGridOverlay: boolean;
  showPlaymat: boolean;
  showPlaymatOverlay: boolean;
  playmatUrl: string;
  allowSiteDrag: boolean;
  setPlaymatUrl: (url: string) => void;
  togglePlaymatOverlay: () => void;
  toggleAllowSiteDrag: () => void;
  // Camera / view mode
  cameraMode: "orbit" | "topdown";
  setCameraMode: (mode: "orbit" | "topdown") => void;
  toggleCameraMode: () => void;
  toggleGridOverlay: () => void;
  togglePlaymat: () => void;
  toggleTapSite: (x: number, y: number) => void;
  // Zones and actions
  zones: Record<PlayerKey, Zones>;
  initLibraries: (
    who: PlayerKey,
    spellbook: CardRef[],
    atlas: CardRef[],
    collection?: CardRef[]
  ) => void;
  shuffleSpellbook: (who: PlayerKey) => void;
  shuffleAtlas: (who: PlayerKey) => void;
  drawFrom: (
    who: PlayerKey,
    from: "spellbook" | "atlas",
    count?: number
  ) => void;
  drawFromBottom: (
    who: PlayerKey,
    from: "spellbook" | "atlas",
    count?: number
  ) => void;
  scryTop: (
    who: PlayerKey,
    from: "spellbook" | "atlas",
    decision: "top" | "bottom"
  ) => void;
  scryMany: (
    who: PlayerKey,
    from: "spellbook" | "atlas",
    count: number,
    bottomIndexes: number[]
  ) => void;
  drawOpening: (
    who: PlayerKey,
    spellbookCount?: number,
    atlasCount?: number
  ) => void;
  selectedCard: { who: PlayerKey; index: number; card: CardRef } | null;
  selectedPermanent: { at: CellKey; index: number } | null;
  selectedAvatar: PlayerKey | null;
  // Hand visibility state
  mouseInHandZone: boolean;
  handHoverCount: number;
  setMouseInHandZone: (inZone: boolean) => void;
  setHandHoverCount: (count: number) => void;
  selectHandCard: (who: PlayerKey, index: number) => void;
  selectAvatar: (who: PlayerKey) => void;
  clearSelection: () => void;
  playSelectedTo: (x: number, y: number) => void;
  playFromPileTo: (x: number, y: number) => void;
  drawFromPileToHand: () => void;
  moveCardFromHandToPile: (
    who: PlayerKey,
    pile: "spellbook" | "atlas",
    position: "top" | "bottom"
  ) => void;
  selectPermanent: (at: CellKey, index: number) => void;
  moveSelectedPermanentTo: (x: number, y: number) => void;
  moveSelectedPermanentToWithOffset: (
    x: number,
    y: number,
    offset: [number, number]
  ) => void;
  setPermanentOffset: (
    at: CellKey,
    index: number,
    offset: [number, number]
  ) => void;
  toggleTapPermanent: (at: CellKey, index: number) => void;
  toggleFaceDown: (at: CellKey, index: number) => void;
  // Generic counters on permanents
  addCounterOnPermanent: (at: CellKey, index: number) => void; // creates or increments (1 if missing)
  incrementPermanentCounter: (at: CellKey, index: number) => void;
  decrementPermanentCounter: (at: CellKey, index: number) => void; // destroys when reaching 0
  clearPermanentCounter: (at: CellKey, index: number) => void; // remove badge entirely
  // Move cards from board back to zones
  movePermanentToZone: (
    at: CellKey,
    index: number,
    target: "hand" | "graveyard" | "banished" | "spellbook",
    position?: "top" | "bottom"
  ) => void;
  moveSiteToZone: (
    x: number,
    y: number,
    target: "hand" | "graveyard" | "banished" | "atlas",
    position?: "top" | "bottom"
  ) => void;
  moveSiteToGraveyardWithRubble: (
    x: number,
    y: number,
    placeRubble: boolean
  ) => void;
  moveFromBanishedToZone: (
    who: PlayerKey,
    instanceId: string,
    target: "hand" | "graveyard"
  ) => void;
  moveFromGraveyardToBanished: (who: PlayerKey, instanceId: string) => void;
  banishEntireGraveyard: (who: PlayerKey) => void;
  // Handle peeked card action (from peek dialog)
  handlePeekedCard: (
    who: PlayerKey,
    pile: "spellbook" | "atlas" | "hand",
    cardIndex: number,
    action: "top" | "bottom" | "hand" | "graveyard" | "banish"
  ) => void;
  // Transfer control
  transferPermanentControl: (at: CellKey, index: number, to?: 1 | 2) => void;
  transferSiteControl: (x: number, y: number, to?: 1 | 2) => void;
  // Switch site position (Earthquake, Rift Valley) - moves all permanents/avatars with the site
  switchSitePosition: (
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number
  ) => void;
  avatars: Record<PlayerKey, AvatarState>;
  permanents: Permanents;
  setAvatarCard: (who: PlayerKey, card: CardRef) => void;
  setAvatarChampion: (who: PlayerKey, champion: ChampionRef | null) => void;
  placeAvatarAtStart: (who: PlayerKey) => void;
  moveAvatarTo: (who: PlayerKey, x: number, y: number) => void;
  moveAvatarToWithOffset: (
    who: PlayerKey,
    x: number,
    y: number,
    offset: [number, number]
  ) => void;
  setAvatarOffset: (who: PlayerKey, offset: [number, number] | null) => void;
  toggleTapAvatar: (who: PlayerKey) => void;
  addCounterOnAvatar: (who: PlayerKey) => void;
  incrementAvatarCounter: (who: PlayerKey) => void;
  decrementAvatarCounter: (who: PlayerKey) => void;
  clearAvatarCounter: (who: PlayerKey) => void;
  // Harbinger Portal State (Gothic expansion)
  portalState: PortalState | null;
  initPortalState: (harbingerSeats: PlayerKey[]) => void;
  setPortalCurrentRoller: (seat: PlayerKey | null) => void;
  rollPortalDie: (seat: PlayerKey, dieIndex: number) => void;
  rerollPortalDie: (seat: PlayerKey, dieIndex: number) => void;
  finalizePortalRolls: (seat: PlayerKey) => void;
  completePortalSetup: () => void;
  // Second Player Seer State
  seerState: SeerState | null;
  initSeerState: (secondSeat: PlayerKey) => void;
  setSeerPile: (pile: "spellbook" | "atlas") => void;
  revealSeerCard: () => void;
  completeSeer: (decision: "top" | "bottom" | "skip") => void;
  // Imposter Mask State (Gothic expansion)
  // Tracks when an Imposter avatar is wearing a mask (another avatar from collection)
  imposterMasks: Record<PlayerKey, ImposterMaskState | null>;
  // Mask yourself: banish avatar from collection to become that avatar (costs 3 mana)
  maskWith: (who: PlayerKey, maskAvatar: CardRef) => boolean;
  // Unmask: banish the mask avatar and restore original Imposter
  unmask: (who: PlayerKey) => void;
  // Break mask due to damage (automatic unmask)
  breakMask: (who: PlayerKey) => void;
  // Mulligans
  mulligans: Record<PlayerKey, number>;
  mulligan: (who: PlayerKey) => void;
  mulliganWithSelection: (who: PlayerKey, indices: number[]) => void;
  mulliganDrawn: Record<PlayerKey, CardRef[]>;
  finalizeMulligan: () => void;
  // Reset all game state to initial values (for new matches)
  resetGameState: () => void;
  // Events / console
  events: GameEvent[];
  eventSeq: number;
  log: (text: string) => void;
  boardPings: BoardPingEvent[];
  pushBoardPing: (ping: Omit<BoardPingEvent, "ts"> & { ts?: number }) => void;
  removeBoardPing: (id: string) => void;
  lastPointerWorldPos: { x: number; z: number } | null;
  setLastPointerWorldPos: (pos: { x: number; z: number } | null) => void;
  // UI cross-surface drag state
  dragFromHand: boolean;
  dragFromPile: {
    who: PlayerKey;
    from: "spellbook" | "atlas" | "graveyard" | "collection" | "tokens";
    card: CardRef | null;
  } | null;
  setDragFromHand: (on: boolean) => void;
  setDragFromPile: (
    info: {
      who: PlayerKey;
      from: "spellbook" | "atlas" | "graveyard" | "collection" | "tokens";
      card: CardRef | null;
    } | null
  ) => void;
  hoverCell: [number, number] | null;
  setHoverCell: (x: number, y: number) => void;
  clearHoverCell: () => void;
  // Hover preview card
  previewCard: CardRef | null;
  setPreviewCard: (card: CardRef | null) => void;
  // Context menu
  contextMenu: {
    target: ContextMenuTarget;
    screen?: { x: number; y: number };
  } | null;
  openContextMenu: (
    target: ContextMenuTarget,
    screen?: { x: number; y: number }
  ) => void;
  closeContextMenu: () => void;
  // Switch site position selection (Earthquake, Rift Valley)
  switchSiteSource: { x: number; y: number } | null;
  setSwitchSiteSource: (source: { x: number; y: number } | null) => void;
  // Placement dialog for cards to piles
  placementDialog: {
    cardName: string;
    pileName: string;
    onPlace: (position: "top" | "bottom") => void;
  } | null;
  openPlacementDialog: (
    cardName: string,
    pileName: string,
    onPlace: (position: "top" | "bottom") => void
  ) => void;
  closePlacementDialog: () => void;
  // Search dialog for pile contents
  searchDialog: {
    pileName: string;
    cards: CardRef[];
    onSelectCard: (card: CardRef) => void;
    onBanishCard?: (card: CardRef) => void;
    banishRequiresConsent?: boolean;
  } | null;
  openSearchDialog: (
    pileName: string,
    cards: CardRef[],
    onSelectCard: (card: CardRef) => void,
    options?: {
      onBanishCard?: (card: CardRef) => void;
      banishRequiresConsent?: boolean;
    }
  ) => void;
  closeSearchDialog: () => void;
  // Peek-only dialog used for reveals (with optional card actions)
  peekDialog: {
    title?: string;
    cards: CardRef[];
    source?: {
      seat: PlayerKey;
      pile: "spellbook" | "atlas" | "hand";
      from: "top" | "bottom";
    };
  } | null;
  openPeekDialog: (
    title: string,
    cards: CardRef[],
    source?: {
      seat: PlayerKey;
      pile: "spellbook" | "atlas" | "hand";
      from: "top" | "bottom";
    }
  ) => void;
  closePeekDialog: () => void;
  // Tokens
  addTokenToHand: (who: PlayerKey, name: string) => void;
  // Add arbitrary card to hand (for toolbox/debugging)
  addCardToHand: (who: PlayerKey, card: CardRef) => void;
  attachTokenToTopPermanent: (at: CellKey, index: number) => void;
  attachTokenToPermanent: (
    at: CellKey,
    tokenIndex: number,
    targetIndex: number
  ) => void;
  attachPermanentToAvatar: (
    at: CellKey,
    permanentIndex: number,
    avatarKey: PlayerKey
  ) => void;
  detachToken: (at: CellKey, index: number) => void;
  // Derived selectors (pure getters)
  getPlayerSites: (who: PlayerKey) => Array<[CellKey, SiteTile]>;
  getUntappedSitesCount: (who: PlayerKey) => number;
  getBaseMana: (who: PlayerKey) => number; // total mana from untapped sites (before spending)
  getAvailableMana: (who: PlayerKey) => number; // remaining mana (base + offset from spending)
  getThresholdTotals: (who: PlayerKey) => Thresholds;
  // History / Undo
  history: SerializedGame[];
  historyByPlayer: Record<PlayerKey, SerializedGame[]>;
  pushHistory: () => void;
  undo: () => void;
  snapshots: Array<{
    id: string;
    title: string;
    ts: number;
    includePrivate: boolean;
    kind: "auto" | "manual";
    turn: number;
    actor: PlayerKey | null;
    payload: ServerPatchT;
  }>;
  createSnapshot: (title: string, kind?: "auto" | "manual") => void;
  hydrateSnapshotsFromStorage: () => void;

  // Permanent Position Management (Burrow/Submerge)
  permanentPositions: Record<number, PermanentPosition>; // permanentId -> position
  permanentAbilities: Record<number, BurrowAbility>; // permanentId -> ability
  sitePositions: Record<number, SitePositionData>; // siteId -> position data
  playerPositions: Record<PlayerKey, PlayerPositionReference>; // player -> position

  // Position Actions
  setPermanentPosition: (
    permanentId: number,
    position: PermanentPosition
  ) => void;
  updatePermanentState: (
    permanentId: number,
    newState: PermanentPositionState
  ) => void;
  setPermanentAbility: (permanentId: number, ability: BurrowAbility) => void;
  setSitePosition: (siteId: number, positionData: SitePositionData) => void;
  setPlayerPosition: (
    playerId: PlayerKey,
    position: PlayerPositionReference
  ) => void;

  // Validation and Utilities
  canTransitionState: (
    permanentId: number,
    targetState: PermanentPositionState
  ) => boolean;
  getAvailableActions: (permanentId: number) => ContextMenuAction[];
  calculateEdgePosition: (
    tileCoords: { x: number; z: number },
    playerPos: { x: number; z: number }
  ) => { x: number; z: number };
  calculatePlacementAngle: (
    tilePos: { x: number; z: number },
    playerPos: { x: number; z: number }
  ) => number;
  // Remote cursor telemetry
  remoteCursors: Record<string, RemoteCursorState>;
  setRemoteCursor: (cursor: RemoteCursorState) => void;
  pruneRemoteCursors: (olderThanMs: number) => void;
  getRemoteHighlightColor: (
    card: { cardId?: number | null; slug?: string | null } | null | undefined,
    options?: { instanceKey?: string | null }
  ) => string | null;
};

// Typed view of server patchable fields (subset of GameState, pure data only)
export type ServerPatchT = Partial<{
  players: GameState["players"];
  currentPlayer: GameState["currentPlayer"];
  turn: GameState["turn"];
  phase: GameState["phase"];
  hasDrawnThisTurn: GameState["hasDrawnThisTurn"];
  d20Rolls: GameState["d20Rolls"];
  setupWinner: GameState["setupWinner"];
  matchEnded: GameState["matchEnded"];
  winner: GameState["winner"];
  board: GameState["board"];
  zones: GameState["zones"];
  avatars: GameState["avatars"];
  permanents: GameState["permanents"];
  mulligans: GameState["mulligans"];
  mulliganDrawn: GameState["mulliganDrawn"];
  permanentPositions: GameState["permanentPositions"];
  permanentAbilities: GameState["permanentAbilities"];
  sitePositions: GameState["sitePositions"];
  playerPositions: GameState["playerPositions"];
  events: GameState["events"];
  eventSeq: GameState["eventSeq"];
  portalState: GameState["portalState"];
  seerState: GameState["seerState"];
  imposterMasks: GameState["imposterMasks"];
  __replaceKeys: string[];
}>;
