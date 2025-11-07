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
  mana: number;
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

export type InteractionRecordStatus = "pending" | InteractionDecision | "expired";

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
  thresholds?: Partial<Thresholds> | null; // cost/requirements
  owner?: PlayerKey | null;
  instanceId?: string | null;
};

export type Zones = {
  spellbook: CardRef[]; // spells/creatures
  atlas: CardRef[]; // sites
  hand: CardRef[];
  graveyard: CardRef[];
  battlefield: CardRef[]; // non-site permanents for now
  banished: CardRef[]; // removed for the rest of the game
};

// Shared base for all board entities (avatars and permanents)
export type EntityBase<TCard> = {
  card: TCard;
  offset?: [number, number] | null;
  tapped?: boolean;
};

export type AvatarState = EntityBase<CardRef | null> & {
  pos: [number, number] | null;
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
};
export type Permanents = Record<CellKey, PermanentItem[]>;

// Context menu targeting for click-driven actions
export type ContextMenuTarget =
  | { kind: "site"; x: number; y: number }
  | { kind: "permanent"; at: CellKey; index: number }
  | { kind: "avatar"; who: PlayerKey }
  | { kind: "pile"; who: PlayerKey; from: "spellbook" | "atlas" | "graveyard" }
  | { kind: "tokenpile"; who: PlayerKey };

export type GameEvent = { id: number; ts: number; text: string; turn?: number };
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
};

export type GameState = {
  players: Record<PlayerKey, PlayerState>;
  currentPlayer: 1 | 2;
  turn: number;
  phase: Phase;
  setPhase: (phase: Phase) => void;
  // D20 Setup phase
  d20Rolls: Record<PlayerKey, number | null>;
  rollD20: (who: PlayerKey) => void;
  setupWinner: PlayerKey | null;
  choosePlayerOrder: (winner: PlayerKey, wantsToGoFirst: boolean) => void;
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
  // Feature flag: opt-in guided overlays for combat interactions
  interactionGuides: boolean;
  setInteractionGuides: (on: boolean) => void;
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
    attacker: { at: CellKey; index: number; instanceId?: string | null; owner: 1 | 2 };
    target?: { kind: "permanent" | "avatar" | "site"; at: CellKey; index: number | null } | null;
    defenderSeat: PlayerKey | null;
    defenders: Array<{ at: CellKey; index: number; instanceId?: string | null; owner: 1 | 2 }>;
    status: "declared" | "defending" | "committed" | "resolved" | "cancelled";
    assignment?: Array<{ at: CellKey; index: number; amount: number }> | null;
    createdAt: number;
  } | null;
  // HUD-driven combat UI (lifted from Board for layout-level overlays)
  attackChoice: {
    tile: { x: number; y: number };
    attacker: { at: CellKey; index: number; instanceId?: string | null; owner: 1 | 2 };
    attackerName?: string | null;
  } | null;
  attackTargetChoice: {
    tile: { x: number; y: number };
    attacker: { at: CellKey; index: number; instanceId?: string | null; owner: 1 | 2 };
    candidates: Array<{ kind: "permanent" | "avatar" | "site"; at: CellKey; index: number | null; label: string }>;
  } | null;
  attackConfirm: {
    tile: { x: number; y: number };
    attacker: { at: CellKey; index: number; instanceId?: string | null; owner: 1 | 2 };
    target: { kind: "permanent" | "avatar" | "site"; at: CellKey; index: number | null };
    targetLabel: string;
  } | null;
  setAttackChoice: (v: GameState["attackChoice"]) => void;
  setAttackTargetChoice: (v: GameState["attackTargetChoice"]) => void;
  setAttackConfirm: (v: GameState["attackConfirm"]) => void;
  // Signal Board to revert last cross-tile move (handled locally there)
  revertCrossMoveTick: number;
  requestRevertCrossMove: () => void;
  lastCombatSummary: { id: string; text: string; ts: number; actor?: PlayerKey; targetSeat?: PlayerKey } | null;
  setLastCombatSummary: (smm: { id: string; text: string; ts: number; actor?: PlayerKey; targetSeat?: PlayerKey } | null) => void;
  declareAttack: (
    tile: { x: number; y: number },
    attacker: { at: CellKey; index: number; instanceId?: string | null; owner: 1 | 2 },
    target?: { kind: "permanent" | "avatar" | "site"; at: CellKey; index: number | null } | null
  ) => void;
  // Trigger an intercept offer after a Move Only action by the attacker
  offerIntercept: (
    tile: { x: number; y: number },
    attacker: { at: CellKey; index: number; instanceId?: string | null; owner: 1 | 2 }
  ) => void;
  setDefenderSelection: (
    defenders: Array<{ at: CellKey; index: number; instanceId?: string | null; owner: 1 | 2 }>
  ) => void;
  commitDefenders: () => void;
  setDamageAssignment: (asgn: Array<{ at: CellKey; index: number; amount: number }>) => boolean;
  resolveCombat: () => void;
  autoResolveCombat: () => void;
  cancelCombat: () => void;
  applyDamageToPermanent: (at: CellKey, index: number, amount: number) => void;
  clearAllDamageForSeat: (seat: PlayerKey) => void;
  setTapPermanent: (at: CellKey, index: number, tapped: boolean) => void;
  // Generic lightweight message handler
  receiveCustomMessage: (msg: CustomMessage) => void;
  // Safe patch sending
  pendingPatches: ServerPatchT[];
  trySendPatch: (patch: ServerPatchT) => boolean;
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
    atlas: CardRef[]
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
  moveFromBanishedToZone: (
    who: PlayerKey,
    instanceId: string,
    target: "hand" | "graveyard"
  ) => void;
  // Transfer control
  transferPermanentControl: (at: CellKey, index: number, to?: 1 | 2) => void;
  transferSiteControl: (x: number, y: number, to?: 1 | 2) => void;
  avatars: Record<PlayerKey, AvatarState>;
  permanents: Permanents;
  setAvatarCard: (who: PlayerKey, card: CardRef) => void;
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
    from: "spellbook" | "atlas" | "graveyard" | "tokens";
    card: CardRef | null;
  } | null;
  setDragFromHand: (on: boolean) => void;
  setDragFromPile: (
    info: {
      who: PlayerKey;
      from: "spellbook" | "atlas" | "graveyard" | "tokens";
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
  } | null;
  openSearchDialog: (
    pileName: string,
    cards: CardRef[],
    onSelectCard: (card: CardRef) => void
  ) => void;
  closeSearchDialog: () => void;
  // Peek-only dialog used for reveals (no selection handler)
  peekDialog: { title?: string; cards: CardRef[] } | null;
  openPeekDialog: (title: string, cards: CardRef[]) => void;
  closePeekDialog: () => void;
  // Tokens
  addTokenToHand: (who: PlayerKey, name: string) => void;
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
  getAvailableMana: (who: PlayerKey) => number; // default: 1 per untapped site
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
  __replaceKeys: string[];
}>;
