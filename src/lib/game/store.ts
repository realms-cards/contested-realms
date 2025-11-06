import { create, type StateCreator } from "zustand";
import { PLAYER_COLORS } from "@/lib/game/constants";
import {
  MANA_PROVIDER_BY_NAME,
  THRESHOLD_GRANT_BY_NAME,
  NON_MANA_SITE_IDENTIFIERS,
} from "@/lib/game/mana-providers";
import {
  TOKEN_BY_NAME,
  newTokenInstanceId,
  tokenSlug,
} from "@/lib/game/tokens";
import type {
  InteractionEnvelope,
  InteractionGrant,
  InteractionGrantRequest,
  InteractionDecision,
  InteractionMessage,
  InteractionRequestMessage,
  InteractionResponseMessage,
  InteractionRequestKind,
  InteractionResultMessage,
} from "@/lib/net/interactions";
import {
  wrapInteractionMessage,
  grantFromRequest,
  generateInteractionRequestId,
  createInteractionRequest,
  createInteractionResponse,
} from "@/lib/net/interactions";
import type { GameTransport, CustomMessage } from "@/lib/net/transport";
import type {
  LifeState,
  Phase,
  PlayerKey,
  PlayerState,
  Thresholds,
} from "./store/baseTypes";
import type { RemoteCursorState } from "./store/remoteCursor";
import type {
  PermanentPosition,
  SitePositionData,
  BurrowAbility,
  ContextMenuAction,
  PermanentPositionState,
  PlayerPositionReference,
} from "./types";

export { REMOTE_CURSOR_TTL_MS } from "./store/remoteCursor";
export type {
  LifeState,
  Phase,
  PlayerKey,
  PlayerState,
  Thresholds,
} from "./store/baseTypes";
export type { RemoteCursorState } from "./store/remoteCursor";

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

type InteractionRecordStatus = "pending" | InteractionDecision | "expired";

type InteractionRequestEntry = {
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

type InteractionStateMap = Record<string, InteractionRequestEntry>;

type SendInteractionRequestInput = {
  from: string;
  to: string;
  kind: InteractionRequestKind;
  matchId?: string;
  payload?: Record<string, unknown>;
  note?: string;
  requestId?: string;
  grant?: InteractionGrantRequest;
};

type InteractionResponseOptions = {
  reason?: string;
  payload?: Record<string, unknown>;
  grant?: InteractionGrantRequest;
};

function normalizeGrantRequest(
  candidate: unknown
): InteractionGrantRequest | null {
  if (!candidate || typeof candidate !== "object") return null;
  const src = candidate as Record<string, unknown>;
  const normalized: InteractionGrantRequest = {};
  if ("targetSeat" in src) {
    const seat = src.targetSeat;
    if (seat === "p1" || seat === "p2" || seat === null) {
      normalized.targetSeat = seat;
    }
  }
  if (typeof src.expiresAt === "number" && Number.isFinite(src.expiresAt)) {
    normalized.expiresAt = src.expiresAt;
  }
  if (typeof src.singleUse === "boolean") {
    normalized.singleUse = src.singleUse;
  }
  if (typeof src.allowOpponentZoneWrite === "boolean") {
    normalized.allowOpponentZoneWrite = src.allowOpponentZoneWrite;
  }
  if (typeof src.allowRevealOpponentHand === "boolean") {
    normalized.allowRevealOpponentHand = src.allowRevealOpponentHand;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function pickNextPendingInteraction(
  log: InteractionStateMap
): InteractionRequestEntry | null {
  let selected: InteractionRequestEntry | null = null;
  for (const entry of Object.values(log)) {
    if (!entry || entry.status !== "pending") continue;
    if (!selected) {
      selected = entry;
      continue;
    }
    if (selected.direction === "outbound" && entry.direction === "inbound") {
      selected = entry;
      continue;
    }
    if (
      entry.direction === selected.direction &&
      entry.receivedAt < selected.receivedAt
    ) {
      selected = entry;
    }
  }
  return selected;
}

function computeInteractionFocus(log: InteractionStateMap): {
  active: InteractionRequestEntry | null;
  pendingId: string | null;
} {
  const next = pickNextPendingInteraction(log);
  return {
    active: next,
    pendingId: next ? next.request.requestId : null,
  };
}

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

function createEmptyPlayerZones(): Zones {
  return {
    spellbook: [],
    atlas: [],
    hand: [],
    graveyard: [],
    battlefield: [],
    banished: [],
  };
}

function createEmptyZonesRecord(): Record<PlayerKey, Zones> {
  return {
    p1: createEmptyPlayerZones(),
    p2: createEmptyPlayerZones(),
  };
}

function ensurePlayerZones(
  candidate: Partial<Zones> | undefined,
  fallback?: Zones
): Zones {
  const base = fallback ?? createEmptyPlayerZones();
  const spellbook = candidate?.spellbook;
  const atlas = candidate?.atlas;
  const hand = candidate?.hand;
  const graveyard = candidate?.graveyard;
  const battlefield = candidate?.battlefield;
  const banished = candidate?.banished;
  return {
    spellbook: normalizeCardRefList(spellbook, base.spellbook),
    atlas: normalizeCardRefList(atlas, base.atlas),
    hand: normalizeCardRefList(hand, base.hand),
    graveyard: normalizeCardRefList(graveyard, base.graveyard),
    battlefield: normalizeCardRefList(battlefield, base.battlefield),
    banished: normalizeCardRefList(banished, base.banished),
  };
}

function normalizeZones(
  zones: Partial<Record<PlayerKey, Partial<Zones>>> | undefined,
  prev?: Record<PlayerKey, Zones>
): Record<PlayerKey, Zones> {
  const base = prev ?? createEmptyZonesRecord();
  return {
    p1: ensurePlayerZones(zones?.p1, base.p1),
    p2: ensurePlayerZones(zones?.p2, base.p2),
  };
}

function createEmptyAvatarState(): AvatarState {
  return { card: null, pos: null, tapped: false };
}

function createDefaultAvatars(): Record<PlayerKey, AvatarState> {
  return {
    p1: createEmptyAvatarState(),
    p2: createEmptyAvatarState(),
  };
}

function ensureAvatarState(
  candidate: Partial<AvatarState> | undefined,
  fallback: AvatarState | undefined
): AvatarState {
  const base = fallback ? { ...fallback } : createEmptyAvatarState();
  const next: AvatarState = {
    ...base,
    card:
      candidate && "card" in candidate
        ? candidate.card ?? null
        : base.card ?? null,
    pos:
      candidate && Array.isArray(candidate.pos) && candidate.pos.length === 2
        ? [candidate.pos[0] ?? 0, candidate.pos[1] ?? 0]
        : base.pos ?? null,
    tapped:
      candidate && typeof candidate.tapped === "boolean"
        ? candidate.tapped
        : base.tapped ?? false,
  };
  if (candidate && "offset" in candidate) {
    next.offset = candidate.offset ?? null;
  } else if (base.offset !== undefined) {
    next.offset = base.offset;
  } else {
    delete next.offset;
  }
  return next;
}

function normalizeAvatars(
  avatars: Partial<Record<PlayerKey, Partial<AvatarState>>> | undefined,
  prev?: Record<PlayerKey, AvatarState>
): Record<PlayerKey, AvatarState> {
  const base = prev ?? createDefaultAvatars();
  return {
    p1: ensureAvatarState(avatars?.p1, base.p1),
    p2: ensureAvatarState(avatars?.p2, base.p2),
  };
}

function createDefaultPlayerPosition(who: PlayerKey): PlayerPositionReference {
  return {
    playerId: who === "p1" ? 1 : 2,
    position: { x: 0, z: 0 },
  };
}

function createDefaultPlayerPositions(): Record<
  PlayerKey,
  PlayerPositionReference
> {
  return {
    p1: createDefaultPlayerPosition("p1"),
    p2: createDefaultPlayerPosition("p2"),
  };
}

function ensurePlayerPosition(
  who: PlayerKey,
  candidate: Partial<PlayerPositionReference> | undefined,
  fallback: PlayerPositionReference | undefined
): PlayerPositionReference {
  const base = fallback ? { ...fallback } : createDefaultPlayerPosition(who);
  const coord =
    candidate && typeof candidate.position === "object"
      ? candidate.position
      : undefined;
  return {
    playerId:
      candidate && typeof candidate.playerId === "number"
        ? candidate.playerId
        : base.playerId,
    position: {
      x: coord && typeof coord.x === "number" ? coord.x : base.position.x,
      z: coord && typeof coord.z === "number" ? coord.z : base.position.z,
    },
  };
}

function normalizePlayerPositions(
  positions:
    | Partial<Record<PlayerKey, Partial<PlayerPositionReference>>>
    | undefined,
  prev?: Record<PlayerKey, PlayerPositionReference>
): Record<PlayerKey, PlayerPositionReference> {
  const base = prev ?? createDefaultPlayerPositions();
  return {
    p1: ensurePlayerPosition("p1", positions?.p1, base.p1),
    p2: ensurePlayerPosition("p2", positions?.p2, base.p2),
  };
}

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
  tapVersion?: number;
  version?: number;
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
  localPlayerId: string | null;
  setLocalPlayerId: (id: string | null) => void;
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
};

const phases: Phase[] = ["Setup", "Start", "Draw", "Main", "End"];

const THRESHOLD_KEYS: (keyof Thresholds)[] = ["air", "water", "earth", "fire"];

function emptyThresholds(): Thresholds {
  return { air: 0, water: 0, earth: 0, fire: 0 };
}

// --- Local persistence helpers (per-match scoped) ---
function snapshotsStorageKey(matchId: string | null): string {
  return matchId && String(matchId).length > 0
    ? `cr_snapshots:${String(matchId)}`
    : "cr_snapshots";
}

function loadSnapshotsFromStorageFor(matchId: string | null): GameState["snapshots"] {
  if (typeof window === "undefined") return [] as unknown as GameState["snapshots"];
  try {
    const raw = window.localStorage.getItem(snapshotsStorageKey(matchId));
    if (!raw) return [] as unknown as GameState["snapshots"];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GameState["snapshots"]) : ([] as unknown as GameState["snapshots"]);
  } catch {
    return [] as unknown as GameState["snapshots"];
  }
}

function saveSnapshotsToStorageFor(matchId: string | null, snaps: GameState["snapshots"]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(snapshotsStorageKey(matchId), JSON.stringify(snaps ?? []));
  } catch {}
}

function clearSnapshotsStorageFor(matchId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(snapshotsStorageKey(matchId));
  } catch {}
}

function accumulateThresholds(
  acc: Thresholds,
  amount: Partial<Thresholds> | null | undefined
) {
  if (!amount || typeof amount !== "object") return;
  for (const key of THRESHOLD_KEYS) {
    const value = Number((amount as Record<string, unknown>)[key] ?? 0);
    if (Number.isFinite(value) && value !== 0) {
      acc[key] += value;
    }
  }
}

function playerKeyToOwner(who: PlayerKey): 1 | 2 {
  return who === "p1" ? 1 : 2;
}

function computeThresholdTotals(
  board: BoardState,
  permanents: Permanents,
  who: PlayerKey
): Thresholds {
  const owner = playerKeyToOwner(who);
  const totals = emptyThresholds();

  for (const tile of Object.values(board?.sites ?? {})) {
    if (!tile || tile.owner !== owner) continue;
    accumulateThresholds(totals, tile.card?.thresholds ?? null);
  }

  // Include non-site permanents that contribute thresholds (e.g., cores)
  for (const arr of Object.values(permanents ?? {})) {
    const list = Array.isArray(arr) ? arr : [];
    for (const p of list) {
      try {
        if (!p || p.owner !== owner) continue;
        const nm = String(p.card?.name || "").toLowerCase();
        const grant = THRESHOLD_GRANT_BY_NAME[nm];
        if (grant) accumulateThresholds(totals, grant as Partial<Thresholds>);
      } catch {}
    }
  }

  return totals;
}

type ThresholdCacheEntry = {
  sitesRef: BoardState["sites"] | null;
  permanentsRef: Permanents | null;
  totals: Thresholds;
};

const thresholdCache: Record<PlayerKey, ThresholdCacheEntry> = {
  p1: { sitesRef: null, permanentsRef: null, totals: emptyThresholds() },
  p2: { sitesRef: null, permanentsRef: null, totals: emptyThresholds() },
};

function getCachedThresholdTotals(
  state: GameState,
  who: PlayerKey
): Thresholds {
  const cache = thresholdCache[who];
  const sitesRef = state.board.sites;
  const permanentsRef = state.permanents;

  if (cache.sitesRef === sitesRef && cache.permanentsRef === permanentsRef) {
    return cache.totals;
  }

  const totals = computeThresholdTotals(state.board, state.permanents, who);
  cache.sitesRef = sitesRef;
  cache.permanentsRef = permanentsRef;
  cache.totals = totals;
  return totals;
}

function siteProvidesMana(card: CardRef | null | undefined): boolean {
  if (!card) return false;
  const slug = typeof card.slug === "string" ? card.slug.toLowerCase() : null;
  if (slug && NON_MANA_SITE_IDENTIFIERS.has(slug)) return false;
  const name = typeof card.name === "string" ? card.name.toLowerCase() : null;
  if (name && NON_MANA_SITE_IDENTIFIERS.has(name)) return false;
  return true;
}

function computeAvailableMana(
  board: BoardState,
  permanents: Permanents,
  who: PlayerKey
): number {
  const owner = playerKeyToOwner(who);
  let mana = 0;

  for (const tile of Object.values(board?.sites ?? {})) {
    if (!tile || tile.owner !== owner) continue;
    if (tile.tapped) continue;
    if (!siteProvidesMana(tile.card ?? null)) continue;
    mana += 1;
  }

  // Include mana-providing permanents from curated metadata
  for (const arr of Object.values(permanents ?? {})) {
    const list = Array.isArray(arr) ? arr : [];
    for (const p of list) {
      try {
        if (!p || p.owner !== owner) continue;
        const nm = String(p.card?.name || "").toLowerCase();
        if (MANA_PROVIDER_BY_NAME.has(nm)) mana += 1;
      } catch {}
    }
  }

  return mana;
}

export type GameEvent = { id: number; ts: number; text: string; turn?: number };
const MAX_EVENTS = 200;
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

// Small random visual tilt for permanents to reduce overlap uniformity (radians ~ -0.05..+0.05)
const randomTilt = () => Math.random() * 0.1 - 0.05;
const INSTANCE_PREFIX = Math.random().toString(36).slice(2, 6);
let permanentInstanceSeq = 0;
let cardInstanceSeq = 0;
const newPermanentInstanceId = () =>
  `perm_${INSTANCE_PREFIX}_${Date.now().toString(36)}_${permanentInstanceSeq++}`;
const newZoneCardInstanceId = () =>
  `card_${INSTANCE_PREFIX}_${Date.now().toString(36)}_${cardInstanceSeq++}`;

function ensureCardInstanceId(card: CardRef): CardRef {
  if (card.instanceId && card.instanceId.length > 0) {
    return card;
  }
  return {
    ...card,
    instanceId: newZoneCardInstanceId(),
  };
}

function prepareCardForSeat(card: CardRef, owner: PlayerKey): CardRef {
  const ensured = ensureCardInstanceId(card);
  if (ensured.owner === owner) return ensured;
  return { ...ensured, owner };
}

function normalizeCardRefEntry(candidate: unknown): CardRef | null {
  if (!candidate || typeof candidate !== "object") return null;
  const src = candidate as Partial<CardRef> & Record<string, unknown>;
  const rawCardId = src.cardId;
  const cardId =
    typeof rawCardId === "number"
      ? rawCardId
      : typeof rawCardId === "string"
      ? Number(rawCardId)
      : NaN;
  if (!Number.isFinite(cardId)) return null;

  let variantId: number | null = null;
  if (src.variantId !== undefined && src.variantId !== null) {
    const candidateVariant =
      typeof src.variantId === "number"
        ? src.variantId
        : Number(src.variantId);
    variantId = Number.isFinite(candidateVariant) ? candidateVariant : null;
  }

  let thresholds: Partial<Thresholds> | null = null;
  if (src.thresholds && typeof src.thresholds === "object") {
    thresholds = { ...(src.thresholds as Partial<Thresholds>) };
  }

  const instanceId =
    typeof src.instanceId === "string" && src.instanceId.length > 0
      ? src.instanceId
      : newZoneCardInstanceId();

  const name =
    typeof src.name === "string"
      ? src.name
      : src.name != null
      ? String(src.name)
      : "";

  const type =
    typeof src.type === "string"
      ? src.type
      : src.type === null
      ? null
      : null;

  const slug =
    typeof src.slug === "string"
      ? src.slug
      : src.slug === null
      ? null
      : null;

  const owner =
    src.owner === "p1" || src.owner === "p2"
      ? (src.owner as PlayerKey)
      : null;

  return {
    cardId,
    variantId,
    name,
    type,
    slug,
    thresholds,
    owner,
    instanceId,
  };
}

function normalizeCardRefList(
  candidate: unknown,
  fallback: CardRef[]
): CardRef[] {
  const source = Array.isArray(candidate) ? candidate : fallback;
  const normalized: CardRef[] = [];
  for (const entry of source) {
    const ensured = normalizeCardRefEntry(entry);
    if (ensured) normalized.push(ensured);
  }
  return normalized;
}

// ---- Shared helpers (pure) -------------------------------------------------

// Move a permanent between cells with optional new offset while preserving
// existing behavior around tilt and offset. Returns a new permanents map and
// the moved card's name for logging.
type MovePermanentResult = {
  per: Permanents;
  movedName: string;
  removed: PermanentItem[];
  added: PermanentItem[];
  updated: PermanentItem[];
};

function movePermanentCore(
  perIn: Permanents,
  fromKey: CellKey,
  index: number,
  toKey: CellKey,
  newOffset: [number, number] | null
): MovePermanentResult {
  const per: Permanents = { ...perIn };
  const fromArr = [...(per[fromKey] || [])];
  const spliced = fromArr.splice(index, 1);
  const item = spliced[0];
  if (!item) {
    // Nothing to move; return original state
    return { per: perIn, movedName: "", removed: [], added: [], updated: [] };
  }

  const removedItems: PermanentItem[] = [];
  const addedItems: PermanentItem[] = [];
  const updatedItems: PermanentItem[] = [];

  removedItems.push(item);
  const baseVersion = ensurePermanentVersion(item);

  // Find any tokens attached to this permanent
  const attachedTokenIndices: number[] = [];
  fromArr.forEach((perm, idx) => {
    if (
      perm.attachedTo &&
      perm.attachedTo.at === fromKey &&
      perm.attachedTo.index === index
    ) {
      attachedTokenIndices.push(idx);
    }
  });

  // Remove attached tokens (from highest index to lowest to maintain indices)
  const attachedTokens: PermanentItem[] = [];
  attachedTokenIndices
    .sort((a, b) => b - a)
    .forEach((tokenIdx) => {
      const removed = fromArr.splice(tokenIdx, 1)[0];
      if (removed) {
        removedItems.push(removed);
        attachedTokens.unshift(removed); // Add to front to maintain order
      }
    });

  // Update indices for any remaining attachments in fromArr
  // (since we removed items, indices may have shifted)
  fromArr.forEach((perm, idx) => {
    if (perm.attachedTo && perm.attachedTo.at === fromKey) {
      const currentAttached = perm.attachedTo;
      let newIndex = currentAttached.index;
      // Count how many items were removed before this attachment's target
      for (const removedIdx of attachedTokenIndices) {
        if (removedIdx < perm.attachedTo.index) {
          newIndex--;
        }
      }
      if (index < perm.attachedTo.index) {
        newIndex--; // Also account for the main permanent being moved
      }
      if (newIndex !== currentAttached.index) {
        const nextAttachment = { ...currentAttached, index: newIndex };
        const updatedItem = bumpPermanentVersion({
          ...perm,
          attachedTo: nextAttachment,
        });
        fromArr[idx] = updatedItem;
        updatedItems.push(updatedItem);
      }
    }
  });

  const toArr = [...(per[toKey] || [])];
  const toArrStartLen = toArr.length;
  const newIndex = toArr.length; // The index where the permanent will be placed

  // When newOffset is null, keep existing offset; when provided, set it.
  // For tilt: if item has none, assign a random one on move; otherwise keep.
  const toPush: PermanentItem =
    newOffset == null
      ? item.tilt == null
        ? { ...item, tilt: randomTilt() }
        : { ...item }
      : { ...item, offset: newOffset, tilt: item.tilt ?? randomTilt() };
  toPush.version = baseVersion + 1;
  toArr.push(toPush);

  // Add attached tokens with updated attachment references
  attachedTokens.forEach((token) => {
    const tokenVersion = ensurePermanentVersion(token) + 1;
    toArr.push({
      ...token,
      attachedTo: { at: toKey, index: newIndex },
      version: tokenVersion,
    });
  });

  per[fromKey] = fromArr;
  per[toKey] = toArr;
  const addedSlice = toArr.slice(toArrStartLen);
  addedItems.push(...addedSlice);

  return {
    per,
    movedName: item.card.name,
    removed: removedItems,
    added: addedItems,
    updated: updatedItems,
  };
}

// Move artifacts attached to an avatar when the avatar moves
function moveAvatarAttachedArtifacts(
  permanents: Permanents,
  oldTileKey: CellKey,
  newTileKey: CellKey
): { permanents: Permanents; movedArtifacts: PermanentItem[] } {
  const per: Permanents = { ...permanents };
  const oldArr = [...(per[oldTileKey] || [])];
  const movedArtifacts: PermanentItem[] = [];

  // Find artifacts attached to avatar (index === -1)
  const attachedIndices: number[] = [];
  oldArr.forEach((perm, idx) => {
    if (
      perm.attachedTo &&
      perm.attachedTo.index === -1 &&
      perm.attachedTo.at === oldTileKey
    ) {
      attachedIndices.push(idx);
    }
  });

  // Remove attached artifacts from old tile (from highest index to lowest)
  attachedIndices.sort((a, b) => b - a).forEach((idx) => {
    const removed = oldArr.splice(idx, 1)[0];
    if (removed) {
      movedArtifacts.push(removed);
    }
  });

  // Add attached artifacts to new tile with updated attachment reference
  const newArr = [...(per[newTileKey] || [])];
  movedArtifacts.reverse().forEach((artifact) => {
    const updatedArtifact = bumpPermanentVersion({
      ...artifact,
      attachedTo: { at: newTileKey, index: -1 },
    });
    newArr.push(updatedArtifact);
  });

  per[oldTileKey] = oldArr;
  per[newTileKey] = newArr;

  return { permanents: per, movedArtifacts };
}

// Build an updated avatars record with a new position/offset for a player.
function buildAvatarUpdate(
  s: GameState,
  who: PlayerKey,
  pos: [number, number],
  offset: [number, number] | null
): Record<PlayerKey, AvatarState> {
  const next = { ...s.avatars[who], pos, offset } as AvatarState;
  return { ...s.avatars, [who]: next } as Record<PlayerKey, AvatarState>;
}

// Deep merge utility that replaces arrays and merges plain objects.
// Primitives and nulls overwrite. Undefined in patch leaves value as-is.
function extractInstanceId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const id = (value as Record<string, unknown>).instanceId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function mergeArrayByInstanceId(
  baseArr: unknown[],
  patchArr: unknown[]
): unknown[] {
  const patchMap = new Map<string, Record<string, unknown>>();
  for (const item of patchArr) {
    const id = extractInstanceId(item);
    if (id && item && typeof item === "object") {
      patchMap.set(id, item as Record<string, unknown>);
    }
  }
  const result: unknown[] = [];
  const seen = new Set<string>();
  for (const baseItem of baseArr) {
    const id = extractInstanceId(baseItem);
    if (id && patchMap.has(id) && baseItem && typeof baseItem === "object") {
      const baseRecord = baseItem as Record<string, unknown>;
      const patchRecord = patchMap.get(id) as Record<string, unknown>;
      const shouldRemove = patchRecord.__remove === true;
      const merged: Record<string, unknown> = { ...baseRecord };
      const baseTapVersion = Number(baseRecord.tapVersion ?? 0);
      const patchTapVersionRaw = patchRecord.tapVersion;
      const patchTapVersion =
        typeof patchTapVersionRaw === "number" ? patchTapVersionRaw : null;
      const allowTapUpdate =
        patchTapVersion !== null && patchTapVersion >= baseTapVersion;
      const baseVersion = Number(baseRecord.version ?? 0);
      const patchVersionRaw = patchRecord.version;
      const patchVersion =
        typeof patchVersionRaw === "number" ? patchVersionRaw : null;
      const allowGenericUpdate =
        patchVersion === null ? true : patchVersion >= baseVersion;
      if (!shouldRemove) {
        for (const [key, value] of Object.entries(patchRecord)) {
          if (key === "instanceId" || key === "__remove" || value === undefined)
            continue;
          if (key === "tapped") {
            if (allowTapUpdate) {
              merged.tapped = value;
              merged.tapVersion = patchTapVersion;
            }
            continue;
          }
          if (key === "tapVersion") {
            if (allowTapUpdate) merged.tapVersion = patchTapVersion;
            continue;
          }
          if (key === "version") {
            if (allowGenericUpdate) merged.version = patchVersion;
            continue;
          }
          if (!allowGenericUpdate) {
            continue;
          }
          merged[key] = value;
        }
        if (!allowTapUpdate && baseTapVersion !== undefined) {
          merged.tapVersion = baseTapVersion;
        }
        if (!allowGenericUpdate && baseVersion !== undefined) {
          merged.version = baseVersion;
        } else if (allowGenericUpdate && patchVersion !== null) {
          merged.version = patchVersion;
        }
        result.push(merged);
      }
      seen.add(id);
      patchMap.delete(id);
      if (shouldRemove) {
        continue;
      }
    } else {
      result.push(baseItem);
      if (id) seen.add(id);
    }
  }
  for (const item of patchArr) {
    const id = extractInstanceId(item);
    if (!id || !seen.has(id)) {
      if (item && typeof item === "object") {
        const record = { ...(item as Record<string, unknown>) };
        if (record.__remove === true) continue;
        delete record.__remove;
        result.push(record);
      } else {
        result.push(item);
      }
      if (id) seen.add(id);
    }
  }
  // Note: Base items preservation is handled at lines 1193-1195 above
  // This version already correctly preserves items from base not in patch
  return result;
}

function deepMergeReplaceArrays<T>(base: T, patch: unknown, path: string[] = []): T {
  if (patch === undefined) return base as T;
  if (patch === null) return null as unknown as T;
  if (Array.isArray(patch)) {
    // CRITICAL FIX: Only use instanceId merging for permanents cell arrays
    // For zone arrays (hand, graveyard, etc.), we want REPLACEMENT not merging
    //
    // Path examples:
    // - permanents cell: ["permanents", "aura_1_2"] -> use instanceId merge
    // - zone array: ["zones", "p1", "hand"] -> use replacement
    const isWithinZones = path.includes("zones");
    const isWithinPermanents = path.length >= 1 && path[0] === "permanents";

    const baseHasIds = Array.isArray(base) && base.some((item) => extractInstanceId(item));
    const patchHasIds = patch.some((item) => extractInstanceId(item));

    // Only merge by instanceId for permanents, NOT for zones
    if (isWithinPermanents && !isWithinZones && (baseHasIds || patchHasIds)) {
      const baseArray = Array.isArray(base) ? base : [];
      return mergeArrayByInstanceId(baseArray, patch) as unknown as T;
    }

    // For zones and other arrays, replace entirely
    return patch as unknown as T;
  }
  if (typeof patch !== "object") return patch as T; // primitives overwrite

  const baseObj =
    base && typeof base === "object" && !Array.isArray(base)
      ? (base as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const out: Record<string, unknown> = { ...baseObj };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const cur = out[k];
    out[k] = deepMergeReplaceArrays(cur as unknown, v as unknown, [...path, k]) as unknown;
  }
  return out as unknown as T;
}

function uniqueCellList(cells: CellKey | CellKey[]): CellKey[] {
  const arr = Array.isArray(cells) ? cells : [cells];
  const seen = new Set<CellKey>();
  const result: CellKey[] = [];
  for (const cell of arr) {
    if (typeof cell !== "string") continue;
    if (seen.has(cell)) continue;
    seen.add(cell);
    result.push(cell);
  }
  return result;
}

function mergePermanentsMap(
  base: Permanents,
  patch: unknown
): Permanents {
  const result: Permanents = { ...(base || ({} as Permanents)) } as Permanents;
  if (!patch || typeof patch !== "object") return result;
  const perPatch = patch as Record<string, unknown>;
  for (const [cell, value] of Object.entries(perPatch)) {
    const nextArr = Array.isArray(value) ? (value as unknown[]) : [];
    const baseArr = Array.isArray(result[cell as keyof Permanents])
      ? ((result[cell as keyof Permanents] as unknown[]) || [])
      : [];
    const merged = mergeArrayByInstanceId(baseArr, nextArr) as unknown as PermanentItem[];
    (result as Record<string, PermanentItem[]>)[cell] = merged;

    // Debug logging for ownership changes
    if (nextArr.length > 0) {
      nextArr.forEach((item) => {
        if (item && typeof item === 'object') {
          const patchItem = item as Partial<PermanentItem>;
          const baseItem = baseArr.find((b) => {
            const bi = b as Partial<PermanentItem>;
            return bi.card?.instanceId === patchItem.card?.instanceId;
          }) as Partial<PermanentItem> | undefined;

          if (baseItem && baseItem.owner !== patchItem.owner) {
            console.log('[mergePermanentsMap] Ownership change detected:', {
              cell,
              instanceId: patchItem.card?.instanceId,
              cardName: patchItem.card?.name,
              oldOwner: baseItem.owner,
              newOwner: patchItem.owner,
              oldOffset: baseItem.offset,
              newOffset: patchItem.offset
            });
          }
        }
      });
    }
  }
  return result;
}

function createPermanentsPatch(
  per: Permanents,
  cells?: CellKey | CellKey[] | null
): ServerPatchT {
  if (!cells || (Array.isArray(cells) && cells.length === 0)) {
    return {
      permanents: per as GameState["permanents"],
    } as ServerPatchT;
  }
  const payload: Partial<Permanents> = {};
  for (const cell of uniqueCellList(cells)) {
    const items = per[cell];
    payload[cell] = Array.isArray(items)
      ? (items.map((item) =>
          item && typeof item === "object" ? ({ ...item } as PermanentItem) : item
        ) as PermanentItem[])
      : ([] as PermanentItem[]);
  }
  return {
    permanents: payload as GameState["permanents"],
  } as ServerPatchT;
}

type PermanentDeltaUpdate = {
  at: CellKey;
  entry: Partial<PermanentItem>;
  remove?: boolean;
};

function createPermanentDeltaPatch(
  updates: PermanentDeltaUpdate[]
): ServerPatchT | null {
  if (!updates || updates.length === 0) return null;
  const payload: Record<string, PermanentItem[]> = {};
  for (const { at, entry, remove } of updates) {
    const id = entry.instanceId;
    if (!id || typeof id !== "string" || id.length === 0) {
      return null;
    }
    const target = (payload[at] ??= []);
    const record: Record<string, unknown> = { instanceId: id };
    if (remove) {
      record.__remove = true;
    }
    for (const [key, value] of Object.entries(entry)) {
      if (key === "instanceId" || value === undefined) continue;
      record[key] = value;
    }
    target.push(record as PermanentItem);
  }
  return {
    permanents: payload as GameState["permanents"],
  } as ServerPatchT;
}

function ensurePermanentInstanceId(item: PermanentItem): string | null {
  if (item.instanceId && item.instanceId.length > 0) {
    return item.instanceId;
  }
  const cardInst =
    item.card && typeof item.card.instanceId === "string"
      ? item.card.instanceId
      : null;
  return cardInst && cardInst.length > 0 ? cardInst : null;
}

function ensurePermanentVersion(item: PermanentItem): number {
  const raw = item.version;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0
    ? raw
    : 0;
}

function normalizePermanentItem(item: PermanentItem | null | undefined): PermanentItem | null {
  if (!item) return null;
  const card = ensureCardInstanceId(item.card);
  let instanceId = item.instanceId;
  if (!instanceId || instanceId.length === 0) {
    instanceId = card.instanceId ?? newPermanentInstanceId();
  }
  const tapVersion =
    typeof item.tapVersion === "number" && Number.isFinite(item.tapVersion)
      ? item.tapVersion
      : 0;
  const version = ensurePermanentVersion(item);
  const normalized: PermanentItem = {
    ...item,
    card,
    instanceId,
    tapVersion,
    version,
  };
  return normalized;
}

function normalizePermanentsRecord(
  per: Permanents | undefined
): Permanents | undefined {
  if (!per) return per;
  const result: Permanents = {};
  for (const [cell, list] of Object.entries(per)) {
    if (!Array.isArray(list)) {
      result[cell] = [];
      continue;
    }
    const normalizedList: PermanentItem[] = [];
    for (const entry of list) {
      const normalized = normalizePermanentItem(entry);
      if (normalized) normalizedList.push(normalized);
    }
    result[cell] = normalizedList;
  }
  return result;
}

function bumpPermanentVersion<T extends PermanentItem>(
  item: T,
  inc = 1
): T {
  const nextVersion = ensurePermanentVersion(item) + inc;
  return { ...item, version: nextVersion } as T;
}

function cloneCardForPatch(card: CardRef): CardRef {
  return {
    ...card,
    thresholds: card.thresholds
      ? { ...(card.thresholds as Partial<Thresholds>) }
      : card.thresholds ?? null,
  };
}

function buildMoveDeltaPatch(
  fromKey: CellKey,
  toKey: CellKey,
  removed: PermanentItem[],
  updated: PermanentItem[],
  added: PermanentItem[],
  per: Permanents,
  prevPer: Permanents
): ServerPatchT {
  const deltaUpdates: PermanentDeltaUpdate[] = [];
  let deltaValid = true;
  for (const entry of removed) {
    const id = ensurePermanentInstanceId(entry);
    if (!id) {
      deltaValid = false;
      break;
    }
    deltaUpdates.push({
      at: fromKey,
      entry: { instanceId: id },
      remove: true,
    });
  }
  if (deltaValid) {
    for (const entry of updated) {
      const id = ensurePermanentInstanceId(entry);
      if (!id) {
        deltaValid = false;
        break;
      }
      const patchEntry: Partial<PermanentItem> = {
        instanceId: id,
      };
      if (entry.attachedTo !== undefined) {
        patchEntry.attachedTo = entry.attachedTo
          ? { ...entry.attachedTo }
          : entry.attachedTo ?? null;
      }
      if (entry.offset !== undefined) patchEntry.offset = entry.offset;
      if (entry.tilt !== undefined) patchEntry.tilt = entry.tilt;
      if (entry.tapped !== undefined) patchEntry.tapped = entry.tapped;
      if (entry.tapVersion !== undefined)
        patchEntry.tapVersion = entry.tapVersion;
      if (entry.counters !== undefined) {
        patchEntry.counters = entry.counters;
      }
      if (entry.version !== undefined) {
        patchEntry.version = entry.version;
      }
      deltaUpdates.push({
        at: fromKey,
        entry: patchEntry,
      });
    }
  }
  if (deltaValid) {
    for (const entry of added) {
      const id = ensurePermanentInstanceId(entry);
      if (!id) {
        deltaValid = false;
        break;
      }
      const patchEntry: Partial<PermanentItem> = {
        instanceId: id,
        owner: entry.owner,
        card: cloneCardForPatch(entry.card),
      };
      if (entry.offset !== undefined) patchEntry.offset = entry.offset;
      if (entry.tilt !== undefined) patchEntry.tilt = entry.tilt;
      if (entry.tapped !== undefined) patchEntry.tapped = entry.tapped;
      if (entry.tapVersion !== undefined)
        patchEntry.tapVersion = entry.tapVersion;
      if (entry.attachedTo !== undefined) {
        patchEntry.attachedTo = entry.attachedTo
          ? { ...entry.attachedTo }
          : entry.attachedTo ?? null;
      }
      if (entry.counters !== undefined) {
        patchEntry.counters = entry.counters;
      }
      if (entry.version !== undefined) {
        patchEntry.version = entry.version;
      }
      deltaUpdates.push({
        at: toKey,
        entry: patchEntry,
      });
    }
  }
  const deltaPatch =
    deltaValid && deltaUpdates.length > 0
      ? createPermanentDeltaPatch(deltaUpdates)
      : null;
  const fallbackPatch = createPermanentsPatch(per ?? prevPer, [
    fromKey,
    toKey,
  ]);
  return deltaPatch ?? fallbackPatch;
}

const PATCH_SIGNATURE_TTL_MS = 7_000;
const PATCH_SIGNATURE_FIELDS = [
  "permanents",
  "zones",
  "board",
  "avatars",
  "permanentPositions",
  "permanentAbilities",
  "sitePositions",
  "playerPositions",
  "resources",
] as const;

type TrackedPatchField = (typeof PATCH_SIGNATURE_FIELDS)[number];

type PatchSignatureEntry = {
  expiresAt: number;
  fields: TrackedPatchField[];
  payload: Record<string, string>;
};

const pendingPatchSignatures = new Map<string, PatchSignatureEntry[]>();
let getStoreState: (() => GameState) | null = null;

function prunePatchSignatures(now: number) {
  for (const [key, entries] of pendingPatchSignatures.entries()) {
    const filtered = entries.filter((entry) => entry.expiresAt > now);
    if (filtered.length === 0) {
      pendingPatchSignatures.delete(key);
    } else if (filtered.length !== entries.length) {
      pendingPatchSignatures.set(key, filtered);
    }
  }
}

function registerPatchSignature(
  signature: { id: string; fields: TrackedPatchField[] } | null,
  patch: ServerPatchT
) {
  if (!signature) return;
  const now = Date.now();
  prunePatchSignatures(now);
  const list = pendingPatchSignatures.get(signature.id) ?? [];
  const payload: Record<string, string> = {};
  for (const field of signature.fields) {
    const raw = (patch as Record<string, unknown>)[field];
    if (raw === undefined) continue;
    payload[field] = stableSerialize(normalizeForSignature(raw));
  }
  list.push({
    expiresAt: now + PATCH_SIGNATURE_TTL_MS,
    fields: [...signature.fields],
    payload,
  });
  pendingPatchSignatures.set(signature.id, list);
}

function normalizeForSignature(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForSignature(item));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.entries(record)
      .filter(([key, val]) => val !== undefined && key !== "cost")
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      out[key] = normalizeForSignature(val);
    }
    return out;
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";
  }
  return value;
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "number") return Number.isFinite(value as number) ? String(value) : JSON.stringify(value);
  if (t === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (t === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return `{${entries
      .map(([key, val]) => `${JSON.stringify(key)}:${stableSerialize(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function makePatchSignature(
  patch: ServerPatchT
): { id: string; fields: TrackedPatchField[] } | null {
  if (!patch || typeof patch !== "object") return null;
  const parts: string[] = [];
  const fields: TrackedPatchField[] = [];
  for (const field of PATCH_SIGNATURE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    const raw = (patch as Record<string, unknown>)[field];
    if (raw === undefined) continue;
    const normalized = normalizeForSignature(raw);
    parts.push(`${field}:${stableSerialize(normalized)}`);
    fields.push(field);
  }
  if (parts.length === 0) return null;
  return {
    id: parts.join("|"),
    fields,
  };
}

function filterEchoPatchIfAny(
  patch: ServerPatchT
): { patch: ServerPatchT | null; matched: boolean } {
  const signature = makePatchSignature(patch);
  if (!signature) return { patch, matched: false };
  prunePatchSignatures(Date.now());
  const list = pendingPatchSignatures.get(signature.id);
  if (!list || list.length === 0) return { patch, matched: false };
  let matchIndex = -1;
  for (let i = 0; i < list.length; i++) {
    const candidate = list[i];
    const fields = candidate.fields ?? [];
    let matches = true;
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(patch, field)) {
        matches = false;
        break;
      }
      const serialized = stableSerialize(
        normalizeForSignature((patch as Record<string, unknown>)[field])
      );
      if (candidate.payload?.[field] !== serialized) {
        matches = false;
        break;
      }
    }
    if (matches) {
      matchIndex = i;
      break;
    }
  }
  if (matchIndex < 0) return { patch, matched: false };
  const [entry] = list.splice(matchIndex, 1);
  if (list.length === 0) pendingPatchSignatures.delete(signature.id);
  else pendingPatchSignatures.set(signature.id, list);

  if (getStoreState) {
    try {
      const state = getStoreState();
      const payload = entry.payload ?? {};
      let mustKeep = false;
      for (const field of entry.fields ?? []) {
        if (!(field in payload)) continue;
        const currentValue = (state as Record<string, unknown>)[field];
        const serializedCurrent = stableSerialize(
          normalizeForSignature(currentValue)
        );
        if (serializedCurrent !== payload[field]) {
          mustKeep = true;
          break;
        }
      }
      if (mustKeep) {
        return { patch, matched: false };
      }
    } catch {
      // ignore state comparison failures
    }
  }

  const fields = entry.fields ?? [];
  let mutated = false;
  const filtered: ServerPatchT = { ...patch };
  for (const field of fields) {
    if (field in filtered) {
      delete filtered[field as keyof ServerPatchT];
      mutated = true;
    }
  }
  if (!mutated) {
    return { patch, matched: false };
  }
  try {
    console.debug("[net] filtered echo patch", {
      fields,
      remainingKeys: Object.keys(filtered).filter((key) => key !== "__replaceKeys"),
    });
  } catch {}
  if (Array.isArray(filtered.__replaceKeys)) {
    const remaining = filtered.__replaceKeys.filter(
      (key) => !fields.includes(key as TrackedPatchField)
    );
    if (remaining.length > 0) filtered.__replaceKeys = remaining;
    else delete filtered.__replaceKeys;
  }
  const remainingKeys = Object.keys(filtered).filter(
    (key) => key !== "__replaceKeys"
  );
  if (remainingKeys.length === 0) {
    return { patch: null, matched: true };
  }
  return { patch: filtered, matched: true };
}

function cloneSeatZones(
  z: Zones | undefined,
  seat: keyof GameState["zones"]
): Zones | null {
  if (!z) return null;
  const cloneList = (list: CardRef[]): CardRef[] =>
    list.map((card) => prepareCardForSeat(card, seat));
  return {
    spellbook: cloneList(z.spellbook),
    atlas: cloneList(z.atlas),
    hand: cloneList(z.hand),
    graveyard: cloneList(z.graveyard),
    battlefield: cloneList(z.battlefield),
    banished: cloneList(z.banished),
  };
}

const ZONE_PILES: Array<keyof Zones> = [
  "spellbook",
  "atlas",
  "hand",
  "graveyard",
  "battlefield",
  "banished",
];

function removeCardInstanceFromSeat(
  zones: Zones,
  instanceId: string
): { zones: Zones; changed: boolean } {
  let changed = false;
  const next: Zones = { ...zones };
  for (const key of ZONE_PILES) {
    const pile = zones[key] ?? [];
    const filtered = pile.filter((card) => card?.instanceId !== instanceId);
    if (filtered.length !== pile.length) {
      next[key] = filtered;
      changed = true;
    }
  }
  return { zones: changed ? next : zones, changed };
}

function removeCardInstanceFromAllZones(
  zones: GameState["zones"],
  instanceId: string
): { zones: GameState["zones"]; seats: PlayerKey[] } | null {
  if (!zones) return null;
  const result: GameState["zones"] = { ...zones };
  const changedSeats: PlayerKey[] = [];
  for (const seat of ["p1", "p2"] as PlayerKey[]) {
    const seatZones = zones[seat];
    if (!seatZones) continue;
    const { zones: updated, changed } = removeCardInstanceFromSeat(
      seatZones,
      instanceId
    );
    if (changed) {
      result[seat] = updated;
      changedSeats.push(seat);
    }
  }
  return changedSeats.length > 0 ? { zones: result, seats: changedSeats } : null;
}

function createZonesPatchFor(
  zones: GameState["zones"],
  seats: keyof GameState["zones"] | Array<keyof GameState["zones"]>
): ServerPatchT | null {
  if (!zones) return null;
  const seatList = Array.isArray(seats) ? seats : [seats];
  const payload: Partial<GameState["zones"]> = {};
  for (const seat of seatList) {
    const seatZones = cloneSeatZones(zones[seat], seat);
    if (!seatZones) continue;
    payload[seat] = seatZones;
  }
  return Object.keys(payload).length > 0
    ? ({ zones: payload as GameState["zones"] } as ServerPatchT)
    : null;
}

function clonePatchForQueue(patch: ServerPatchT): ServerPatchT {
  return JSON.parse(JSON.stringify(patch)) as ServerPatchT;
}

// Merge console events by stable key and chronological order, trimming to MAX_EVENTS.
function mergeEvents(prev: GameEvent[], add: GameEvent[]): GameEvent[] {
  const m = new Map<string, GameEvent>();
  for (const e of Array.isArray(prev) ? prev : []) {
    if (!e) continue;
    m.set(`${e.id}|${e.ts}|${e.text}`, e);
  }
  for (const e of Array.isArray(add) ? add : []) {
    if (!e) continue;
    m.set(`${e.id}|${e.ts}|${e.text}`, e);
  }
  const merged = Array.from(m.values()).sort(
    (a, b) => a.ts - b.ts || a.id - b.id
  );
  return merged.length > MAX_EVENTS ? merged.slice(-MAX_EVENTS) : merged;
}

const createGameStoreState: StateCreator<GameState> = (set, get) => ({
  players: {
    p1: {
      life: 20,
      lifeState: "alive",
      mana: 0,
      thresholds: { air: 0, water: 0, earth: 0, fire: 0 },
    },
    p2: {
      life: 20,
      lifeState: "alive",
      mana: 0,
      thresholds: { air: 0, water: 0, earth: 0, fire: 0 },
    },
  },
  currentPlayer: 1,
  turn: 1,
  phase: "Setup",
  setPhase: (phase) =>
    set((s) => {
      if (phase === "Start") {
        try {
          const turnNow = s.turn;
          const cpNow = s.currentPlayer;
          const hasForTurn = Array.isArray(s.snapshots) && s.snapshots.some((ss) => ss.kind === "auto" && ss.turn === turnNow);
          if (!hasForTurn) {
            setTimeout(() => {
              try {
                get().createSnapshot(`Turn ${turnNow} start (P${cpNow})`, "auto");
              } catch {}
            }, 0);
          }
        } catch {}
      }
      return { phase } as Partial<GameState> as GameState;
    }),

  // Idempotent tap setter for permanents
  setTapPermanent: (at, index, tapped) =>
    set((s) => {
      get().pushHistory();
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[at] || [])];
      if (!arr[index]) return s as GameState;
      const cur = arr[index];
      // Owner-only change when online
      if (s.transport && s.actorKey) {
        const ownerKey = (cur.owner === 1 ? "p1" : "p2") as PlayerKey;
        if (s.actorKey !== ownerKey) return s as GameState;
      }
      const nextTapVersion = Number(cur.tapVersion ?? 0) + (cur.tapped === tapped ? 0 : 1);
      const next = bumpPermanentVersion({
        ...cur,
        tapped,
        tapVersion: nextTapVersion,
      });
      arr[index] = next;
      per[at] = arr;
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: next.instanceId ?? undefined,
            tapped: next.tapped,
            tapVersion: next.tapVersion,
            version: next.version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),
  // D20 Setup phase
  d20Rolls: { p1: null, p2: null },
  setupWinner: null,
  // Track last applied server timestamp to drop stale patches
  lastServerTs: 0,
  // Track last local action send time to coordinate undo ordering in online play
  lastLocalActionTs: 0,
  // Multiplayer transport (injected by online play UI)
  transport: null,
  transportSubscriptions: [],
  // Current match id (online) for per-match snapshot persistence
  matchId: null,
  setMatchId: (id) => {
    set((s) => {
      const prevId = s.matchId ?? null;
      const nextId = id ?? null;
      if (prevId === nextId) return s as GameState;
      const currentSnaps = Array.isArray(s.snapshots) ? (s.snapshots as GameState["snapshots"]) : ([] as unknown as GameState["snapshots"]);
      // Persist current in-memory snapshots under the previous key to be safe
      try { saveSnapshotsToStorageFor(prevId, currentSnaps); } catch {}
      // Load snapshots for the new scope
      const loaded = loadSnapshotsFromStorageFor(nextId);
      return { matchId: nextId, snapshots: loaded } as Partial<GameState> as GameState;
    });
  },
  // Actor seat for online play; null in offline/hotseat
  actorKey: null,
  setActorKey: (key) => {
    set((state) => {
      if (state.actorKey === key) return state as GameState;
      if (!key) {
        return { actorKey: null } as Partial<GameState> as GameState;
      }

      const promotedHistory = state.history.map((snap) =>
        snap.actorKey ? snap : { ...snap, actorKey: key }
      );
      const nextHistoryByPlayer = {
        ...state.historyByPlayer,
      } as Record<PlayerKey, SerializedGame[]>;
      const mine = promotedHistory
        .filter((snap) => snap.actorKey === key)
        .slice(-10);
      nextHistoryByPlayer[key] = mine;

      return {
        actorKey: key,
        history: promotedHistory.slice(-10),
        historyByPlayer: nextHistoryByPlayer,
      } as Partial<GameState> as GameState;
    });
    if (key) {
      try {
        get().flushPendingPatches();
      } catch {}
    }
  },
  commitDefenders: () => {
    const pc = get().pendingCombat;
    if (!pc) return;
    set((s) => {
      if (!s.pendingCombat) return s as GameState;
      return {
        pendingCombat: { ...s.pendingCombat, status: "committed" as const },
      } as Partial<GameState> as GameState;
    });
    // Re-read state after update to get committed status
    const updated = get().pendingCombat;
    if (!updated) return;
    const tr = get().transport;
    if (tr?.sendMessage) {
      try {
        console.log('[commitDefenders] Sending combatCommit with defenders:', updated.defenders?.length || 0);
        tr.sendMessage({
          type: "combatCommit",
          id: updated.id,
          defenders: updated.defenders,
          target: updated.target ?? null,
          tile: updated.tile,
          playerKey: get().actorKey ?? null,
          ts: Date.now(),
        } as unknown as CustomMessage);
        console.log('[commitDefenders] combatCommit sent');
      } catch (err) {
        console.error('[commitDefenders] Error sending combatCommit:', err);
      }
    }
  },
  setDamageAssignment: (asgn) => {
    const pc = get().pendingCombat;
    if (!pc || pc.status !== "committed") return false;
    const { permanents, metaByCardId } = get();
    function getAtkDef(at: string, index: number): { atk: number; def: number } {
      try {
        const cardId = (permanents as Permanents)[at]?.[index]?.card?.cardId;
        const m = cardId ? (metaByCardId as Record<number, { attack: number | null; defence: number | null }>)[Number(cardId)] : undefined;
        const atk = Number(m?.attack ?? 0) || 0;
        const def = Number(m?.defence ?? m?.attack ?? 0) || 0;
        return { atk, def };
      } catch { return { atk: 0, def: 0 }; }
    }
    function getAttachments(at: string, index: number): Permanents[string] {
      const list = (permanents as Permanents)[at] || [];
      return list.filter((p) => p.attachedTo && p.attachedTo.at === at && p.attachedTo.index === index);
    }
    function computeEffectiveAttack(a: { at: CellKey; index: number }): { atk: number; firstStrike: boolean } {
      const base = getAtkDef(a.at, a.index).atk;
      const attachments = getAttachments(a.at, a.index);
      let atk = base; let firstStrike = false; let disabled = false;
      for (const tkn of attachments) {
        const nm = (tkn.card?.name || "").toLowerCase();
        if (nm === "lance") { firstStrike = true; atk += 1; }
        if (nm === "disabled") { disabled = true; }
      }
      if (disabled) atk = 0;
      if (!Number.isFinite(atk)) atk = 0;
      return { atk, firstStrike };
    }
    const eff = computeEffectiveAttack({ at: pc.attacker.at, index: pc.attacker.index });
    if (!Array.isArray(asgn)) return false;
    const defKeys = new Set((pc.defenders || []).map((d) => `${d.at}:${d.index}`));
    let sum = 0;
    for (const a of asgn) {
      if (!a || typeof a !== "object") return false;
      if (typeof a.at !== "string" || !Number.isFinite(Number(a.index)) || !Number.isFinite(Number(a.amount))) return false;
      if (!defKeys.has(`${a.at}:${a.index}`)) return false;
      if (a.amount < 0) return false;
      sum += Math.floor(Number(a.amount));
    }
    if (sum !== Math.floor(eff.atk)) return false;
    set((s) => {
      if (!s.pendingCombat) return s as GameState;
      return { pendingCombat: { ...s.pendingCombat, assignment: asgn.map((x) => ({ at: x.at, index: Number(x.index), amount: Math.floor(Number(x.amount)) })) } } as Partial<GameState> as GameState;
    });
    const tr = get().transport;
    if (tr?.sendMessage) {
      try {
        tr.sendMessage({ type: "combatAssign", id: pc.id, assignment: asgn, ts: Date.now() } as unknown as CustomMessage);
      } catch {}
    }
    return true;
  },
  // Match end state
  matchEnded: false,
  winner: null,
  // Feature flag: Interaction Guides (default OFF, persisted locally)
  interactionGuides: (() => {
    try {
      if (typeof window !== "undefined") {
        return localStorage.getItem("sorcery:interactionGuides") === "1";
      }
    } catch {}
    return false;
  })(),
  setInteractionGuides: (on) => {
    set({ interactionGuides: !!on } as Partial<GameState> as GameState);
    try {
      if (typeof window !== "undefined")
        localStorage.setItem("sorcery:interactionGuides", on ? "1" : "0");
    } catch {}
  },
  // Card meta cache for base power detection
  metaByCardId: {},
  fetchCardMeta: async (ids) => {
    try {
      const uniq = Array.from(
        new Set(
          (Array.isArray(ids) ? ids : [])
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n > 0)
        )
      );
      const need = uniq.filter((id) => !get().metaByCardId[id]);
      if (!need.length) return;
      const res = await fetch(
        `/api/cards/meta?ids=${encodeURIComponent(need.join(","))}`,
        { credentials: "include" }
      );
      if (!res.ok) return;
      const rows = (await res.json()) as Array<{
        cardId: number;
        cost: number | null;
        thresholds?: unknown;
        attack: number | null;
        defence: number | null;
      }>;
      const next = { ...(get().metaByCardId as Record<number, { attack: number | null; defence: number | null; cost: number | null }>) };
      for (const r of rows) {
        next[r.cardId] = {
          attack: r.attack ?? null,
          defence: r.defence ?? null,
          cost: r.cost ?? null,
        };
      }
      set({ metaByCardId: next } as Partial<GameState> as GameState);
    } catch {}
  },
  // Minimal combat state (MVP)
  pendingCombat: null,
  attackChoice: null,
  attackTargetChoice: null,
  attackConfirm: null,
  setAttackChoice: (v) => set({ attackChoice: v }),
  setAttackTargetChoice: (v) => set({ attackTargetChoice: v }),
  setAttackConfirm: (v) => set({ attackConfirm: v }),
  revertCrossMoveTick: 0,
  requestRevertCrossMove: () => set((s) => ({ revertCrossMoveTick: (s.revertCrossMoveTick || 0) + 1 })),
  lastCombatSummary: null,
  setLastCombatSummary: (smm) => set({ lastCombatSummary: smm } as Partial<GameState> as GameState),
  declareAttack: (tile, attacker, target) =>
    set((s) => {
      const id = `cmb_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const defenderSeat = (attacker.owner === 1 ? "p2" : "p1") as PlayerKey;
      const pc = {
        id,
        tile,
        attacker,
        target: target ?? null,
        defenderSeat,
        defenders: [],
        status: "declared" as const,
        createdAt: Date.now(),
      };
      const tr = get().transport;
      // Build nice labels
      const attackerLabel = (() => {
        try {
          const a = (get().permanents as Permanents)[attacker.at]?.[attacker.index] || null;
          return a?.card?.name || "Attacker";
        } catch { return "Attacker"; }
      })();
      const targetLabel = (() => {
        try {
          if (!target) return null;
          if (target.kind === "site") return "Site";
          if (target.kind === "avatar") return "Avatar";
          const list = (get().permanents as Permanents)[target.at] || [];
          const p = (target.index != null && list[target.index]) ? list[target.index] : null;
          return p?.card?.name || "Unit";
        } catch { return null; }
      })();
      if (tr?.sendMessage) {
        try {
          tr.sendMessage({
            type: "attackDeclare",
            id,
            tile,
            attacker,
            target: target ?? null,
            playerKey: s.actorKey ?? null,
            ts: Date.now(),
          } as unknown as CustomMessage);
          if (targetLabel) {
            tr.sendMessage({ type: "toast", text: `${attackerLabel} attacks ${targetLabel}` } as unknown as CustomMessage);
          }
        } catch {}
      }
      try {
        const cellNo = tile.y * s.board.size.w + tile.x + 1;
        if (targetLabel) get().log(`${attackerLabel} attacks ${targetLabel} at #${cellNo}`);
        else get().log(`Attack declared at #${cellNo}`);
      } catch {}
      return { pendingCombat: pc } as Partial<GameState> as GameState;
    }),
  offerIntercept: (tile, attacker) => {
    try {
      const defenderSeat = (attacker.owner === 1 ? "p2" : "p1") as PlayerKey;
      const key = `${tile.x},${tile.y}` as CellKey;
      const per = get().permanents as Permanents;
      const unitsHere = (per[key] || []).filter(
        (p) => p && p.owner === (attacker.owner === 1 ? 2 : 1) && !p.tapped
      );
      let avatarHere = false;
      try {
        const av = (get().avatars as GameState["avatars"])[defenderSeat];
        if (
          av && Array.isArray(av.pos) && av.pos.length === 2 &&
          av.pos[0] === tile.x && av.pos[1] === tile.y && !av.tapped
        ) avatarHere = true;
      } catch {}
      if (unitsHere.length === 0 && !avatarHere) return; // no eligible interceptors
      const id = `cmb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const tr = get().transport;
      if (tr?.sendMessage) {
        try {
          tr.sendMessage({
            type: "interceptOffer",
            id,
            tile,
            attacker,
            playerKey: get().actorKey ?? null,
            ts: Date.now(),
          } as unknown as CustomMessage);
        } catch {}
      }
      try { get().log("Intercept offered to defender"); } catch {}
    } catch {}
  },
  setDefenderSelection: (defenders) => {
    set((s) => {
      if (!s.pendingCombat) return s as GameState;
      return {
        pendingCombat: { ...s.pendingCombat, defenders, status: "defending" },
      } as Partial<GameState> as GameState;
    });
    const pc = get().pendingCombat;
    const tr = get().transport;
    if (pc && tr?.sendMessage) {
      try {
        tr.sendMessage({
          type: "combatSetDefenders",
          id: pc.id,
          defenders,
          playerKey: get().actorKey ?? null,
          ts: Date.now(),
        } as unknown as CustomMessage);
        tr.sendMessage({ type: "toast", text: `Acting player chose ${defenders.length} defender${defenders.length === 1 ? "" : "s"}` } as unknown as CustomMessage);
      } catch {}
    }
  },
  resolveCombat: () => {
    const pc = get().pendingCombat;
    if (!pc) return;
    const tr = get().transport;
    const existing = get().lastCombatSummary;
    const haveSummary = existing && String(existing.id) === String(pc.id);
    const permanents = get().permanents as Permanents;
    const meta = get().metaByCardId as Record<number, { attack: number | null; defence: number | null; cost: number | null }>;
    const players = get().players;
    const board = get().board;
    function getAtkDef(at: string, index: number): { atk: number; def: number } {
      try {
        const cardId = permanents[at]?.[index]?.card?.cardId;
        const m = cardId ? meta[Number(cardId)] : undefined;
        const atk = Number(m?.attack ?? 0) || 0;
        const def = Number(m?.defence ?? m?.attack ?? 0) || 0; // default health to base power when defence missing
        return { atk, def };
      } catch { return { atk: 0, def: 0 }; }
    }
    function getAttachments(at: string, index: number): Permanents[string] {
      const list = permanents[at] || [];
      return list.filter((p) => p.attachedTo && p.attachedTo.at === at && p.attachedTo.index === index);
    }
    function listAttachmentEffects(at: string, index: number): string[] {
      const effects: string[] = [];
      for (const t of getAttachments(at, index)) {
        const nm = (t.card?.name || "").trim();
        const low = nm.toLowerCase();
        if (low === "lance") effects.push("Lance(+1, FS)");
        else if (low === "disabled") effects.push("Disabled(Atk=0)");
        else if (nm) effects.push(nm);
      }
      return effects;
    }
    function getPermName(at: string, index: number): string {
      try { return permanents[at]?.[index]?.card?.name || "Unit"; } catch { return "Unit"; }
    }
    function getAvatarName(seat: PlayerKey): string {
      try { return (get().avatars?.[seat]?.card?.name as string) || "Avatar"; } catch { return "Avatar"; }
    }
    function computeEffectiveAttack(a: { at: CellKey; index: number }): { atk: number; firstStrike: boolean } {
      const base = getAtkDef(a.at, a.index).atk;
      const attachments = getAttachments(a.at, a.index);
      let atk = base;
      let firstStrike = false;
      let disabled = false;
      for (const t of attachments) {
        const nm = (t.card?.name || "").toLowerCase();
        if (nm === "lance") { firstStrike = true; atk += 1; }
        if (nm === "disabled") { disabled = true; }
      }
      if (disabled) atk = 0;
      if (!Number.isFinite(atk)) atk = 0;
      return { atk, firstStrike };
    }
    const eff = computeEffectiveAttack({ at: pc.attacker.at, index: pc.attacker.index });
    let summary = "Combat resolved";
    const attackerName = getPermName(pc.attacker.at, pc.attacker.index);
    const atkFx = listAttachmentEffects(pc.attacker.at, pc.attacker.index);
    const fxTxt = atkFx.length ? ` [${atkFx.join(", ")}]` : "";
    const fsTag = eff.firstStrike ? " (FS)" : "";
    const tileNo = (() => { try { return pc.tile.y * get().board.size.w + pc.tile.x + 1; } catch { return null; } })();
    const actorSeat = (pc.attacker.owner === 1 ? "p1" : "p2") as PlayerKey;
    let targetSeat: PlayerKey | undefined = undefined;
    if (pc.target && pc.target.kind === "site") {
      const owner = board.sites[pc.target.at]?.owner as 1 | 2 | undefined;
      const seat = owner === 1 ? "p1" : owner === 2 ? "p2" : (pc.defenderSeat as PlayerKey);
      if (seat) {
        targetSeat = seat as PlayerKey;
        const dd = players[seat].lifeState === "dd";
        const dmg = dd ? 0 : Math.max(0, Math.floor(eff.atk));
        const siteName = board.sites[pc.target.at]?.card?.name || "Site";
        const ddNote = dd ? " (DD rule)" : "";
        summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Site ${siteName} @#${tileNo ?? "?"} → Expected: ${dmg} to ${seat.toUpperCase()}${ddNote}`;
      }
    } else if (pc.target && pc.target.kind === "avatar") {
      const seat = pc.attacker.owner === 1 ? "p2" : "p1";
      targetSeat = seat as PlayerKey;
      const state = players[seat];
      const avatarName = getAvatarName(seat as PlayerKey);
      if (state.lifeState === "dd") {
        summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Avatar ${avatarName} (${seat.toUpperCase()}) @#${tileNo ?? "?"} → Expected: ${seat.toUpperCase()} to 0 (lethal from DD, match ends)`;
      } else {
        const life = Number(state.life) || 0;
        const dmg = Math.max(0, Math.floor(eff.atk));
        const next = Math.max(0, life - dmg);
        if (life > 0 && next <= 0) {
          summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Avatar ${avatarName} (${seat.toUpperCase()}) @#${tileNo ?? "?"} → Expected: reaches Death's Door; further avatar/site damage this turn won't reduce life`;
        } else {
          summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Avatar ${avatarName} (${seat.toUpperCase()}) @#${tileNo ?? "?"} → Expected: ${dmg} dmg (life ${life} → ${next})`;
        }
      }
    } else {
      const tileKey = (() => { try { return `${pc.tile.x},${pc.tile.y}` as CellKey; } catch { return null as CellKey | null; } })();
      const siteAtTile = tileKey ? (board.sites[tileKey] as SiteTile | undefined) : undefined;
      if (!pc.target && siteAtTile && siteAtTile.card && ((pc.defenders?.length || 0) === 0)) {
        const owner = siteAtTile.owner as 1 | 2 | undefined;
        let seat: PlayerKey | null = owner === 1 ? "p1" : owner === 2 ? "p2" : (pc.defenderSeat as PlayerKey | null);
        if (!seat) seat = (pc.attacker.owner === 1 ? "p2" : "p1") as PlayerKey;
        if (seat) {
          targetSeat = seat as PlayerKey;
          const dd = players[seat].lifeState === "dd";
          const dmg = dd ? 0 : Math.max(0, Math.floor(eff.atk));
          const siteName = siteAtTile.card?.name || "Site";
          const ddNote = dd ? " (DD rule)" : "";
          summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Site ${siteName} @#${tileNo ?? "?"} → Expected: ${dmg} to ${seat.toUpperCase()}${ddNote}`;
        }
      } else {
        const aAtk = eff.atk;
        const targetDef = (() => {
          if (pc.target && pc.target.kind === "permanent" && pc.target.index != null) return getAtkDef(pc.target.at, pc.target.index).def;
          if (pc.defenders && pc.defenders.length > 0) return pc.defenders.reduce((s, d) => s + getAtkDef(d.at, d.index).def, 0);
          return 0;
        })();
        const targetName = pc.target && pc.target.kind === "permanent" && pc.target.index != null
          ? getPermName(pc.target.at, pc.target.index)
          : (pc.defenders?.length ? pc.defenders.map(d => getPermName(d.at, d.index)).slice(0,3).join(", ") + (pc.defenders.length > 3 ? ", …" : "") : "target");
        const kills = aAtk >= targetDef;
        targetSeat = pc.defenderSeat as PlayerKey;
        summary = `Attacker ${attackerName}${fxTxt}${fsTag} vs ${targetName} @#${tileNo ?? "?"} → Expected: Atk ${aAtk} vs Def ${targetDef} (${kills ? "likely kill" : "may fail"})`;
      }
    }
    // Always send combatResolve for taps/cleanup; only send summary if not already set
    if (tr?.sendMessage) {
      try {
        tr.sendMessage({
          type: "combatResolve",
          id: pc.id,
          attacker: pc.attacker,
          defenders: pc.defenders,
          tile: pc.tile,
          target: pc.target ?? null,
          ts: Date.now(),
        } as unknown as CustomMessage);
        if (!haveSummary) {
          set({ lastCombatSummary: { id: pc.id, text: summary, ts: Date.now(), actor: actorSeat, targetSeat } } as Partial<GameState> as GameState);
          tr.sendMessage({ type: "combatSummary", id: pc.id, text: summary, ts: Date.now(), actor: actorSeat, targetSeat } as unknown as CustomMessage);
        }
      } catch {}
    }
    set({ pendingCombat: null, attackChoice: null, attackTargetChoice: null, attackConfirm: null } as Partial<GameState> as GameState);
  },
  autoResolveCombat: () => {
    const pc = get().pendingCombat;
    if (!pc) return;
    if (pc.status !== "committed") return;
    // Only the attacker may trigger auto resolve
    const actor = get().actorKey as PlayerKey | null;
    const isIntercept = !pc.target;
    const wants = (pc.attacker.owner === 1 ? "p1" : "p2") as PlayerKey;
    const defSeat = pc.defenderSeat as PlayerKey | null;
    if (actor) {
      const defenderMay = Boolean(isIntercept && defSeat && actor === defSeat);
      if (!defenderMay && actor !== wants) return;
    }
    // Helpers copied from resolveCombat scope
    const { permanents, metaByCardId, board, players } = get();
    function getAtkDef(at: string, index: number): { atk: number; def: number } {
      try {
        const cardId = (permanents as Permanents)[at]?.[index]?.card?.cardId;
        const m = cardId ? (metaByCardId as Record<number, { attack: number | null; defence: number | null }>)[Number(cardId)] : undefined;
        const atk = Number(m?.attack ?? 0) || 0;
        const def = Number(m?.defence ?? m?.attack ?? 0) || 0; // default health to base power when defence missing
        return { atk, def };
      } catch { return { atk: 0, def: 0 }; }
    }
    function getAttachments(at: string, index: number): Permanents[string] {
      const list = (permanents as Permanents)[at] || [];
      return list.filter((p) => p.attachedTo && p.attachedTo.at === at && p.attachedTo.index === index);
    }
    function computeEffectiveAttack(a: { at: CellKey; index: number }): { atk: number; firstStrike: boolean } {
      const base = getAtkDef(a.at, a.index).atk;
      const attachments = getAttachments(a.at, a.index);
      let atk = base; let firstStrike = false; let disabled = false;
      for (const tkn of attachments) {
        const nm = (tkn.card?.name || "").toLowerCase();
        if (nm === "lance") { firstStrike = true; atk += 1; }
        if (nm === "disabled") { disabled = true; }
      }
      if (disabled) atk = 0;
      if (!Number.isFinite(atk)) atk = 0;
      return { atk, firstStrike };
    }
    const eff = computeEffectiveAttack({ at: pc.attacker.at, index: pc.attacker.index });
    const aSeat = (pc.attacker.owner === 1 ? "p1" : "p2") as PlayerKey;
    let tSeat: PlayerKey | undefined = undefined;
    const killList: Array<{ at: CellKey; index: number; owner: PlayerKey }> = [];
    const damageList: Array<{ at: CellKey; index: number; amount: number }> = [];
    // Resolve vs defenders using assignment
    let defenders = (pc.defenders || []).map((d) => {
      const stats = getAtkDef(d.at, d.index);
      const effD = computeEffectiveAttack({ at: d.at, index: d.index });
      return { ...d, def: stats.def, atk: effD.atk, fs: effD.firstStrike };
    });
    // If directly attacking a single unit (no intercept defenders), treat that unit as the sole defender
    if (defenders.length === 0 && pc.target && pc.target.kind === "permanent" && pc.target.index != null) {
      const ownerNum = (() => { try { return (permanents as Permanents)[pc.target.at]?.[pc.target.index]?.owner as 1 | 2 | undefined; } catch { return undefined; } })();
      if (ownerNum === 1 || ownerNum === 2) {
        const statsT = getAtkDef(pc.target.at, pc.target.index);
        const effT = computeEffectiveAttack({ at: pc.target.at, index: pc.target.index });
        defenders = [{ at: pc.target.at, index: Number(pc.target.index), owner: ownerNum, def: statsT.def, atk: effT.atk, fs: effT.firstStrike }];
      }
    }
    const defAssignMap = new Map<string, number>();
    if (defenders.length > 1) {
      const asgn = pc.assignment || [];
      let sum = 0;
      for (const a of asgn) { const k = `${a.at}:${a.index}`; defAssignMap.set(k, Math.floor(Number(a.amount) || 0)); sum += Math.floor(Number(a.amount) || 0); }
      if (sum !== Math.floor(eff.atk)) {
        // If interceptor resolves without assignment, distribute fairly to avoid deadlock
        const actorSeat = actor as PlayerKey | null;
        const defenderIsResolving = Boolean(isIntercept && actorSeat && defSeat && actorSeat === defSeat);
        if (defenderIsResolving) {
          const total = Math.floor(eff.atk);
          const count = defenders.length;
          const base = Math.floor(total / count);
          let rem = total - base * count;
          for (const d of defenders) {
            const k = `${d.at}:${d.index}`;
            const amt = base + (rem > 0 ? 1 : 0);
            defAssignMap.set(k, amt);
            if (rem > 0) rem -= 1;
          }
        } else {
          return; // invalid without fallback; attacker must assign
        }
      }
    } else if (defenders.length === 1) {
      const only = defenders[0];
      defAssignMap.set(`${only.at}:${only.index}`, Math.floor(eff.atk));
    }
    const attackerDef = getAtkDef(pc.attacker.at, pc.attacker.index).def;
    let attackerAlive = true;
    const aliveDefenders = new Set(defenders.map((d) => `${d.at}:${d.index}`));
    // First strike window
    if (eff.firstStrike || defenders.some((d) => d.fs)) {
      // Attacker FS hits first
      if (eff.firstStrike && defenders.length > 0) {
        for (const d of defenders) {
          const k = `${d.at}:${d.index}`;
          const amt = defAssignMap.get(k) || 0;
          if (amt >= d.def) { killList.push({ at: d.at, index: d.index, owner: (d.owner === 1 ? "p1" : "p2") as PlayerKey }); aliveDefenders.delete(k); }
          else if (amt > 0) { damageList.push({ at: d.at, index: d.index, amount: amt }); }
        }
        tSeat = pc.defenderSeat as PlayerKey;
      }
      // Defender FS hits back simultaneously
      const fsAtkFromDefs = defenders.filter((d) => d.fs && aliveDefenders.has(`${d.at}:${d.index}`)).reduce((s, d) => s + d.atk, 0);
      if (fsAtkFromDefs >= attackerDef && attackerDef > 0) attackerAlive = false;
    }
    // Simultaneous/remaining strikes
    if (attackerAlive) {
      for (const d of defenders) {
        const k = `${d.at}:${d.index}`;
        if (!aliveDefenders.has(k)) continue;
        const amt = defAssignMap.get(k) || 0;
        if (amt >= d.def) { killList.push({ at: d.at, index: d.index, owner: (d.owner === 1 ? "p1" : "p2") as PlayerKey }); aliveDefenders.delete(k); }
        else if (amt > 0) { damageList.push({ at: d.at, index: d.index, amount: amt }); }
      }
      tSeat = pc.defenderSeat as PlayerKey;
    }
    if (attackerAlive) {
      const anyFS = eff.firstStrike || defenders.some((d) => d.fs);
      let sumAtk = 0;
      if (anyFS) {
        const nonFsAlive = defenders.filter((d) => !d.fs && aliveDefenders.has(`${d.at}:${d.index}`));
        sumAtk = nonFsAlive.reduce((s, d) => s + d.atk, 0);
      } else {
        // Pure simultaneous: include defenders even if they died from attacker's damage
        sumAtk = defenders.reduce((s, d) => s + d.atk, 0);
      }
      if (sumAtk >= attackerDef && attackerDef > 0) attackerAlive = false;
    }
    if (!attackerAlive) {
      killList.push({ at: pc.attacker.at, index: pc.attacker.index, owner: aSeat });
    }
    // Apply temporary damage locally (only our seat's permanents)
    for (const dmg of damageList) {
      try { get().applyDamageToPermanent(dmg.at, dmg.index, dmg.amount); } catch {}
    }
    // If there are no defenders, apply avatar/site damage (with DD rules)
    if (defenders.length === 0) {
      if (pc.target && pc.target.kind === "site") {
        const owner = board.sites[pc.target.at]?.owner as 1 | 2 | undefined;
        if (owner === 1 || owner === 2) {
          const seat = owner === 1 ? "p1" : "p2";
          tSeat = seat as PlayerKey;
          const dd = players[seat].lifeState === "dd";
          if (!dd) {
            const dmg = Math.max(0, Math.floor(eff.atk));
            if (dmg > 0) try { get().addLife(seat as PlayerKey, -dmg); } catch {}
          }
        }
      } else if (pc.target && pc.target.kind === "avatar") {
        const seat = (pc.attacker.owner === 1 ? "p2" : "p1") as PlayerKey;
        tSeat = seat;
        const isDD = players[seat].lifeState === "dd";
        const dmg = Math.max(0, Math.floor(eff.atk));
        if (isDD) {
          try { get().addLife(seat, -1); } catch {}
        } else if (dmg > 0) {
          try { get().addLife(seat, -dmg); } catch {}
        }
      }
    }
    // Apply local kills only for our own seat; send message so opponent applies theirs
    const mySeat = get().actorKey as PlayerKey | null;
    console.log('[autoResolveCombat] killList:', killList, 'mySeat:', mySeat);
    if (mySeat) {
      for (const k of killList) {
        console.log('[autoResolveCombat] checking kill:', k, 'k.owner === mySeat?', k.owner === mySeat);
        if (k.owner === mySeat) {
          console.log('[autoResolveCombat] Applying kill to graveyard:', k.at, k.index);
          try { get().movePermanentToZone(k.at, k.index, "graveyard"); } catch (err) {
            console.error('[autoResolveCombat] Error moving to graveyard:', err);
          }
        }
      }
    } else {
      // Hotseat/spectator: apply all kills locally
      for (const k of killList) {
        try { get().movePermanentToZone(k.at, k.index, "graveyard"); } catch (err) {
          console.error('[autoResolveCombat] Error moving to graveyard (hotseat):', err);
        }
      }
    }
    // Compose and broadcast actual outcome summary before final resolve
    const tr = get().transport;
    if (tr?.sendMessage && killList.length > 0) {
      try {
        console.log('[autoResolveCombat] Sending combatAutoApply with kills:', killList);
        tr.sendMessage({ type: "combatAutoApply", id: pc.id, kills: killList, ts: Date.now() } as unknown as CustomMessage);
      } catch (err) {
        console.error('[autoResolveCombat] Error sending combatAutoApply:', err);
      }
    }
    if (tr?.sendMessage && damageList.length > 0) {
      try {
        tr.sendMessage({ type: "combatDamage", id: pc.id, damage: damageList, ts: Date.now() } as unknown as CustomMessage);
      } catch {}
    }

    // Build an actual outcome summary
    const attackerNameForSummary = (() => {
      try { return (get().permanents as Permanents)[pc.attacker.at]?.[pc.attacker.index]?.card?.name || "Attacker"; } catch { return "Attacker"; }
    })();
    // Helper to get permanent name safely
    const getNameAt = (at: CellKey, index: number): string => {
      try { return (get().permanents as Permanents)[at]?.[index]?.card?.name || "Unit"; } catch { return "Unit"; }
    };
    const deadDefs = killList
      .filter((k) => k.owner === (pc.defenderSeat as PlayerKey))
      .map((k) => {
        try { return (get().permanents as Permanents)[k.at]?.[k.index]?.card?.name || null; } catch { return null; }
      })
      .filter(Boolean) as string[];
    const attackerDied = killList.some((k) => k.at === pc.attacker.at && k.index === pc.attacker.index);
    // Compute damage dealt to attacker (FS + simultaneous)
    let damageFromDefsFS = 0;
    let damageFromDefsSim = 0;
    try {
      const anyFS = eff.firstStrike || defenders.some((d) => d.fs);
      const fsContrib = defenders
        .filter((d) => d.fs && aliveDefenders.has(`${d.at}:${d.index}`))
        .reduce((s, d) => s + d.atk, 0);
      damageFromDefsFS = fsContrib;
      if (anyFS) {
        if (attackerAlive) {
          const nonFsContribAlive = defenders
            .filter((d) => !d.fs && aliveDefenders.has(`${d.at}:${d.index}`))
            .reduce((s, d) => s + d.atk, 0);
          damageFromDefsSim = nonFsContribAlive;
        }
      } else {
        // Pure simultaneous: defenders deal damage even if they die in this exchange
        damageFromDefsSim = defenders.reduce((s, d) => s + d.atk, 0);
      }
    } catch {}
    const totalDmgToAttacker = Math.max(0, Math.floor(damageFromDefsFS + damageFromDefsSim));
    let text = '';
    if ((pc.defenders?.length || 0) > 0) {
      // Unit-vs-unit outcome with names
      const defenderNames = (pc.defenders || []).map((d) => getNameAt(d.at, d.index));
      if (attackerDied) {
        const source = defenderNames.length === 1 ? `defending "${defenderNames[0]}"` : `defenders ${defenderNames.map((n) => `"${n}"`).join(', ')}`;
        text = `Attacker "${attackerNameForSummary}" takes ${totalDmgToAttacker} damage from ${source} and is destroyed`;
        if (deadDefs.length > 0) {
          text += `; defenders lost: ${deadDefs.join(', ')}`;
        }
      } else if (deadDefs.length > 0) {
        text = `Defenders destroyed: ${deadDefs.join(', ')}`;
      } else {
        const dmgDefs = damageList
          .map((d) => {
            const nm = getNameAt(d.at as CellKey, d.index);
            return `${nm}: ${d.amount}`;
          });
        text = dmgDefs.length ? `Damage dealt to defenders: ${dmgDefs.join(', ')}` : `No casualties`;
      }
    } else if (pc.target && pc.target.kind === 'avatar') {
      const seat: PlayerKey = pc.attacker.owner === 1 ? 'p2' : 'p1';
      const before = Number((players as GameState['players'])[seat]?.life ?? 0);
      const after = Number((get().players as GameState['players'])[seat]?.life ?? before);
      const dmg = Math.max(0, before - after);
      const avatarName = (() => { try { return (get().avatars?.[seat]?.card?.name as string) || 'Avatar'; } catch { return 'Avatar'; } })();
      if (before > 0 && after === 0) {
        text = `Attacker "${attackerNameForSummary}" strikes Avatar "${avatarName}" for lethal damage (reaches Death's Door)`;
      } else {
        text = `Attacker "${attackerNameForSummary}" strikes Avatar "${avatarName}" for ${dmg} damage (${seat.toUpperCase()} life ${before} -> ${after})`;
      }
    } else if (pc.target && pc.target.kind === 'site') {
      const owner = (get().board.sites[pc.target.at]?.owner as 1 | 2 | undefined);
      const seat: PlayerKey | null = owner === 1 ? 'p1' : owner === 2 ? 'p2' : null;
      const siteName = (() => { try { return pc.target && pc.target.at ? (get().board.sites[pc.target.at as CellKey]?.card?.name || 'Site') : 'Site'; } catch { return 'Site'; } })();
      if (seat) {
        const before = Number((players as GameState['players'])[seat]?.life ?? 0);
        const after = Number((get().players as GameState['players'])[seat]?.life ?? before);
        const dmg = Math.max(0, before - after);
        text = `Attacker "${attackerNameForSummary}" strikes Site "${siteName}" for ${dmg} damage (${seat.toUpperCase()} life ${before} -> ${after})`;
      } else {
        text = `Attacker "${attackerNameForSummary}" strikes Site "${siteName}"`;
      }
    } else {
      text = attackerDied ? `Attacker "${attackerNameForSummary}" is destroyed` : `No casualties`;
    }
    // Set and broadcast summary once
    set({ lastCombatSummary: { id: pc.id, text, ts: Date.now(), actor: aSeat, targetSeat: tSeat } } as Partial<GameState> as GameState);
    if (tr?.sendMessage) {
      try { tr.sendMessage({ type: 'combatSummary', id: pc.id, text, ts: Date.now(), actor: aSeat, targetSeat: tSeat } as unknown as CustomMessage); } catch {}
    }
    // Now finalize (taps, clear pending, etc.)
    get().resolveCombat();
  },
  cancelCombat: () => {
    const pc = get().pendingCombat;
    if (!pc) return;
    set({ pendingCombat: null });
    const tr = get().transport;
    if (tr?.sendMessage) {
      try {
        tr.sendMessage({ type: "combatCancel", id: pc.id, ts: Date.now() } as unknown as CustomMessage);
      } catch {}
    }
  },
  receiveCustomMessage: (msg) => {
    if (!msg || typeof msg !== "object") return;
    const t = (msg as { type?: unknown }).type;
    if (typeof t !== "string" || !t) return;
    if (t === "interceptOffer") {
      const idRaw = (msg as { id?: unknown }).id as string | undefined;
      const tile = (msg as { tile?: unknown }).tile as { x?: unknown; y?: unknown } | undefined;
      const attacker = (msg as { attacker?: unknown }).attacker as { at?: unknown; index?: unknown; instanceId?: unknown; owner?: unknown } | undefined;
      const x = Number(tile?.x);
      const y = Number(tile?.y);
      const at = typeof attacker?.at === "string" ? (attacker?.at as string) : null;
      const indexVal = Number(attacker?.index);
      const ownerVal = Number(attacker?.owner);
      const id = typeof idRaw === "string" && idRaw ? idRaw : `cmb_${Date.now().toString(36)}`;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !at || !Number.isFinite(indexVal) || !Number.isFinite(ownerVal)) return;
      const defenderSeat = (ownerVal === 1 ? "p2" : "p1") as PlayerKey;
      const mySeat = get().actorKey as PlayerKey | null;
      // Show intercept chooser only to defender seat, or in hotseat (no actorKey)
      if (mySeat && mySeat !== defenderSeat) return;
      set({
        pendingCombat: {
          id: String(id),
          tile: { x, y },
          attacker: { at, index: Number(indexVal), instanceId: (attacker?.instanceId as string | null) ?? null, owner: (ownerVal as 1 | 2) },
          target: null,
          defenderSeat,
          defenders: [],
          status: "defending",
          createdAt: Date.now(),
        },
      } as Partial<GameState> as GameState);
      try { get().log("Intercept opportunity: choose interceptors"); } catch {}
      return;
    }
    if (t === "toast") {
      const text = (msg as { text?: unknown }).text;
      if (typeof text === "string" && text.trim().length > 0) {
        try { get().log(text); } catch {}
      }
      return;
    }
    if (t === "combatCommit") {
      const id = (msg as { id?: unknown }).id as string | undefined;
      const defendersAny = (msg as { defenders?: unknown }).defenders as unknown;
      const targetAny = (msg as { target?: unknown }).target as unknown;
      const tileMsg = (msg as { tile?: unknown }).tile as { x?: unknown; y?: unknown } | undefined;
      if (!id) return;
      let defenders: Array<{ at: CellKey; index: number; owner: 1 | 2; instanceId: string | null }> = [];
      if (Array.isArray(defendersAny)) {
        defenders = defendersAny
          .filter((d) => d && typeof d === "object")
          .map((d) => d as Record<string, unknown>)
          .map((rec) => {
            const at = typeof rec.at === "string" ? (rec.at as string) : null;
            const idx = Number(rec.index);
            const ownerVal = Number(rec.owner);
            const instanceId = typeof rec.instanceId === "string" ? (rec.instanceId as string) : null;
            if (!at || !Number.isFinite(idx) || !Number.isFinite(ownerVal)) return null;
            return { at: at as CellKey, index: Number(idx), owner: ownerVal as 1 | 2, instanceId };
          })
          .filter(Boolean) as Array<{ at: CellKey; index: number; owner: 1 | 2; instanceId: string | null }>;
      }
      let target: { kind: "permanent" | "avatar" | "site"; at: CellKey; index: number | null } | null = null;
      try {
        if (targetAny && typeof targetAny === "object") {
          const rec = targetAny as Record<string, unknown>;
          const k = typeof rec.kind === "string" ? (rec.kind as string) : "";
          const a = typeof rec.at === "string" ? (rec.at as string) : "";
          const idx = rec.index == null ? null : Number(rec.index);
          const ok = k === "permanent" || k === "avatar" || k === "site";
          if (ok && a && (idx === null || Number.isFinite(idx))) {
            const kind = k as "permanent" | "avatar" | "site";
            target = { kind, at: a as CellKey, index: idx };
          }
        }
      } catch {}
      const x = Number(tileMsg?.x);
      const y = Number(tileMsg?.y);
      set((s) => {
        if (!s.pendingCombat || s.pendingCombat.id !== id) return s as GameState;
        return {
          pendingCombat: {
            ...s.pendingCombat,
            defenders,
            target: target ?? s.pendingCombat.target,
            tile: Number.isFinite(x) && Number.isFinite(y) ? { x, y } : s.pendingCombat.tile,
            status: "committed",
          },
        } as Partial<GameState> as GameState;
      });
      return;
    }
    if (t === "combatAssign") {
      const id = (msg as { id?: unknown }).id as string | undefined;
      const asgnAny = (msg as { assignment?: unknown }).assignment as unknown;
      if (!id || !Array.isArray(asgnAny)) return;
      const records = asgnAny.filter((a) => a && typeof a === "object").map((a) => a as Record<string, unknown>);
      const asgn = records
        .map((rec) => {
          const at = typeof rec.at === "string" ? (rec.at as string) : null;
          const idx = Number(rec.index);
          const amt = Number(rec.amount);
          if (!at || !Number.isFinite(idx) || !Number.isFinite(amt)) return null;
          return { at: at as CellKey, index: Number(idx), amount: Math.max(0, Math.floor(amt)) };
        })
        .filter(Boolean) as Array<{ at: CellKey; index: number; amount: number }>;
      set((s) => {
        if (!s.pendingCombat || s.pendingCombat.id !== id) return s as GameState;
        return { pendingCombat: { ...s.pendingCombat, assignment: asgn } } as Partial<GameState> as GameState;
      });
      return;
    }
    if (t === "combatDamage") {
      const dmgAny = (msg as { damage?: unknown }).damage as unknown;
      if (!Array.isArray(dmgAny)) return;
      const mySeat = get().actorKey as PlayerKey | null;
      for (const d of dmgAny) {
        if (!d || typeof d !== "object") continue;
        const rec = d as Record<string, unknown>;
        const at = typeof rec.at === "string" ? (rec.at as string) : "";
        const idx = Number(rec.index);
        const amt = Number(rec.amount);
        if (!at || !Number.isFinite(idx) || !Number.isFinite(amt)) continue;
        try {
          const ownerNum = (get().permanents as Permanents)[at]?.[Number(idx)]?.owner;
          const ownerSeat = ownerNum === 1 ? "p1" : ownerNum === 2 ? "p2" : null;
          if (!mySeat || ownerSeat !== mySeat) continue;
          get().applyDamageToPermanent(at as CellKey, Number(idx), Math.max(0, Math.floor(amt)));
        } catch {}
      }
      return;
    }
    if (t === "combatAutoApply") {
      const killsAny = (msg as { kills?: unknown }).kills as unknown;
      console.log('[combatAutoApply] Received kills:', killsAny);
      if (Array.isArray(killsAny)) {
        const mySeat = get().actorKey as PlayerKey | null;
        console.log('[combatAutoApply] mySeat:', mySeat, 'kills count:', killsAny.length);
        for (const k of killsAny) {
          if (!k || typeof k !== "object") continue;
          const rec = k as Record<string, unknown>;
          const at = typeof rec.at === "string" ? (rec.at as string) : "";
          const idx = Number(rec.index);
          const owner = (rec.owner as PlayerKey | undefined) ?? undefined;
          console.log('[combatAutoApply] Processing kill:', { at, idx, owner }, 'owner === mySeat?', owner === mySeat);
          if (!at || !Number.isFinite(idx)) continue;
          if (!mySeat || owner !== mySeat) continue;
          console.log('[combatAutoApply] Applying kill to graveyard:', at, idx);
          try { get().movePermanentToZone(at as CellKey, Number(idx), "graveyard"); } catch (err) {
            console.error('[combatAutoApply] Error moving to graveyard:', err);
          }
        }
      }
      return;
    }
    
    if (t === "combatSummary") {
      const id = (msg as { id?: unknown }).id as string | undefined;
      const text = (msg as { text?: unknown }).text as string | undefined;
      const actor = (msg as { actor?: unknown }).actor as PlayerKey | undefined;
      const targetSeat = (msg as { targetSeat?: unknown }).targetSeat as PlayerKey | undefined;
      if (id && typeof text === "string") {
        set({ lastCombatSummary: { id, text, ts: Date.now(), actor, targetSeat }, pendingCombat: null } as Partial<GameState> as GameState);
      }
      return;
    }
    if (t === "attackDeclare") {
      const id = (msg as { id?: unknown }).id;
      const tile = (msg as { tile?: unknown }).tile as { x?: unknown; y?: unknown } | undefined;
      const attacker = (msg as { attacker?: unknown }).attacker as
        | { at?: unknown; index?: unknown; instanceId?: unknown; owner?: unknown }
        | undefined;
      const targetAny = (msg as { target?: unknown }).target as unknown;
      const x = Number(tile?.x);
      const y = Number(tile?.y);
      const at = typeof attacker?.at === "string" ? (attacker?.at as string) : null;
      const indexVal = Number(attacker?.index);
      const ownerVal = Number(attacker?.owner);
      if (!id || !Number.isFinite(x) || !Number.isFinite(y) || !at || !Number.isFinite(indexVal) || !Number.isFinite(ownerVal)) return;
      const defenderSeat = (ownerVal === 1 ? "p2" : "p1") as PlayerKey;
      let target: { kind: "permanent" | "avatar" | "site"; at: CellKey; index: number | null } | null = null;
      try {
        if (targetAny && typeof targetAny === "object") {
          const rec = targetAny as Record<string, unknown>;
          const k = typeof rec.kind === "string" ? (rec.kind as string) : "";
          const a = typeof rec.at === "string" ? (rec.at as string) : "";
          const idx = rec.index == null ? null : Number(rec.index);
          const okKind = k === "permanent" || k === "avatar" || k === "site";
          if (okKind && a && (idx === null || Number.isFinite(idx))) {
            target = { kind: k as "permanent" | "avatar" | "site", at: a as CellKey, index: idx as number | null };
          }
        }
      } catch {}
      set({
        pendingCombat: {
          id: String(id),
          tile: { x, y },
          attacker: { at, index: Number(indexVal), instanceId: (attacker?.instanceId as string | null) ?? null, owner: (ownerVal as 1 | 2) },
          target,
          defenderSeat,
          defenders: [],
          status: "declared",
          createdAt: Date.now(),
        },
      } as Partial<GameState> as GameState);
      try { get().log(`Attack declared at #${y * get().board.size.w + x + 1}`); } catch {}
      return;
    }
    if (t === "combatSetDefenders") {
      const id = (msg as { id?: unknown }).id;
      const defendersAny = (msg as { defenders?: unknown }).defenders as unknown;
      if (!id || !Array.isArray(defendersAny)) return;
      const records = defendersAny
        .filter((d) => d && typeof d === "object")
        .map((d) => d as Record<string, unknown>);
      const defenders = records
        .map((rec) => {
          const at = typeof rec.at === "string" ? (rec.at as string) : null;
          const indexVal = Number(rec.index);
          const ownerVal = Number(rec.owner);
          const instanceId =
            typeof rec.instanceId === "string"
              ? (rec.instanceId as string)
              : null;
          if (!at || !Number.isFinite(indexVal) || !Number.isFinite(ownerVal)) return null;
          return {
            at,
            index: Number(indexVal),
            owner: ownerVal as 1 | 2,
            instanceId: instanceId ?? null,
          };
        })
        .filter((x): x is { at: CellKey; index: number; owner: 1 | 2; instanceId: string | null } => Boolean(x));
      set((s) => {
        if (!s.pendingCombat || s.pendingCombat.id !== (id as string)) return s as GameState;
        const prev = s.pendingCombat.status;
        return {
          pendingCombat: {
            ...s.pendingCombat,
            defenders,
            status: prev === "committed" ? "committed" : "defending",
          },
        } as Partial<GameState> as GameState;
      });
      try { get().log(`Acting player selected ${defenders.length} defender${defenders.length === 1 ? "" : "s"}`); } catch {}
      return;
    }
    if (t === "combatResolve") {
      const id = (msg as { id?: unknown }).id as string | undefined;
      const attacker = (msg as { attacker?: unknown }).attacker as { at?: unknown; index?: unknown; owner?: unknown } | undefined;
      const defendersAny = (msg as { defenders?: unknown }).defenders as unknown[] | undefined;
      const targetAny = (msg as { target?: unknown }).target as unknown;
      const tileMsg = (msg as { tile?: unknown }).tile as { x?: unknown; y?: unknown } | undefined;
      // Set taps idempotently: attacker taps on attack; defenders remain unchanged
      const aAt = typeof attacker?.at === "string" ? (attacker.at as string) : null;
      const aIdx = Number(attacker?.index);
      if (aAt && Number.isFinite(aIdx)) {
        try { get().setTapPermanent(aAt as CellKey, Number(aIdx), true); } catch {}
      }
      // Do not tap defenders here
      const defenders = Array.isArray(defendersAny) ? defendersAny : [];
      // Compute a fallback summary so both players see outcome even if a separate summary message is delayed
      try {
        const permanents = get().permanents as Permanents;
        const meta = get().metaByCardId as Record<number, { attack: number | null; defence: number | null; cost: number | null }>;
        const board = get().board;
        const players = get().players;
        function getAtkDef(at: string, index: number): { atk: number; def: number } {
          try {
            const cardId = permanents[at]?.[index]?.card?.cardId;
            const m = cardId ? meta[Number(cardId)] : undefined;
            const atk = Number(m?.attack ?? 0) || 0;
            const def = Number(m?.defence ?? m?.attack ?? 0) || 0;
            return { atk, def };
          } catch { return { atk: 0, def: 0 }; }
        }
        function getAttachments(at: string, index: number): Permanents[string] {
          const list = permanents[at] || [];
          return list.filter((p) => p.attachedTo && p.attachedTo.at === at && p.attachedTo.index === index);
        }
        function listAttachmentEffects(at: string, index: number): string[] {
          const effects: string[] = [];
          for (const t of getAttachments(at, index)) {
            const nm = (t.card?.name || "").trim();
            const low = nm.toLowerCase();
            if (low === "lance") effects.push("Lance(+1, FS)");
            else if (low === "disabled") effects.push("Disabled(Atk=0)");
            else if (nm) effects.push(nm);
          }
          return effects;
        }
        function getPermName(at: string, index: number): string {
          try { return permanents[at]?.[index]?.card?.name || "Unit"; } catch { return "Unit"; }
        }
        function getAvatarName(seat: PlayerKey): string {
          try { return (get().avatars?.[seat]?.card?.name as string) || "Avatar"; } catch { return "Avatar"; }
        }
        function computeEffectiveAttack(a: { at: CellKey; index: number }): { atk: number; firstStrike: boolean } {
          const base = getAtkDef(a.at, a.index).atk;
          const attachments = getAttachments(a.at, a.index);
          let atk = base; let firstStrike = false; let disabled = false;
          for (const tkn of attachments) {
            const nm = (tkn.card?.name || "").toLowerCase();
            if (nm === "lance") { firstStrike = true; atk += 1; }
            if (nm === "disabled") { disabled = true; }
          }
          if (disabled) atk = 0;
          if (!Number.isFinite(atk)) atk = 0;
          return { atk, firstStrike };
        }
        const aCell = aAt && Number.isFinite(aIdx) ? { at: aAt as CellKey, index: Number(aIdx) } : null;
        const eff = aCell ? computeEffectiveAttack(aCell) : { atk: 0, firstStrike: false };
        const attackerName = aCell ? getPermName(aCell.at, aCell.index) : "Attacker";
        const atkFx = aCell ? listAttachmentEffects(aCell.at, aCell.index) : [];
        const fxTxt = atkFx.length ? ` [${atkFx.join(", ")}]` : "";
        const fsTag = eff.firstStrike ? " (FS)" : "";
        const actorSeat = (Number(attacker?.owner) === 1 ? "p1" : "p2") as PlayerKey;
        let targetSeat: PlayerKey | undefined = undefined;
        // Parse optional target
        let target: { kind: "permanent" | "avatar" | "site"; at: CellKey; index: number | null } | null = null;
        if (targetAny && typeof targetAny === "object") {
          const rec = targetAny as Record<string, unknown>;
          const k = typeof rec.kind === "string" ? (rec.kind as string) : "";
          const a = typeof rec.at === "string" ? (rec.at as string) : "";
          const idx = rec.index == null ? null : Number(rec.index);
          const okKind = k === "permanent" || k === "avatar" || k === "site";
          if (okKind && a && (idx === null || Number.isFinite(idx))) {
            target = { kind: k as "permanent" | "avatar" | "site", at: a as CellKey, index: idx as number | null };
          }
        }
        let summary = "Combat resolved";
        const tileNo = (() => {
          try {
            const x = Number(tileMsg?.x);
            const y = Number(tileMsg?.y);
            if (Number.isFinite(x) && Number.isFinite(y)) return y * get().board.size.w + x + 1;
          } catch {}
          return null as number | null;
        })();
        if (target && target.kind === "site") {
          const owner = board.sites[target.at]?.owner as 1 | 2 | undefined;
          let seat: PlayerKey | null = null;
          if (owner === 1 || owner === 2) {
            seat = (owner === 1 ? "p1" : "p2") as PlayerKey;
          } else {
            seat =
              (get().pendingCombat?.defenderSeat as PlayerKey | null) ??
              ((Number(attacker?.owner) === 1 ? "p2" : "p1") as PlayerKey);
          }
          if (seat) {
            targetSeat = seat as PlayerKey;
            const dd = players[seat].lifeState === "dd";
            const dmg = dd ? 0 : Math.max(0, Math.floor(eff.atk));
            const siteName = board.sites[target.at]?.card?.name || "Site";
            const ddNote = dd ? " (DD rule)" : "";
            summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Site ${siteName} @#${tileNo ?? "?"} → Expected: ${dmg} to ${seat.toUpperCase()}${ddNote}`;
          }
        } else if (target && target.kind === "avatar") {
          const aOwner = Number(attacker?.owner);
          const seat = (aOwner === 1 ? "p2" : "p1") as PlayerKey;
          targetSeat = seat;
          const state = players[seat];
          const avatarName = getAvatarName(seat);
          if (state.lifeState === "dd") {
            summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Avatar ${avatarName} (${seat.toUpperCase()}) @#${tileNo ?? "?"} → Expected: ${seat.toUpperCase()} to 0 (lethal from DD, match ends)`;
          } else {
            const life = Number(state.life) || 0;
            const dmg = Math.max(0, Math.floor(eff.atk));
            const next = Math.max(0, life - dmg);
            if (life > 0 && next <= 0) {
              summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Avatar ${avatarName} (${seat.toUpperCase()}) @#${tileNo ?? "?"} → Expected: reaches Death's Door; further avatar/site damage this turn won't reduce life`;
            } else {
              summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Avatar ${avatarName} (${seat.toUpperCase()}) @#${tileNo ?? "?"} → Expected: ${dmg} dmg (life ${life} → ${next})`;
            }
          }
        } else {
          const tileKey = (() => {
            try {
              const x = Number(tileMsg?.x);
              const y = Number(tileMsg?.y);
              if (Number.isFinite(x) && Number.isFinite(y)) return `${x},${y}` as CellKey;
            } catch {}
            return null as CellKey | null;
          })();
          const siteAtTile = tileKey ? (board.sites[tileKey] as SiteTile | undefined) : undefined;
          if (!target && siteAtTile && siteAtTile.card && defenders.length === 0) {
            const owner = siteAtTile.owner as 1 | 2 | undefined;
            let seat: PlayerKey | null = owner === 1 ? "p1" : owner === 2 ? "p2" : (get().pendingCombat?.defenderSeat as PlayerKey | null);
            if (!seat) seat = ((Number(attacker?.owner) === 1 ? "p2" : "p1") as PlayerKey);
            if (seat) {
              targetSeat = seat as PlayerKey;
              const dd = players[seat].lifeState === "dd";
              const dmg = dd ? 0 : Math.max(0, Math.floor(eff.atk));
              const siteName = siteAtTile.card?.name || "Site";
              const ddNote = dd ? " (DD rule)" : "";
              summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Site ${siteName} @#${tileNo ?? "?"} → Expected: ${dmg} to ${seat.toUpperCase()}${ddNote}`;
            }
          } else {
            const aAtk = eff.atk;
            let targetDef = 0;
            let targetName = "target";
            if (target && target.kind === "permanent" && target.index != null) {
              targetDef = getAtkDef(target.at, target.index).def;
              targetName = getPermName(target.at, target.index);
            } else if (defenders.length > 0) {
              const defRecs: Record<string, unknown>[] = (defenders as unknown[])
                .filter((d: unknown) => d && typeof d === "object")
                .map((d: unknown) => d as Record<string, unknown>);
              targetDef = 0;
              for (const rec of defRecs) {
                const at = typeof rec.at === "string" ? (rec.at as string) : "";
                const idx = Number(rec.index);
                if (at && Number.isFinite(idx)) targetDef += getAtkDef(at, Number(idx)).def;
              }
              const names: string[] = [];
              for (const rec of defRecs.slice(0, 3)) {
                const at = typeof rec.at === "string" ? (rec.at as string) : "";
                const idx = Number(rec.index);
                if (at && Number.isFinite(idx)) names.push(getPermName(at, Number(idx)));
              }
              targetName = names.join(", ") + (defenders.length > 3 ? ", …" : "");
            }
            const kills = aAtk >= targetDef;
            targetSeat = (get().pendingCombat?.defenderSeat ?? null) as PlayerKey | null || undefined;
            summary = `Attacker ${attackerName}${fxTxt}${fsTag} vs ${targetName} @#${tileNo ?? "?"} → Expected: Atk ${aAtk} vs Def ${targetDef} (${kills ? "likely kill" : "may fail"})`;
          }
        }
        const exists = get().lastCombatSummary;
        if (exists && String(exists.id) === String(id || "")) {
          // Keep the already received detailed summary; just clear pending state
          set({ pendingCombat: null } as Partial<GameState> as GameState);
        } else {
          set({ lastCombatSummary: { id: String(id || Date.now()), text: summary, ts: Date.now(), actor: actorSeat, targetSeat }, pendingCombat: null } as Partial<GameState> as GameState);
        }
      } catch {
        set({ pendingCombat: null } as Partial<GameState> as GameState);
      }
      try { get().log("Combat resolved"); } catch {}
      return;
    }
    if (t === "combatCancel") {
      set({ pendingCombat: null });
      try { get().log("Combat cancelled"); } catch {}
      return;
    }
  },
  interactionLog: {},
  pendingInteractionId: null,
  acknowledgedInteractionIds: {},
  activeInteraction: null,
  appliedCombatResolves: {},
  setTransport: (t) => {
    const prev = get().transportSubscriptions;
    if (Array.isArray(prev) && prev.length > 0) {
      for (const unsubscribe of prev) {
        try {
          unsubscribe?.();
        } catch {}
      }
    }
    const unsubscribers: Array<() => void> = [];
    if (t) {
      try {
        unsubscribers.push(
          t.on("interaction", (envelope) => {
            try {
              get().receiveInteractionEnvelope(envelope);
            } catch {}
          }),
          t.on("interaction:request", (msg) => {
            try {
              get().receiveInteractionEnvelope(wrapInteractionMessage(msg));
            } catch {}
          }),
          t.on("interaction:response", (msg) => {
            try {
              get().receiveInteractionEnvelope(wrapInteractionMessage(msg));
            } catch {}
          }),
          t.on("interaction:result", (msg) => {
            try {
              get().receiveInteractionResult(msg);
            } catch {}
          }),
          t.on("message", (m) => {
            try {
              get().receiveCustomMessage(m as unknown as CustomMessage);
            } catch {}
          })
        );
      } catch {}
    }
    set({ transport: t, transportSubscriptions: unsubscribers });
    if (t) {
      try {
        get().flushPendingPatches();
      } catch {}
    }
  },
  sendInteractionRequest: (input) => {
    const requestId = input.requestId ?? generateInteractionRequestId();
    const grantOverride = normalizeGrantRequest(input.grant);
    const basePayload = { ...(input.payload ?? {}) } as Record<string, unknown>;
    if (grantOverride) {
      basePayload.grant = grantOverride;
    }
    const request = createInteractionRequest({
      requestId,
      from: input.from,
      to: input.to,
      kind: input.kind,
      matchId: input.matchId,
      note: input.note,
      payload: Object.keys(basePayload).length > 0 ? basePayload : undefined,
    });
    set((state) => {
      const existing = state.interactionLog[requestId];
      const nextEntry: InteractionRequestEntry = {
        request,
        response: existing?.response,
        status: "pending",
        direction: existing?.direction ?? "outbound",
        grant: existing?.grant ?? null,
        proposedGrant: grantOverride ?? existing?.proposedGrant ?? null,
        receivedAt: existing?.receivedAt ?? request.createdAt,
        updatedAt: request.createdAt,
      };
      const nextLog: InteractionStateMap = {
        ...state.interactionLog,
        [requestId]: nextEntry,
      };
      const focus = computeInteractionFocus(nextLog);
      return {
        interactionLog: nextLog,
        pendingInteractionId: focus.pendingId,
        activeInteraction: focus.active,
      };
    });
    const transport = get().transport;
    const envelope = wrapInteractionMessage(request);
    try {
      let maybe: unknown = undefined;
      if (transport?.sendInteractionRequest) {
        maybe = transport.sendInteractionRequest(request);
      } else if (transport?.sendInteractionEnvelope) {
        maybe = transport.sendInteractionEnvelope(envelope);
      } else if (transport?.sendMessage) {
        maybe = transport.sendMessage(envelope as unknown as CustomMessage);
      } else if (!transport) {
        try {
          console.warn(
            "[interaction] transport unavailable; request queued in log",
            requestId
          );
        } catch {}
      } else {
        try {
          console.warn(
            "[interaction] transport missing interaction senders; request not sent",
            requestId
          );
        } catch {}
      }
      if (maybe && typeof (maybe as Promise<unknown>).then === "function") {
        (maybe as Promise<unknown>).catch((err) => {
          try {
            console.warn("[interaction] send request rejected", err);
          } catch {}
        });
      }
    } catch (err) {
      try {
        console.warn("[interaction] failed to send request", err);
      } catch {}
    }
    try {
      const k = String(input.kind || "request");
      const msg = `Consent requested: '${k}'`;
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("app:toast", { detail: { message: msg } })
        );
      }
    } catch {}
  },
  receiveInteractionEnvelope: (incoming) => {
    const message: InteractionMessage | null = (() => {
      if (!incoming || typeof incoming !== "object") return null;
      if (
        (incoming as InteractionEnvelope).type === "interaction" &&
        "message" in incoming
      ) {
        return (incoming as InteractionEnvelope).message;
      }
      if (
        (incoming as Partial<InteractionMessage>).type ===
          "interaction:request" ||
        (incoming as Partial<InteractionMessage>).type ===
          "interaction:response"
      ) {
        return incoming as InteractionMessage;
      }
      return null;
    })();
    if (!message) return;
    const now = Date.now();
    if (message.type === "interaction:request") {
      const payload = (message.payload ?? {}) as Record<string, unknown>;
      const proposedGrant =
        normalizeGrantRequest(payload.grant) ??
        normalizeGrantRequest(payload.proposedGrant);
      set((state) => {
        const existing = state.interactionLog[message.requestId];
        const nextEntry: InteractionRequestEntry = {
          request: message,
          response: existing?.response,
          status: existing?.status ?? "pending",
          direction: existing?.direction ?? "inbound",
          grant: existing?.grant ?? null,
          proposedGrant: proposedGrant ?? existing?.proposedGrant ?? null,
          receivedAt: existing?.receivedAt ?? message.createdAt ?? now,
          updatedAt: now,
        };
        const nextLog: InteractionStateMap = {
          ...state.interactionLog,
          [message.requestId]: nextEntry,
        };
        const focus = computeInteractionFocus(nextLog);
        return {
          interactionLog: nextLog,
          pendingInteractionId: focus.pendingId,
          activeInteraction: focus.active,
        };
      });
      return;
    }
    if (message.type === "interaction:response") {
      const payload = (message.payload ?? {}) as Record<string, unknown>;
      const grantOverride =
        normalizeGrantRequest(payload.grant) ??
        normalizeGrantRequest(payload.proposedGrant);
      // Prepare requester-visible logging of the decision
      const localId = get().localPlayerId;
      let shouldLogDecision = false;
      let decisionLogText: string | null = null;
      set((state) => {
        const existing = state.interactionLog[message.requestId];
        const baseRequest =
          existing?.request ??
          createInteractionRequest({
            requestId: message.requestId,
            matchId: message.matchId,
            from: message.to,
            to: message.from,
            kind: message.kind,
            createdAt: message.createdAt,
            expiresAt: message.expiresAt,
          });
        const nextGrant =
          message.decision === "approved"
            ? grantFromRequest(
                baseRequest,
                message.from,
                grantOverride ?? existing?.proposedGrant ?? {}
              )
            : null;
        const nextEntry: InteractionRequestEntry = {
          request: baseRequest,
          response: message,
          status: message.decision,
          direction: existing?.direction ?? "outbound",
          grant: nextGrant,
          proposedGrant: grantOverride ?? existing?.proposedGrant ?? null,
          receivedAt: existing?.receivedAt ?? baseRequest.createdAt ?? now,
          updatedAt: now,
        };
        // Only log the opponent's decision to the requester, and only once
        const wasAlreadyAnswered = !!existing?.response;
        const isRequester = !!localId && baseRequest.from === localId;
        if (!wasAlreadyAnswered && isRequester) {
          const k = String(message.kind || "request");
          if (message.decision === "approved") {
            decisionLogText = `Consent result: '${k}' approved.`;
            shouldLogDecision = true;
          } else if (message.decision === "declined") {
            const reason =
              typeof message.reason === "string" && message.reason.trim().length
                ? `: ${message.reason}`
                : ".";
            decisionLogText = `Consent result: '${k}' declined${reason}`;
            shouldLogDecision = true;
          } else if (message.decision === "cancelled") {
            const reason =
              typeof message.reason === "string" && message.reason.trim().length
                ? `: ${message.reason}`
                : ".";
            decisionLogText = `Consent result: '${k}' cancelled${reason}`;
            shouldLogDecision = true;
          }
        }
        const nextLog: InteractionStateMap = {
          ...state.interactionLog,
          [message.requestId]: nextEntry,
        };
        const focus = computeInteractionFocus(nextLog);
        const acknowledged = {
          ...state.acknowledgedInteractionIds,
          [message.requestId]: true as const,
        };
        return {
          interactionLog: nextLog,
          pendingInteractionId: focus.pendingId,
          activeInteraction: focus.active,
          acknowledgedInteractionIds: acknowledged,
        };
      });
      // Perform logging outside of set to avoid state churn in the same reducer pass
      if (shouldLogDecision && decisionLogText) {
        try {
          get().log(decisionLogText);
        } catch {}
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", { detail: { message: decisionLogText } })
            );
          }
        } catch {}
      }
    }
  },
  receiveInteractionResult: (message: InteractionResultMessage) => {
    const now = Date.now();
    set((state) => {
      const existing = state.interactionLog[message.requestId];
      const nextEntry: InteractionRequestEntry | undefined = existing
        ? {
            ...existing,
            result: message,
            updatedAt: now,
          }
        : undefined;
      const nextLog: InteractionStateMap = nextEntry
        ? { ...state.interactionLog, [message.requestId]: nextEntry }
        : { ...state.interactionLog };
      const acknowledged = {
        ...state.acknowledgedInteractionIds,
        [message.requestId]: true as const,
      };

      // Attempt to open peek dialog if cards were revealed
      const p = (message.payload ?? {}) as Record<string, unknown>;
      const requestedBy =
        typeof p.requestedBy === "string" && p.requestedBy.length > 0
          ? p.requestedBy
          : null;
      const actorSeat =
        p.actorSeat === "p1" || p.actorSeat === "p2"
          ? (p.actorSeat as PlayerKey)
          : null;
      const localId = state.localPlayerId;
      const mySeat = state.actorKey;

      let isAllowed = true;
      if (requestedBy) {
        isAllowed = localId === requestedBy;
      } else if (actorSeat) {
        isAllowed = mySeat === actorSeat;
      }

      if (!isAllowed) {
        return {
          interactionLog: nextLog,
          acknowledgedInteractionIds: acknowledged,
        } as Partial<GameState> as GameState;
      }
      const cardsAny = Array.isArray(p.cards) ? (p.cards as unknown[]) : [];
      const cards: CardRef[] = cardsAny.filter(
        (c) => c && typeof c === "object"
      ) as CardRef[];
      if (message.success && cards.length > 0) {
        const seat =
          p.seat === "p1" || p.seat === "p2" ? (p.seat as PlayerKey) : null;
        const pile =
          typeof p.pile === "string" ? (p.pile as string) : undefined;
        const from =
          typeof p.from === "string" ? (p.from as string) : undefined;
        const count = Number.isFinite(Number(p.count))
          ? Number(p.count)
          : cards.length;
        const title = seat
          ? `${seat.toUpperCase()} ${
              pile === "atlas"
                ? "Atlas"
                : pile === "hand"
                ? "Hand"
                : pile === "banished"
                ? "Banished"
                : "Spellbook"
            }${from ? ` (${from})` : ""}`
          : message.kind || "Peek Results";
        // Log a warning for hidden information reveals
        const who = seat ? (seat === "p1" ? 1 : 2) : "?";
        try {
          get().log(
            `[Warning] Revealed ${count} card(s) from P${who}${
              pile ? ` ${pile}` : ""
            }${from ? ` (${from})` : ""}`
          );
        } catch {}
        return {
          interactionLog: nextLog,
          acknowledgedInteractionIds: acknowledged,
          peekDialog: { title, cards },
        } as Partial<GameState> as GameState;
      }
      // Default: just update the log/acknowledged flags and optionally log message
      // Only log successful results to avoid noisy server debug like
      // 'Unsupported pending action kind' for unimplemented actions.
      try {
        if (message.success && message.message) get().log(message.message);
      } catch {}
      return {
        interactionLog: nextLog,
        acknowledgedInteractionIds: acknowledged,
      } as Partial<GameState> as GameState;
    });
  },
  respondToInteraction: (requestId, decision, actorId, options) => {
    const state = get();
    const entry = state.interactionLog[requestId];
    if (!entry) return;
    const now = Date.now();
    const request = entry.request;
    const overrideGrant = normalizeGrantRequest(options?.grant);
    const payload = { ...(options?.payload ?? {}) } as Record<string, unknown>;
    if (overrideGrant) {
      payload.grant = overrideGrant;
    }
    const response = createInteractionResponse({
      requestId,
      matchId: request.matchId,
      from: actorId,
      to: request.from,
      kind: request.kind,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
      decision,
      reason: options?.reason,
      payload: Object.keys(payload).length > 0 ? payload : undefined,
      respondedAt: now,
    });
    const nextGrant =
      decision === "approved"
        ? grantFromRequest(
            request,
            actorId,
            overrideGrant ?? entry.proposedGrant ?? {}
          )
        : null;
    set((state) => {
      const nextEntry: InteractionRequestEntry = {
        ...entry,
        response,
        status: decision,
        grant: nextGrant,
        proposedGrant: overrideGrant ?? entry.proposedGrant ?? null,
        updatedAt: now,
      };
      const nextLog: InteractionStateMap = {
        ...state.interactionLog,
        [requestId]: nextEntry,
      };
      const focus = computeInteractionFocus(nextLog);
      const acknowledged = {
        ...state.acknowledgedInteractionIds,
        [requestId]: true as const,
      };
      return {
        interactionLog: nextLog,
        pendingInteractionId: focus.pendingId,
        activeInteraction: focus.active,
        acknowledgedInteractionIds: acknowledged,
      };
    });
    const transport = get().transport;
    const envelope = wrapInteractionMessage(response);
    try {
      let maybe: unknown = undefined;
      if (transport?.sendInteractionResponse) {
        maybe = transport.sendInteractionResponse(response);
      } else if (transport?.sendInteractionEnvelope) {
        maybe = transport.sendInteractionEnvelope(envelope);
      } else if (transport?.sendMessage) {
        maybe = transport.sendMessage(envelope as unknown as CustomMessage);
      } else if (!transport) {
        try {
          console.warn(
            "[interaction] transport unavailable; response logged only",
            requestId
          );
        } catch {}
      } else {
        try {
          console.warn(
            "[interaction] transport missing interaction senders; response not sent",
            requestId
          );
        } catch {}
      }
      if (maybe && typeof (maybe as Promise<unknown>).then === "function") {
        (maybe as Promise<unknown>).catch((err) => {
          try {
            console.warn("[interaction] response send rejected", err);
          } catch {}
        });
      }
    } catch (err) {
      try {
        console.warn("[interaction] failed to send response", err);
      } catch {}
    }
  },
  expireInteraction: (requestId) => {
    const now = Date.now();
    set((state) => {
      const entry = state.interactionLog[requestId];
      if (!entry) return {};
      const nextEntry: InteractionRequestEntry = {
        ...entry,
        status: "expired",
        updatedAt: now,
      };
      const nextLog: InteractionStateMap = {
        ...state.interactionLog,
        [requestId]: nextEntry,
      };
      const focus = computeInteractionFocus(nextLog);
      return {
        interactionLog: nextLog,
        pendingInteractionId: focus.pendingId,
        activeInteraction: focus.active,
      };
    });
  },
  clearInteraction: (requestId) => {
    set((state) => {
      if (!(requestId in state.interactionLog)) return {};
      const nextLog: InteractionStateMap = { ...state.interactionLog };
      delete nextLog[requestId];
      const nextAck = { ...state.acknowledgedInteractionIds };
      delete nextAck[requestId];
      const focus = computeInteractionFocus(nextLog);
      return {
        interactionLog: nextLog,
        pendingInteractionId: focus.pendingId,
        activeInteraction: focus.active,
        acknowledgedInteractionIds: nextAck,
      };
    });
  },
  // Pending patches queue for offline/error cases
  pendingPatches: [],
  // Centralized, safe patch sender. Returns true if sent immediately, false if queued.
  trySendPatch: (patch) => {
    const state = get();
    if (state.matchEnded) {
      // Allow the final end-of-match patch containing matchEnded/winner fields
      // to pass through so the server can finalize and broadcast results.
      try {
        const p = patch as ServerPatchT;
        const hasEndInfo =
          p && typeof p === "object" && ("matchEnded" in p || "winner" in p);
        if (!hasEndInfo) {
          console.debug("[net] trySendPatch: blocked after match ended");
          return false;
        }
      } catch {
        return false;
      }
    }
    const tr = state.transport;
    if (!patch || typeof patch !== "object") return false;
    // Sanitize to prevent illegal opponent mutations in online play
    const actorKey = get().actorKey;
    let toSend: ServerPatchT = patch as ServerPatchT;
    const replaceKeysCandidate = Array.isArray(
      (patch as ServerPatchT).__replaceKeys
    )
      ? (patch as ServerPatchT).__replaceKeys
      : null;
    const isAuthoritativeSnapshot = !!(
      replaceKeysCandidate && replaceKeysCandidate.length > 0
    );
    if (!isAuthoritativeSnapshot) {
      const patchObj = patch as ServerPatchT;
      const touchesSeatFields =
        (patchObj.avatars && typeof patchObj.avatars === "object") ||
        (patchObj.zones && typeof patchObj.zones === "object");
      if (!actorKey && touchesSeatFields) {
        set((s) => {
          const queue = Array.isArray(s.pendingPatches)
            ? s.pendingPatches
            : [];
          return {
            pendingPatches: [...queue, clonePatchForQueue(patchObj)],
          } as Partial<GameState> as GameState;
        });
        try {
          console.warn(
            "[net] trySendPatch: queued seat-specific patch until actorKey is set"
          );
        } catch {}
        return false;
      }
    }
    let signatureInfo: ReturnType<typeof makePatchSignature> | null = null;
    if (!isAuthoritativeSnapshot) {
      try {
        const p = patch as ServerPatchT & {
          __allowZoneSeats?: PlayerKey[];
        };
        const sanitized: ServerPatchT = { ...p };
        const allowZoneSeats = Array.isArray(p.__allowZoneSeats)
          ? (p.__allowZoneSeats as PlayerKey[])
          : null;
        if (allowZoneSeats) {
          delete (p as Record<string, unknown>).__allowZoneSeats;
        }
        if (allowZoneSeats) {
          delete (sanitized as Record<string, unknown>).__allowZoneSeats;
        }
        // Filter avatars: if actorKey known, allow only that seat; otherwise drop until actor identified
        if (p.avatars && typeof p.avatars === "object") {
          const keys = Object.keys(p.avatars).filter(
            (k) => k === "p1" || k === "p2"
          ) as PlayerKey[];
          if (actorKey === "p1" || actorKey === "p2") {
            const out: Partial<GameState["avatars"]> = {};
            const k = actorKey as PlayerKey;
            if (keys.includes(k)) {
              const v = (p.avatars as GameState["avatars"])[k];
              if (v && typeof v === "object") {
                (out as Record<string, unknown>)[k] = {
                  ...(v as Record<string, unknown>),
                } as unknown;
              }
            }
            if (Object.keys(out).length > 0) {
              sanitized.avatars = out as GameState["avatars"];
            } else {
              delete (sanitized as unknown as { avatars?: unknown }).avatars;
            }
          } else {
            try {
              console.warn(
                "[net] trySendPatch: dropping avatars until actorKey is set",
                { keys }
              );
            } catch {}
            delete (sanitized as unknown as { avatars?: unknown }).avatars;
          }
        }
        // Filter zones: keep only actor seat updates when actor known
        if (p.zones && typeof p.zones === "object") {
          const allowedSeats = new Set<PlayerKey>();
          if (actorKey === "p1" || actorKey === "p2") {
            allowedSeats.add(actorKey);
          }
          if (allowZoneSeats) {
            for (const seat of allowZoneSeats) {
              if (seat === "p1" || seat === "p2") {
                allowedSeats.add(seat);
              }
            }
          }
          if (allowedSeats.size > 0) {
            const z = p.zones as Partial<Record<PlayerKey, Zones>>;
            const outZ: Partial<Record<PlayerKey, Zones>> = {};
            for (const seat of allowedSeats) {
              if (z[seat]) outZ[seat] = z[seat] as Zones;
            }
            if (Object.keys(outZ).length > 0) {
              sanitized.zones = outZ as GameState["zones"];
            } else {
              delete (sanitized as unknown as { zones?: unknown }).zones;
            }
          } else {
            // Actor unknown: DROP zone mutations until seat is known to avoid cross-seat wipes
            try {
              console.warn(
                "[net] trySendPatch: dropping zones until actorKey is set",
                { keys: Object.keys(p.zones) }
              );
            } catch {}
            delete (sanitized as unknown as { zones?: unknown }).zones;
          }
        }
        toSend = sanitized;
      } catch {}
      signatureInfo = makePatchSignature(toSend);
    }
    if (process.env.NODE_ENV !== "production") {
      try {
        const p = toSend as ServerPatchT;
        if (p.avatars && typeof p.avatars === "object") {
          console.debug("[net] trySendPatch avatars ->", {
            actorKey,
            avatars: p.avatars,
          });
        }
      } catch {}
    }
    if (!tr) {
      set((s) => ({ pendingPatches: [...s.pendingPatches, toSend] }));
      try {
        console.warn("[net] Transport unavailable: queued patch");
      } catch {}
      return false;
    }
    try {
      tr.sendAction(toSend);
      if (signatureInfo && signatureInfo.fields.length > 0) {
        registerPatchSignature(signatureInfo, toSend);
      }
      // Mark last local action timestamp so undo can wait for server ack ordering
      set({ lastLocalActionTs: Date.now() });
      return true;
    } catch (err) {
      set((s) => ({ pendingPatches: [...s.pendingPatches, toSend] }));
      try {
        console.warn(`[net] Send failed, queued patch: ${String(err)}`);
      } catch {}
      return false;
    }
  },
  // Attempt to flush any queued patches when transport is available
  flushPendingPatches: () => {
    const queue = get().pendingPatches;
    if (!Array.isArray(queue) || queue.length === 0) return;
    const tr = get().transport;
    const actorKey = get().actorKey;
    if (!tr || !actorKey) return;

    const remaining: ServerPatchT[] = [];
    for (const p of queue) {
      try {
        let toSend: ServerPatchT = p as ServerPatchT;
        const replaceKeysCandidate = Array.isArray(
          (p as ServerPatchT).__replaceKeys
        )
          ? (p as ServerPatchT).__replaceKeys
          : null;
        const isAuthoritativeSnapshot = !!(
          replaceKeysCandidate && replaceKeysCandidate.length > 0
        );
        let signatureInfo: ReturnType<typeof makePatchSignature> | null = null;
        if (!isAuthoritativeSnapshot) {
          try {
            const sanitized: ServerPatchT = { ...(p as ServerPatchT) };
            if (sanitized.avatars && typeof sanitized.avatars === "object") {
              const keys = Object.keys(sanitized.avatars).filter(
                (k) => k === "p1" || k === "p2"
              ) as PlayerKey[];
              const out: Partial<GameState["avatars"]> = {};
              if (keys.includes(actorKey as PlayerKey)) {
                const v = (sanitized.avatars as GameState["avatars"])[
                  actorKey as PlayerKey
                ];
                if (v && typeof v === "object") {
                  (out as Record<string, unknown>)[
                    actorKey as PlayerKey
                  ] = { ...(v as Record<string, unknown>) } as unknown;
                }
              }
              if (Object.keys(out).length > 0) {
                sanitized.avatars = out as GameState["avatars"];
              } else {
                delete (sanitized as unknown as { avatars?: unknown }).avatars;
              }
            }
            if (sanitized.zones && typeof sanitized.zones === "object") {
              const z = sanitized.zones as Partial<Record<PlayerKey, Zones>>;
              const outZ: Partial<Record<PlayerKey, Zones>> = {};
              if (z[actorKey as PlayerKey]) {
                outZ[actorKey as PlayerKey] = z[actorKey as PlayerKey] as Zones;
              }
              if (Object.keys(outZ).length > 0) {
                sanitized.zones = outZ as GameState["zones"];
              } else {
                delete (sanitized as unknown as { zones?: unknown }).zones;
              }
            }
            toSend = sanitized;
          } catch {}
        }
        if (!isAuthoritativeSnapshot) {
          signatureInfo = makePatchSignature(toSend);
        }
        tr.sendAction(toSend);
        if (signatureInfo && signatureInfo.fields.length > 0) {
          registerPatchSignature(signatureInfo, toSend);
        }
      } catch (err) {
        remaining.push(p as ServerPatchT);
        try {
          console.warn(`[net] Flush failed: ${String(err)}`);
        } catch {}
      }
    }
    if (remaining.length === 0) set({ pendingPatches: [] });
    else set({ pendingPatches: remaining });
  },

  checkMatchEnd: () => {
    const state = get();
    const p1LifeState = state.players.p1.lifeState;
    const p2LifeState = state.players.p2.lifeState;

    // Check if either player is dead
    if (p1LifeState === "dead" && p2LifeState !== "dead") {
      set({ matchEnded: true, winner: "p2" });
      const patch = { matchEnded: true, winner: "p2" as PlayerKey };
      get().trySendPatch(patch);
      return;
    }
    if (p2LifeState === "dead" && p1LifeState !== "dead") {
      set({ matchEnded: true, winner: "p1" });
      const patch = { matchEnded: true, winner: "p1" as PlayerKey };
      get().trySendPatch(patch);
      return;
    }
    if (p1LifeState === "dead" && p2LifeState === "dead") {
      set({ matchEnded: true, winner: null });
      const patch = { matchEnded: true, winner: null as PlayerKey | null };
      get().trySendPatch(patch);
      return;
    }

    // Match continues
    set({ matchEnded: false, winner: null });
  },

  board: { size: { w: 5, h: 4 }, sites: {} },
  showGridOverlay: false,
  showPlaymat: true,
  cameraMode: "orbit",
  zones: createEmptyZonesRecord(),
  selectedCard: null,
  selectedPermanent: null,
  selectedAvatar: null,
  // Hand visibility state
  mouseInHandZone: false,
  handHoverCount: 0,
  avatars: createDefaultAvatars(),
  permanents: {},
  // UI state
  dragFromHand: false,
  dragFromPile: null,
  hoverCell: null,
  previewCard: null,
  contextMenu: null,
  history: [],
  historyByPlayer: { p1: [], p2: [] },
  // Mulligans
  mulligans: { p1: 1, p2: 1 },
  mulliganDrawn: { p1: [], p2: [] },
  // Events
  events: [],
  eventSeq: 0,
  log: (text: string) =>
    set((s) => {
      const nextId = s.eventSeq + 1;
      const currentTurn = s.turn || 1;
      const e = { id: nextId, ts: Date.now(), text, turn: currentTurn };
      const eventsAll = [...s.events, e];
      const events =
        eventsAll.length > MAX_EVENTS
          ? eventsAll.slice(-MAX_EVENTS)
          : eventsAll;
      // Sync console events across players
      const patch: ServerPatchT = { events, eventSeq: nextId };
      get().trySendPatch(patch);
      return { events, eventSeq: nextId } as Partial<GameState> as GameState;
    }),
  boardPings: [],
  pushBoardPing: (ping) => {
    const id = String(ping.id || "").trim();
    if (!id) return;
    const ts =
      typeof ping.ts === "number" && Number.isFinite(ping.ts)
        ? ping.ts
        : Date.now();
    const event: BoardPingEvent = {
      id,
      position: {
        x: Number(ping.position?.x) || 0,
        z: Number(ping.position?.z) || 0,
      },
      playerId: typeof ping.playerId === "string" ? ping.playerId : null,
      playerKey:
        ping.playerKey === "p1" || ping.playerKey === "p2"
          ? ping.playerKey
          : null,
      ts,
    };
    set((state) => {
      if (state.boardPings.some((entry) => entry.id === id)) {
        return state as GameState;
      }
      const cutoff = ts - BOARD_PING_LIFETIME_MS;
      const filtered = state.boardPings.filter((entry) => entry.ts > cutoff);
      const next =
        filtered.length >= BOARD_PING_MAX_HISTORY
          ? [
              ...filtered.slice(filtered.length - BOARD_PING_MAX_HISTORY + 1),
              event,
            ]
          : [...filtered, event];
      return {
        boardPings: next,
      } as Partial<GameState> as GameState;
    });
    const timeout = BOARD_PING_LIFETIME_MS + 100;
    const removeLater = () => {
      try {
        get().removeBoardPing(id);
      } catch {}
    };
    if (typeof window !== "undefined") {
      window.setTimeout(removeLater, timeout);
    } else {
      setTimeout(removeLater, timeout);
    }
  },
  removeBoardPing: (id) =>
    set((state) => ({
      boardPings: state.boardPings.filter((entry) => entry.id !== id),
    })),
  lastPointerWorldPos: null,
  setLastPointerWorldPos: (pos) => set({ lastPointerWorldPos: pos }),
  // Remote cursors
  remoteCursors: {},
  setRemoteCursor: (cursor) =>
    set((state) => {
      try {
        const id = String(cursor.playerId || "").trim();
        if (!id) return state as GameState;
        const prev = state.remoteCursors[id] || null;
        const ts = Number.isFinite(cursor.ts) ? Number(cursor.ts) : Date.now();
        if (prev && Number(prev.ts) >= ts) return state as GameState;
        const noPresence =
          !cursor.position && !cursor.dragging && !cursor.highlight;
        if (noPresence) {
          if (!(id in state.remoteCursors)) return state as GameState;
          const next = { ...state.remoteCursors };
          delete next[id];
          return { remoteCursors: next } as Partial<GameState> as GameState;
        }
        const nextHighlight =
          cursor.highlight === undefined
            ? prev?.highlight ?? null
            : cursor.highlight;

        const nextEntry: RemoteCursorState = {
          playerId: id,
          playerKey:
            cursor.playerKey === "p1" || cursor.playerKey === "p2"
              ? cursor.playerKey
              : prev?.playerKey ?? null,
          position: cursor.position ?? null,
          dragging: cursor.dragging ?? null,
          highlight: nextHighlight,
          ts,
          displayName: null,
          // Store previous position and timestamp for interpolation
          prevPosition: prev?.position ?? null,
          prevTs: prev?.ts ?? ts,
        };
        return {
          remoteCursors: {
            ...state.remoteCursors,
            [id]: nextEntry,
          },
        } as Partial<GameState> as GameState;
      } catch {
        return state as GameState;
      }
    }),
  pruneRemoteCursors: (olderThanMs) =>
    set((state) => {
      const cutoff = Date.now() - olderThanMs;
      const next: Record<string, RemoteCursorState> = {};
      let changed = false;
      for (const [id, entry] of Object.entries(state.remoteCursors || {})) {
        if (!entry || Number(entry.ts) < cutoff) {
          changed = true;
          continue;
        }
        next[id] = entry;
      }
      if (!changed) return state as GameState;
      return { remoteCursors: next } as Partial<GameState> as GameState;
    }),
  getRemoteHighlightColor: (card, options) => {
    if (!card) return null;
    const state = get();
    const slug =
      typeof card.slug === "string" && card.slug.length > 0 ? card.slug : null;
    const cardId = Number.isFinite(card.cardId) ? Number(card.cardId) : null;
    const instanceKey = options?.instanceKey ?? null;
    if (cardId === null && slug === null && instanceKey === null) return null;
    for (const entry of Object.values(state.remoteCursors || {})) {
      if (!entry?.highlight) continue;
      const {
        cardId: highlightId,
        slug: highlightSlug,
        instanceKey: highlightInstanceKey,
      } = entry.highlight;
      const instanceMatches =
        instanceKey !== null &&
        typeof highlightInstanceKey === "string" &&
        highlightInstanceKey === instanceKey;
      const allowFallback =
        instanceKey === null || highlightInstanceKey === null;
      let matchesId = false;
      let matchesSlug = false;
      if (allowFallback) {
        matchesId =
          cardId !== null &&
          Number.isFinite(highlightId) &&
          Number(highlightId) === cardId;
        matchesSlug =
          slug !== null &&
          typeof highlightSlug === "string" &&
          highlightSlug === slug;
      }
      if (!instanceMatches && !matchesId && !matchesSlug) continue;
      if (entry.playerKey === "p1") return PLAYER_COLORS.p1;
      if (entry.playerKey === "p2") return PLAYER_COLORS.p2;
      return PLAYER_COLORS.spectator;
    }
    return null;
  },
  localPlayerId: null,
  setLocalPlayerId: (id) => set({ localPlayerId: id ?? null }),

  // Snapshots: used for emergency restore (auto) and realm archive (manual)
  snapshots: (typeof window !== "undefined" ? loadSnapshotsFromStorageFor(null) : []) as unknown as GameState["snapshots"],
  createSnapshot: (title: string, kind: "auto" | "manual" = "manual") =>
    set((s) => {
      const id = `ss_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const payload: ServerPatchT = JSON.parse(
        JSON.stringify({
          players: s.players,
          currentPlayer: s.currentPlayer,
          turn: s.turn,
          phase: s.phase,
          board: s.board,
          zones: s.zones,
          avatars: s.avatars,
          permanents: s.permanents,
          permanentPositions: s.permanentPositions,
          permanentAbilities: s.permanentAbilities,
          sitePositions: s.sitePositions,
          playerPositions: s.playerPositions,
          events: s.events,
          eventSeq: s.eventSeq,
        })
      ) as ServerPatchT;
      const item = {
        id,
        title: title && title.length > 0 ? title : kind === "auto" ? `Turn ${s.turn} start (P${s.currentPlayer})` : "Realm Archive",
        ts: Date.now(),
        includePrivate: true,
        kind,
        turn: s.turn,
        actor: s.actorKey ?? null,
        payload,
      };
      const prev = Array.isArray(s.snapshots) ? s.snapshots : [];
      let list: typeof prev;
      if (kind === "manual") {
        // Keep only one manual archive at a time
        const withoutManual = prev.filter((x) => x.kind !== "manual");
        list = [...withoutManual, item];
      } else {
        // Keep last 5 auto snapshots total (prune to 4, add new => 5)
        const autos = prev.filter((x) => x.kind === "auto");
        const nonAutos = prev.filter((x) => x.kind !== "auto");
        const keep = autos.slice(Math.max(autos.length - 4, 0));
        list = [...nonAutos, ...keep, item];
      }
      try {
        get().log(`Saved snapshot '${item.title}'`);
      } catch {}
      try {
        saveSnapshotsToStorageFor(get().matchId ?? null, list as GameState["snapshots"]);
      } catch {}
      return { snapshots: list } as Partial<GameState> as GameState;
    }),
  hydrateSnapshotsFromStorage: () =>
    set((s) => {
      const snaps = loadSnapshotsFromStorageFor(s.matchId ?? null);
      return { snapshots: snaps } as Partial<GameState> as GameState;
    }),

  // Apply an incremental server patch into the store.
  // - Only whitelisted game-state fields are updated
  // - Arrays are replaced; objects are deep-merged
  // - UI/transient fields (drag, dialogs, selection, overlays, camera, history) are untouched
  applyServerPatch: (patch, t) =>
    set((s) => {
      if (!patch || typeof patch !== "object") return s as GameState;
      if (typeof t === "number" && t < (s.lastServerTs ?? 0))
        return s as GameState;

      let incoming = patch as ServerPatchT;
      const replaceKeysCandidateInitial = Array.isArray(incoming.__replaceKeys)
        ? incoming.__replaceKeys
        : null;
      if (!replaceKeysCandidateInitial || replaceKeysCandidateInitial.length === 0) {
        const echoResult = filterEchoPatchIfAny(incoming);
        if (echoResult.matched) {
          if (!echoResult.patch) {
            if (typeof t === "number") {
              const lastTsEcho = Math.max(s.lastServerTs ?? 0, t);
              if (lastTsEcho !== (s.lastServerTs ?? 0)) {
                return { ...s, lastServerTs: lastTsEcho } as GameState;
              }
            }
            return s as GameState;
          }
          incoming = echoResult.patch;
        }
      }

      const p = incoming as ServerPatchT;
      const next: Partial<GameState> = {};
      const replaceKeys = new Set<string>(
        Array.isArray(p.__replaceKeys) ? p.__replaceKeys : []
      );
      if (replaceKeys.size > 0) {
        try {
          console.debug("[net] applyServerPatch: authoritative snapshot", {
            keys: Array.from(replaceKeys),
            t: typeof t === "number" ? t : null,
            prevTs: s.lastServerTs ?? 0,
          });
          // Compact diagnostics when board/zones/permanents are involved
          if (
            replaceKeys.has("permanents") ||
            replaceKeys.has("zones") ||
            replaceKeys.has("board")
          ) {
            const prevPerCount = Object.values(s.permanents || {}).reduce(
              (a, v) => a + (Array.isArray(v) ? v.length : 0),
              0
            );
            const prevSiteCount =
              s.board && s.board.sites ? Object.keys(s.board.sites).length : 0;
            const prevHandP1 = s.zones?.p1?.hand?.length ?? 0;
            const prevHandP2 = s.zones?.p2?.hand?.length ?? 0;
            console.debug("[net] snapshot(prev)", {
              per: prevPerCount,
              sites: prevSiteCount,
              handP1: prevHandP1,
              handP2: prevHandP2,
            });
            const pPer = p.permanents
              ? Object.values(p.permanents as Record<string, unknown[]>).reduce(
                  (a, v) => a + (Array.isArray(v) ? v.length : 0),
                  0
                )
              : undefined;
            const pBoard = p.board as GameState["board"] | undefined;
            const pZones = p.zones as GameState["zones"] | undefined;
            const pSites = pBoard?.sites
              ? Object.keys(pBoard.sites).length
              : undefined;
            const pHandP1 = pZones?.p1?.hand?.length;
            const pHandP2 = pZones?.p2?.hand?.length;
            console.debug("[net] snapshot(patch)", {
              per: pPer,
              sites: pSites,
              handP1: pHandP1,
              handP2: pHandP2,
            });
          }
        } catch {}
      }

      if (p.players !== undefined) {
        next.players = replaceKeys.has("players")
          ? p.players
          : deepMergeReplaceArrays(s.players, p.players);
      }
      if (p.currentPlayer !== undefined) {
        next.currentPlayer = p.currentPlayer;
      }
      if (p.turn !== undefined) {
        next.turn = p.turn;
      }
      if (p.phase !== undefined) {
        next.phase = p.phase;
      }
      if (p.d20Rolls !== undefined) {
        next.d20Rolls = replaceKeys.has("d20Rolls")
          ? p.d20Rolls
          : deepMergeReplaceArrays(s.d20Rolls, p.d20Rolls);
        console.log("[applyServerPatch] Applied d20Rolls:", { prev: s.d20Rolls, new: next.d20Rolls, isReplace: replaceKeys.has("d20Rolls") });
      }
      const patchHasSetupWinner =
        p.setupWinner !== undefined ||
        Object.prototype.hasOwnProperty.call(p, "setupWinner");
      if (p.setupWinner !== undefined) next.setupWinner = p.setupWinner;
      if (!patchHasSetupWinner) {
        const derivedFromD20 = (() => {
          const source = (next.d20Rolls ?? s.d20Rolls) as
            | Record<PlayerKey, number | null>
            | undefined;
          if (!source) return null;
          const r1 = source.p1;
          const r2 = source.p2;
          if (r1 == null || r2 == null) return null;
          if (Number(r1) === Number(r2)) return null;
          return Number(r1) > Number(r2) ? "p1" : "p2";
        })();
        if (derivedFromD20 && next.setupWinner === undefined) {
          next.setupWinner = derivedFromD20;
        }
      }

      // Apply match end result from server so all clients reflect the outcome
      let shouldClearSnapshots = false;
      if (p.matchEnded !== undefined) {
        next.matchEnded = !!p.matchEnded;
        if (p.matchEnded === true) {
          shouldClearSnapshots = true;
        }
      }
      if (p.winner !== undefined) {
        next.winner = p.winner as PlayerKey | null;
      }

      if (p.board !== undefined) {
        next.board = replaceKeys.has("board")
          ? p.board
          : deepMergeReplaceArrays(s.board, p.board);
      }
      if (p.zones !== undefined) {
        const candidate = replaceKeys.has("zones")
          ? (p.zones as Partial<Record<PlayerKey, Partial<Zones>>>)
          : (deepMergeReplaceArrays(s.zones, p.zones) as Partial<
              Record<PlayerKey, Partial<Zones>>
            >);
        next.zones = normalizeZones(
          candidate,
          replaceKeys.has("zones") ? undefined : s.zones
        );
      }
      if (p.avatars !== undefined) {
        const candidate = replaceKeys.has("avatars")
          ? (p.avatars as Partial<Record<PlayerKey, Partial<AvatarState>>>)
          : (deepMergeReplaceArrays(s.avatars, p.avatars) as Partial<
              Record<PlayerKey, Partial<AvatarState>>
            >);
        next.avatars = normalizeAvatars(
          candidate,
          replaceKeys.has("avatars") ? undefined : s.avatars
        );
      }
      if (p.permanents !== undefined) {
        const source = replaceKeys.has("permanents")
          ? (p.permanents as Permanents)
          : mergePermanentsMap(s.permanents, p.permanents);
        next.permanents = normalizePermanentsRecord(
          source as Permanents
        ) as GameState["permanents"];
      }
      if (p.mulligans !== undefined) {
        next.mulligans = replaceKeys.has("mulligans")
          ? p.mulligans
          : deepMergeReplaceArrays(s.mulligans, p.mulligans);
      } else if (replaceKeys.has("mulligans")) {
        next.mulligans = { p1: 0, p2: 0 } as GameState["mulligans"];
      }
      if (p.mulliganDrawn !== undefined) {
        next.mulliganDrawn = replaceKeys.has("mulliganDrawn")
          ? p.mulliganDrawn
          : deepMergeReplaceArrays(s.mulliganDrawn, p.mulliganDrawn);
      } else if (replaceKeys.has("mulliganDrawn")) {
        next.mulliganDrawn = { p1: [], p2: [] } as GameState["mulliganDrawn"];
      }
      if (p.permanentPositions !== undefined) {
        next.permanentPositions = replaceKeys.has("permanentPositions")
          ? (p.permanentPositions as GameState["permanentPositions"])
          : deepMergeReplaceArrays(s.permanentPositions, p.permanentPositions);
      } else if (replaceKeys.has("permanentPositions")) {
        next.permanentPositions = {} as GameState["permanentPositions"];
      }
      if (p.permanentAbilities !== undefined) {
        next.permanentAbilities = replaceKeys.has("permanentAbilities")
          ? (p.permanentAbilities as GameState["permanentAbilities"])
          : deepMergeReplaceArrays(s.permanentAbilities, p.permanentAbilities);
      } else if (replaceKeys.has("permanentAbilities")) {
        next.permanentAbilities = {} as GameState["permanentAbilities"];
      }
      if (p.sitePositions !== undefined) {
        next.sitePositions = replaceKeys.has("sitePositions")
          ? (p.sitePositions as GameState["sitePositions"])
          : deepMergeReplaceArrays(s.sitePositions, p.sitePositions);
      } else if (replaceKeys.has("sitePositions")) {
        next.sitePositions = {} as GameState["sitePositions"];
      }
      if (p.playerPositions !== undefined) {
        const candidate = replaceKeys.has("playerPositions")
          ? (p.playerPositions as Partial<
              Record<PlayerKey, Partial<PlayerPositionReference>>
            >)
          : (deepMergeReplaceArrays(
              s.playerPositions,
              p.playerPositions
            ) as Partial<Record<PlayerKey, Partial<PlayerPositionReference>>>);
        next.playerPositions = normalizePlayerPositions(
          candidate,
          replaceKeys.has("playerPositions") ? undefined : s.playerPositions
        );
      } else if (replaceKeys.has("playerPositions")) {
        next.playerPositions = createDefaultPlayerPositions();
      }
      if (p.events !== undefined) {
        // Merge events deterministically
        next.events = replaceKeys.has("events")
          ? Array.isArray(p.events)
            ? p.events
            : []
          : mergeEvents(s.events, Array.isArray(p.events) ? p.events : []);
        next.eventSeq = Math.max(s.eventSeq, Number(p.eventSeq) || 0);
      }

      // Guarded auto-snapshot on Start phase or when new turn/seat is observed via server patches
      try {
        const candidatePhase = (p.phase as GameState["phase"]) ?? s.phase;
        const candidateTurn = (p.turn as GameState["turn"]) ?? s.turn;
        const candidateCP = (p.currentPlayer as GameState["currentPlayer"]) ?? s.currentPlayer;
        const newTurn = candidateTurn !== s.turn;
        const seatChanged = candidateCP !== s.currentPlayer;
        const enteringStart = candidatePhase === "Start" && s.phase !== "Start";
        if ((enteringStart || newTurn || seatChanged) && candidatePhase !== "Setup") {
          const prevSnaps = Array.isArray(s.snapshots) ? s.snapshots : [];
          const hasForTurn = prevSnaps.some((ss) => ss.kind === "auto" && ss.turn === candidateTurn);
          if (!hasForTurn) {
            setTimeout(() => {
              try {
                get().createSnapshot(`Turn ${candidateTurn} start (P${candidateCP})`, "auto");
              } catch {}
            }, 0);
          }
        }
      } catch {}

      const lastTs =
        typeof t === "number" ? Math.max(s.lastServerTs ?? 0, t) : Date.now();
      const extra: Partial<GameState> = {};
      if (replaceKeys.size > 0) {
        const pending = s.pendingPatches ?? [];
        const remainingPending: ServerPatchT[] = [];
        if (pending.length > 0) {
          try {
            console.debug("[net] applyServerPatch: reconciling pending patches");
          } catch {}
          for (const queued of pending) {
            if (!queued || typeof queued !== "object") continue;
            const queuedPatch = queued as ServerPatchT;
            const touchesCritical =
              "permanents" in queuedPatch ||
              "zones" in queuedPatch ||
              "board" in queuedPatch;
            if (!touchesCritical) {
              remainingPending.push(queuedPatch);
              continue;
            }
            const merged = deepMergeReplaceArrays(
              next,
              queuedPatch
            ) as Partial<GameState>;
            Object.assign(next, merged);
            try {
              console.debug("[net] applyServerPatch: applied pending after snapshot");
            } catch {}
          }
        }
        extra.pendingPatches = remainingPending;
        extra.selectedCard = null;
        extra.selectedPermanent = null;
        extra.previewCard = null;
        try {
          const mergedPer = (next.permanents ?? s.permanents) || {};
          const mergedPerCount = Object.values(mergedPer).reduce(
            (a, v) => a + (Array.isArray(v) ? v.length : 0),
            0
          );
          const mergedZones = next.zones ?? s.zones;
          const mergedSummary = {
            p1: {
              hand: mergedZones?.p1?.hand?.length ?? 0,
              spellbook: mergedZones?.p1?.spellbook?.length ?? 0,
              atlas: mergedZones?.p1?.atlas?.length ?? 0,
              graveyard: mergedZones?.p1?.graveyard?.length ?? 0,
            },
            p2: {
              hand: mergedZones?.p2?.hand?.length ?? 0,
              spellbook: mergedZones?.p2?.spellbook?.length ?? 0,
              atlas: mergedZones?.p2?.atlas?.length ?? 0,
              graveyard: mergedZones?.p2?.graveyard?.length ?? 0,
            },
          };
          console.debug("[net] snapshot(next)", {
            permanentsCount: mergedPerCount,
            zones: mergedSummary,
            hasPermanentPositions: !!(
              next.permanentPositions ?? s.permanentPositions
            ),
          });
        } catch {}
      }
      const result = {
        ...s,
        ...next,
        ...extra,
        lastServerTs: lastTs,
      } as Partial<GameState> as GameState;
      if (shouldClearSnapshots) {
        try { clearSnapshotsStorageFor(get().matchId ?? null); } catch {}
        (result as GameState).snapshots = [] as GameState["snapshots"];
      }
      return result;
    }),

  // Apply a replay patch (simplified version without server communication or timestamps)
  applyPatch: (patch) =>
    set((s) => {
      if (!patch || typeof patch !== "object") return s as GameState;

      const p = patch as ServerPatchT;
      const next: Partial<GameState> = {};
      const replaceKeys = new Set<string>(
        Array.isArray(p.__replaceKeys) ? p.__replaceKeys : []
      );

      if (p.players !== undefined) {
        next.players = replaceKeys.has("players")
          ? (p.players as GameState["players"])
          : deepMergeReplaceArrays(s.players, p.players);
      }
      if (p.currentPlayer !== undefined) {
        next.currentPlayer = p.currentPlayer;
      }
      if (p.turn !== undefined) {
        next.turn = p.turn;
      }
      if (p.phase !== undefined) {
        next.phase = p.phase;
      }
      if (p.d20Rolls !== undefined) {
        next.d20Rolls = p.d20Rolls;
      }
      if (p.setupWinner !== undefined) {
        next.setupWinner = p.setupWinner;
      }
      if (p.matchEnded !== undefined) {
        next.matchEnded = p.matchEnded;
      }
      if (p.winner !== undefined) {
        next.winner = p.winner;
      }
      if (p.board !== undefined) {
        next.board = replaceKeys.has("board")
          ? (p.board as GameState["board"])
          : deepMergeReplaceArrays(s.board, p.board);
      }
      if (p.zones !== undefined) {
        next.zones = replaceKeys.has("zones")
          ? (p.zones as GameState["zones"])
          : deepMergeReplaceArrays(s.zones, p.zones);
      }
      if (p.avatars !== undefined) {
        next.avatars = replaceKeys.has("avatars")
          ? (p.avatars as GameState["avatars"])
          : deepMergeReplaceArrays(s.avatars, p.avatars);
      }
      if (p.permanents !== undefined) {
        if (replaceKeys.has("permanents")) {
          next.permanents = normalizePermanentsRecord(
            (p.permanents as Permanents) || ({} as Permanents)
          ) as GameState["permanents"];
        } else {
          const merged = mergePermanentsMap(s.permanents, p.permanents);
          next.permanents = normalizePermanentsRecord(
            merged as Permanents
          ) as GameState["permanents"];
        }
      }
      if (p.mulligans !== undefined) {
        next.mulligans = replaceKeys.has("mulligans")
          ? (p.mulligans as GameState["mulligans"])
          : deepMergeReplaceArrays(s.mulligans, p.mulligans);
      }
      if (p.mulliganDrawn !== undefined) {
        next.mulliganDrawn = replaceKeys.has("mulliganDrawn")
          ? (p.mulliganDrawn as GameState["mulliganDrawn"])
          : deepMergeReplaceArrays(s.mulliganDrawn, p.mulliganDrawn);
      }
      if (p.permanentPositions !== undefined) {
        next.permanentPositions = replaceKeys.has("permanentPositions")
          ? (p.permanentPositions as GameState["permanentPositions"])
          : deepMergeReplaceArrays(
              s.permanentPositions,
              p.permanentPositions
            );
      }
      if (p.permanentAbilities !== undefined) {
        next.permanentAbilities = replaceKeys.has("permanentAbilities")
          ? (p.permanentAbilities as GameState["permanentAbilities"])
          : deepMergeReplaceArrays(
              s.permanentAbilities,
              p.permanentAbilities
            );
      }
      if (p.sitePositions !== undefined) {
        next.sitePositions = replaceKeys.has("sitePositions")
          ? (p.sitePositions as GameState["sitePositions"])
          : deepMergeReplaceArrays(s.sitePositions, p.sitePositions);
      }
      if (p.playerPositions !== undefined) {
        next.playerPositions = replaceKeys.has("playerPositions")
          ? (p.playerPositions as GameState["playerPositions"])
          : deepMergeReplaceArrays(s.playerPositions, p.playerPositions);
      }
      if (p.events !== undefined) {
        if (replaceKeys.has("events")) {
          const ev = (p.events as GameEvent[]) || [];
          next.events = ev;
          next.eventSeq =
            p.eventSeq !== undefined
              ? Math.max(Number(p.eventSeq) || 0, 0)
              : Math.max(ev.reduce((mx, e) => Math.max(mx, Number(e.id) || 0), 0), 0);
        } else {
          const merged = mergeEvents(s.events, (p.events as GameEvent[]) || []);
          next.events = merged;
          const mergedMaxId = merged.reduce(
            (mx, e) => Math.max(mx, Number(e.id) || 0),
            0
          );
          const candidateSeq = Math.max(s.eventSeq, mergedMaxId);
          next.eventSeq =
            p.eventSeq !== undefined
              ? Math.max(candidateSeq, Number(p.eventSeq) || 0)
              : candidateSeq;
        }
      } else if (p.eventSeq !== undefined) {
        next.eventSeq = replaceKeys.has("eventSeq")
          ? Math.max(Number(p.eventSeq) || 0, 0)
          : Math.max(s.eventSeq, Number(p.eventSeq) || 0);
      }

      return next as Partial<GameState> as GameState;
    }),

  // History helpers
  pushHistory: () =>
    set((s) => {
      const snap: SerializedGame = {
        actorKey: s.actorKey ?? null,
        players: JSON.parse(JSON.stringify(s.players)),
        currentPlayer: s.currentPlayer,
        turn: s.turn,
        phase: s.phase,
        d20Rolls: JSON.parse(JSON.stringify(s.d20Rolls)),
        setupWinner: s.setupWinner,
        board: JSON.parse(JSON.stringify(s.board)),
        showGridOverlay: s.showGridOverlay,
        showPlaymat: s.showPlaymat,
        cameraMode: s.cameraMode,
        zones: JSON.parse(JSON.stringify(s.zones)),
        selectedCard: s.selectedCard
          ? JSON.parse(JSON.stringify(s.selectedCard))
          : null,
        selectedPermanent: s.selectedPermanent
          ? { ...s.selectedPermanent }
          : null,
        avatars: JSON.parse(JSON.stringify(s.avatars)),
        permanents: JSON.parse(JSON.stringify(s.permanents)),
        mulligans: JSON.parse(JSON.stringify(s.mulligans)),
        mulliganDrawn: JSON.parse(JSON.stringify(s.mulliganDrawn)),
        permanentPositions: JSON.parse(JSON.stringify(s.permanentPositions)),
        permanentAbilities: JSON.parse(JSON.stringify(s.permanentAbilities)),
        sitePositions: JSON.parse(JSON.stringify(s.sitePositions)),
        playerPositions: JSON.parse(JSON.stringify(s.playerPositions)),
        events: JSON.parse(JSON.stringify(s.events)),
        eventSeq: s.eventSeq,
      };
      // Global history (kept for UI enable/disable and offline)
      const nextHist = [...s.history, snap];
      if (nextHist.length > 10) nextHist.shift();
      // Per-player history to avoid cross-effects online
      const hb = { ...s.historyByPlayer } as Record<
        PlayerKey,
        SerializedGame[]
      >;
      if (s.actorKey) {
        const me = s.actorKey as PlayerKey;
        const nextPlayerHist = [...(hb[me] || []), snap];
        if (nextPlayerHist.length > 10) nextPlayerHist.shift();
        hb[me] = nextPlayerHist;
      }
      return {
        history: nextHist,
        historyByPlayer: hb,
      } as Partial<GameState> as GameState;
    }),
  undo: () =>
    set((s) => {
      // Prefer per-player stack when actorKey is set (online)
      const hb = { ...s.historyByPlayer } as Record<
        PlayerKey,
        SerializedGame[]
      >;
      let prev: SerializedGame | null = null;
      let historyNext: SerializedGame[] | null = null;
      if (s.actorKey && hb[s.actorKey]?.length) {
        const me = s.actorKey as PlayerKey;
        const arr = [...hb[me]];
        prev = arr.pop() || null;
        hb[me] = arr;
      }
      // Fallback to global history if nothing in per-player
      if (!prev) {
        if (!s.history.length) {
          if (s.transport) {
            try {
              get().log("Nothing to undo for your seat yet");
            } catch {}
          }
          return s as GameState;
        }
        const nextHist = [...s.history];
        let candidate: SerializedGame | null = null;
        while (nextHist.length) {
          const maybe = nextHist.pop() || null;
          if (!maybe) continue;
          const snapshotActor = maybe.actorKey ?? null;
          const isOnline = !!s.transport;
          if (!isOnline || snapshotActor === null || snapshotActor === s.actorKey) {
            candidate = maybe;
            break;
          }
        }
        if (!candidate) {
          if (s.transport) {
            try {
              get().log("Nothing to undo for your seat yet");
            } catch {}
          }
          return s as GameState;
        }
        prev = candidate;
        historyNext = nextHist;
      }
      if (!prev) return s as GameState;
      // Online: broadcast authoritative snapshot and let server echo apply.
      const tr = s.transport;
      if (tr) {
        // If we have an un-acked local action, delay undo slightly to preserve ordering
        if ((s.lastServerTs ?? 0) < (s.lastLocalActionTs ?? 0)) {
          try {
            console.debug("[undo] Delaying undo until server ack catches up", {
              lastServerTs: s.lastServerTs,
              lastLocalActionTs: s.lastLocalActionTs,
            });
          } catch {}
          setTimeout(() => {
            try {
              useGameStore.getState().undo();
            } catch {}
          }, 120);
          return s as GameState;
        }
        try {
          const perCount = Object.values(prev.permanents || {}).reduce(
            (a, v) => a + (Array.isArray(v) ? v.length : 0),
            0
          );
          const sanitizeBoardSitesForUndo = (
            board: GameState["board"] | undefined
          ) => {
            if (!board || typeof board !== "object") return board;
            const sitesPrev = board.sites;
            if (!sitesPrev || typeof sitesPrev !== "object") return board;
            let changed = false;
            const sitesNext = {} as typeof sitesPrev;
            for (const key of Object.keys(sitesPrev)) {
              const tile = sitesPrev[key];
              if (
                tile &&
                typeof tile === "object" &&
                Object.prototype.hasOwnProperty.call(tile, "tapped")
              ) {
                const cleaned = { ...(tile as Record<string, unknown>) };
                delete cleaned.tapped;
                sitesNext[key] = cleaned as (typeof sitesPrev)[typeof key];
                changed = true;
              } else {
                sitesNext[key] = tile as (typeof sitesPrev)[typeof key];
              }
            }
            if (!changed) return board;
            return {
              ...board,
              sites: sitesNext,
            } satisfies GameState["board"];
          };

          const boardForUndo = sanitizeBoardSitesForUndo(
            prev.board as GameState["board"]
          );

          const patch: ServerPatchT = {
            players: prev.players,
            currentPlayer: prev.currentPlayer,
            turn: prev.turn,
            phase: prev.phase,
            d20Rolls: prev.d20Rolls,
            setupWinner: prev.setupWinner,
            board: boardForUndo,
            zones: prev.zones,
            avatars: prev.avatars,
            permanents: prev.permanents,
            mulligans: prev.mulligans,
            mulliganDrawn: prev.mulliganDrawn,
            permanentPositions: prev.permanentPositions,
            permanentAbilities: prev.permanentAbilities,
            sitePositions: prev.sitePositions,
            playerPositions: prev.playerPositions,
            // Keep events in sync so both clients show the same log
            events: prev.events,
            eventSeq: prev.eventSeq,
            __replaceKeys: [
              "players",
              "currentPlayer",
              "turn",
              "phase",
              "d20Rolls",
              "setupWinner",
              "board",
              "zones",
              "avatars",
              "permanents",
              "mulligans",
              "mulliganDrawn",
              "permanentPositions",
              "permanentAbilities",
              "sitePositions",
              "playerPositions",
              "events",
              "eventSeq",
            ],
          } as ServerPatchT;
          try {
            console.debug(
              "[undo] Broadcasting authoritative snapshot to server",
              {
                keys: patch.__replaceKeys,
                eventSeq: patch.eventSeq,
                permanentsCount: perCount,
              }
            );
          } catch {}
          get().trySendPatch(patch);
        } catch {}
        // Do not immediately mutate local game state; only update history stacks.
        return {
          history: historyNext ?? s.history,
          historyByPlayer: hb as GameState["historyByPlayer"],
        } as Partial<GameState> as GameState;
      }
      // Offline/hotseat: restore immediately
      return {
        history: historyNext ?? s.history,
        historyByPlayer: hb as GameState["historyByPlayer"],
        players: prev.players,
        currentPlayer: prev.currentPlayer,
        turn: prev.turn,
        phase: prev.phase,
        d20Rolls: prev.d20Rolls,
        setupWinner: prev.setupWinner,
        board: prev.board,
        showGridOverlay: prev.showGridOverlay,
        showPlaymat: prev.showPlaymat,
        cameraMode: prev.cameraMode,
        zones: prev.zones,
        selectedCard: prev.selectedCard,
        selectedPermanent: prev.selectedPermanent,
        avatars: prev.avatars,
        permanents: prev.permanents,
        mulligans: prev.mulligans,
        mulliganDrawn: prev.mulliganDrawn,
        permanentPositions: prev.permanentPositions,
        permanentAbilities: prev.permanentAbilities,
        sitePositions: prev.sitePositions,
        playerPositions: prev.playerPositions,
        events: prev.events,
        eventSeq: prev.eventSeq,
      } as Partial<GameState> as GameState;
    }),

  setDragFromHand: (on) => set({ dragFromHand: on }),
  setDragFromPile: (info) => set({ dragFromPile: info }),
  setHoverCell: (x, y) => set({ hoverCell: [x, y] }),
  clearHoverCell: () => set({ hoverCell: null }),
  setPreviewCard: (card) => set({ previewCard: card }),
  openContextMenu: (target, screen) => set({ contextMenu: { target, screen } }),
  closeContextMenu: () => set({ contextMenu: null }),
  placementDialog: null,
  openPlacementDialog: (cardName, pileName, onPlace) =>
    set({ placementDialog: { cardName, pileName, onPlace } }),
  closePlacementDialog: () => set({ placementDialog: null }),
  searchDialog: null,
  openSearchDialog: (pileName, cards, onSelectCard) => {
    set({ searchDialog: { pileName, cards, onSelectCard } });
    get().log(`Viewing ${pileName} (${cards.length} cards)`);
  },
  closeSearchDialog: () => set({ searchDialog: null }),
  // Peek-only dialog used for reveals (no selection handler)
  peekDialog: null,
  openPeekDialog: (title, cards) => set({ peekDialog: { title, cards } }),
  closePeekDialog: () => set({ peekDialog: null }),

  // --- Tokens ---------------------------------------------------------------
  addTokenToHand: (who, name) =>
    set((s) => {
      const def = TOKEN_BY_NAME[(name || "").toLowerCase()];
      if (!def) return s as GameState;
      const hand = [...s.zones[who].hand];
      const baseToken: CardRef = {
        cardId: newTokenInstanceId(def),
        variantId: null,
        name: def.name,
        type: "Token",
        slug: tokenSlug(def),
        thresholds: null,
        instanceId: newZoneCardInstanceId(),
      };
      const card = prepareCardForSeat(baseToken, who);
      hand.push(card);
      get().log(`${who.toUpperCase()} adds token '${def.name}' to hand`);
      const zonesNext = {
        ...s.zones,
        [who]: { ...s.zones[who], hand },
      } as GameState["zones"];
      {
        const tr = get().transport;
        if (tr) {
          const zonePatch = createZonesPatchFor(zonesNext, who);
          if (zonePatch) {
            get().trySendPatch(zonePatch);
          }
        }
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  scryMany: (
    who: PlayerKey,
    from: "spellbook" | "atlas",
    count: number,
    bottomIndexes: number[]
  ) =>
    set((s) => {
      const pile0 = from === "spellbook" ? s.zones[who].spellbook : s.zones[who].atlas;
      const pile = [...pile0];
      const k = Math.max(0, Math.min(pile.length, Math.floor(count || 0)));
      if (k <= 0 || pile.length === 0) return s as GameState;
      const top = pile.slice(0, k).map((c) => prepareCardForSeat(c, who));
      const rest = pile.slice(k).map((c) => prepareCardForSeat(c, who));
      const setBottom = new Set(
        Array.isArray(bottomIndexes)
          ? bottomIndexes.filter((i) => Number.isInteger(i) && i >= 0 && i < k)
          : []
      );
      const keepers = top.filter((_, i) => !setBottom.has(i));
      const movers = top.filter((_, i) => setBottom.has(i));
      const nextPile = [...keepers, ...rest, ...movers];
      const zonesNext = {
        ...s.zones,
        [who]: {
          ...s.zones[who],
          ...(from === "spellbook" ? { spellbook: nextPile } : { atlas: nextPile }),
        },
      } as GameState["zones"];
      get().log(`${who.toUpperCase()} scries ${k} from ${from} (${movers.length} to bottom)`);
      {
        const tr = get().transport;
        if (tr) {
          const zonePatch = createZonesPatchFor(zonesNext, who);
          if (zonePatch) get().trySendPatch(zonePatch);
        }
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  attachTokenToTopPermanent: (at, index) =>
    set((s) => {
      const arr = s.permanents[at] || [];
      const token = arr[index];
      if (!token) return s;
      const nonTokenIndices = arr
        .map((it, i) => ({ it, i }))
        .filter(
          ({ it }) => !(it.card.type || "").toLowerCase().includes("token")
        );
      if (nonTokenIndices.length === 0) return s;
      const last = nonTokenIndices[nonTokenIndices.length - 1];
      const targetIdx = last ? last.i : 0;
      const per: Permanents = { ...s.permanents };
      const list = [...(per[at] || [])];
      const updatedToken = bumpPermanentVersion({
        ...token,
        attachedTo: { at, index: targetIdx },
      });
      list[index] = updatedToken;
      per[at] = list;
      get().log(`Attached token '${token.card.name}' to permanent at ${at}`);
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: list[index].instanceId ?? undefined,
            attachedTo: { at, index: targetIdx },
            version: list[index].version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  // --- Temporary combat damage on permanents -------------------------------
  applyDamageToPermanent: (at, index, amount) =>
    set((s) => {
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[at] || [])];
      const cur = arr[index];
      if (!cur) return s as GameState;
      const curDmg = Math.max(0, Number(cur.damage || 0));
      const add = Math.max(0, Math.floor(Number(amount || 0)));
      const nextDmg = curDmg + add;
      const next = bumpPermanentVersion({ ...cur, damage: nextDmg });
      arr[index] = next;
      per[at] = arr;
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: next.instanceId ?? undefined,
            damage: next.damage ?? null,
            version: next.version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  clearAllDamageForSeat: (seat) =>
    set((s) => {
      const owner = seat === "p1" ? 1 : 2;
      const per: Permanents = { ...s.permanents };
      const updates: PermanentDeltaUpdate[] = [];
      for (const [cell, list] of Object.entries(per)) {
        const arr = [...(list || [])];
        let changed = false;
        for (let i = 0; i < arr.length; i++) {
          const cur = arr[i];
          if (!cur) continue;
          if (cur.owner !== owner) continue;
          const dmg = Math.max(0, Number(cur.damage || 0));
          if (dmg > 0) {
            const next = bumpPermanentVersion({ ...cur, damage: null });
            arr[i] = next;
            updates.push({
              at: cell as CellKey,
              entry: {
                instanceId: next.instanceId ?? undefined,
                damage: null,
                version: next.version,
              },
            });
            changed = true;
          }
        }
        if (changed) {
          per[cell as CellKey] = arr;
        }
      }
      if (updates.length > 0) {
        const deltaPatch = createPermanentDeltaPatch(updates);
        if (deltaPatch) get().trySendPatch(deltaPatch);
        else get().trySendPatch(createPermanentsPatch(per));
      }
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  attachTokenToPermanent: (at, tokenIndex, targetIndex) =>
    set((s) => {
      const arr = s.permanents[at] || [];
      const token = arr[tokenIndex];
      const target = arr[targetIndex];
      if (!token || !target) return s;

      // Verify token is actually a token
      if (!(token.card.type || "").toLowerCase().includes("token")) return s;

      // Verify target is not a token
      if ((target.card.type || "").toLowerCase().includes("token")) return s;

      const per: Permanents = { ...s.permanents };
      const list = [...(per[at] || [])];
      const updatedToken = bumpPermanentVersion({
        ...token,
        attachedTo: { at, index: targetIndex },
      });
      list[tokenIndex] = updatedToken;
      per[at] = list;
      get().log(
        `Attached token '${token.card.name}' to permanent '${target.card.name}' at ${at}`
      );
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: list[tokenIndex].instanceId ?? undefined,
            attachedTo: { at, index: targetIndex },
            version: list[tokenIndex].version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  attachPermanentToAvatar: (at: CellKey, permanentIndex: number, avatarKey: PlayerKey) =>
    set((s) => {
      const arr = s.permanents[at] || [];
      const permanent = arr[permanentIndex];
      if (!permanent) return s;

      // Verify avatar exists and is on the same tile
      const avatar = s.avatars[avatarKey as PlayerKey];
      if (!avatar || !avatar.pos) return s;
      const [avatarX, avatarY] = avatar.pos;
      const [permX, permY] = at.split(",").map(Number);
      if (avatarX !== permX || avatarY !== permY) {
        get().log(`Cannot attach to avatar: not on same tile`);
        return s;
      }

      // Use index -1 as sentinel for "attached to avatar"
      const per: Permanents = { ...s.permanents };
      const list = [...(per[at] || [])];
      const updatedPermanent = bumpPermanentVersion({
        ...permanent,
        attachedTo: { at, index: -1 },
      });
      list[permanentIndex] = updatedPermanent;
      per[at] = list;
      get().log(
        `Attached '${permanent.card.name}' to ${avatarKey.toUpperCase()} Avatar`
      );
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: list[permanentIndex].instanceId ?? undefined,
            attachedTo: { at, index: -1 },
            version: list[permanentIndex].version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  // --- Generic counters on permanents --------------------------------------
  addCounterOnPermanent: (at, index) =>
    set((s) => {
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[at] || [])];
      const cur = arr[index];
      if (!cur) return s;
      const nextCount = Math.max(1, Number(cur.counters || 0) + 1);
      const next = bumpPermanentVersion({ ...cur, counters: nextCount });
      arr[index] = next;
      per[at] = arr;
      // Log first-time add vs increment
      const cell = at.split(",");
      const x = Number(cell[0] || 0);
      const y = Number(cell[1] || 0);
      const cellNo = y * s.board.size.w + x + 1;
      get().log(
        `${cur.counters ? "Incremented" : "Added"} counter on '${
          cur.card.name
        }' at #${cellNo} (now ${nextCount})`
      );
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: next.instanceId ?? undefined,
            counters: next.counters,
            version: next.version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  incrementPermanentCounter: (at, index) =>
    set((s) => {
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[at] || [])];
      const cur = arr[index];
      if (!cur) return s;
      const nextCount = Math.max(1, Number(cur.counters || 0) + 1);
      const updated = bumpPermanentVersion({
        ...cur,
        counters: nextCount,
      });
      arr[index] = updated;
      per[at] = arr;
      // Log increment
      {
        const cell = at.split(",");
        const x = Number(cell[0] || 0);
        const y = Number(cell[1] || 0);
        const cellNo = y * s.board.size.w + x + 1;
        get().log(
          `Incremented counter on '${cur.card.name}' at #${cellNo} (now ${nextCount})`
        );
      }
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: updated.instanceId ?? undefined,
            counters: updated.counters,
            version: updated.version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  decrementPermanentCounter: (at, index) =>
    set((s) => {
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[at] || [])];
      const cur = arr[index];
      if (!cur) return s;
      const curCount = Number(cur.counters || 0);
      if (curCount <= 1) {
        // Destroy the counter
        const cleared = { ...cur } as PermanentItem;
        delete (cleared as { counters?: number }).counters;
        const next = bumpPermanentVersion(cleared);
        arr[index] = next;
        per[at] = arr;
        const cell = at.split(",");
        const x = Number(cell[0] || 0);
        const y = Number(cell[1] || 0);
        const cellNo = y * s.board.size.w + x + 1;
        get().log(`Removed counter from '${cur.card.name}' at #${cellNo}`);
        const deltaPatch = createPermanentDeltaPatch([
          {
            at,
            entry: {
              instanceId: next.instanceId ?? undefined,
              counters: null,
              version: next.version,
            },
          },
        ]);
        if (deltaPatch) get().trySendPatch(deltaPatch);
        else get().trySendPatch(createPermanentsPatch(per, at));
      } else {
        const nextCount = curCount - 1;
        const next = bumpPermanentVersion({ ...cur, counters: nextCount });
        arr[index] = next;
        per[at] = arr;
        // Log decrement
        const cell = at.split(",");
        const x = Number(cell[0] || 0);
        const y = Number(cell[1] || 0);
        const cellNo = y * s.board.size.w + x + 1;
        get().log(
          `Decremented counter on '${cur.card.name}' at #${cellNo} (now ${nextCount})`
        );
        const deltaPatch = createPermanentDeltaPatch([
          {
            at,
            entry: {
              instanceId: next.instanceId ?? undefined,
              counters: nextCount,
              version: next.version,
            },
          },
        ]);
        if (deltaPatch) get().trySendPatch(deltaPatch);
        else get().trySendPatch(createPermanentsPatch(per, at));
      }
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  clearPermanentCounter: (at, index) =>
    set((s) => {
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[at] || [])];
      const cur = arr[index];
      if (!cur || cur.counters == null) return s;
      const cleared = { ...cur } as PermanentItem;
      delete (cleared as { counters?: number }).counters;
      const next = bumpPermanentVersion(cleared);
      arr[index] = next;
      per[at] = arr;
      const cell = at.split(",");
      const x = Number(cell[0] || 0);
      const y = Number(cell[1] || 0);
      const cellNo = y * s.board.size.w + x + 1;
      get().log(`Removed counter from '${cur.card.name}' at #${cellNo}`);
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: next.instanceId ?? undefined,
            counters: null,
            version: next.version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  detachToken: (at, index) =>
    set((s) => {
      const token = (s.permanents[at] || [])[index];
      if (!token) return s;
      const per: Permanents = { ...s.permanents };
      const list = [...(per[at] || [])];
      const updated = bumpPermanentVersion({ ...token, attachedTo: null });
      list[index] = updated;
      per[at] = list;
      get().log(`Detached token '${token.card.name}'`);
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: list[index].instanceId ?? undefined,
            attachedTo: null,
            version: list[index].version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  // Derived selectors (no state mutation)
  getPlayerSites: (who) => {
    const s = get();
    const owner = who === "p1" ? 1 : 2;
    return Object.entries(s.board.sites).filter(
      ([, site]) => site.owner === owner
    ) as Array<[CellKey, SiteTile]>;
  },
  getUntappedSitesCount: (who) => {
    const s = get();
    const owner = who === "p1" ? 1 : 2;
    let count = 0;
    for (const site of Object.values(s.board.sites)) {
      if (site.owner === owner && !site.tapped) count++;
    }
    return count;
  },
  getAvailableMana: (who) => {
    const s = get();
    const base = computeAvailableMana(s.board, s.permanents, who);
    const offset = Number(s.players[who]?.mana || 0);
    return Math.max(0, base + offset);
  },
  getThresholdTotals: (who) => {
    const s = get();
    return getCachedThresholdTotals(s, who);
  },

  addLife: (who, delta) =>
    set((s) => {
      const currentLife = s.players[who].life;
      const currentLifeState = s.players[who].lifeState;
      let newLife = currentLife + delta;
      let newLifeState: LifeState = currentLifeState;

      // Sorcery life system rules:
      // - Life is capped at 20
      // - Cannot go below 1 when alive
      // - At 0 life, player goes to DD (Death's Door)
      // - From DD, losing life results in D (Death)

      if (newLife > 20) {
        newLife = 20; // Hard cap at 20
      } else if (newLife <= 0) {
        if (currentLifeState === "alive") {
          newLife = 0;
          newLifeState = "dd"; // Death's Door
        } else if (currentLifeState === "dd") {
          newLife = 0;
          newLifeState = "dead"; // Death
        }
      } else if (newLife > 0 && currentLifeState === "dd") {
        // Recovering from Death's Door
        newLifeState = "alive";
      }

      const newState = {
        players: {
          ...s.players,
          [who]: {
            ...s.players[who],
            life: newLife,
            lifeState: newLifeState,
          },
        },
      };

      // Send patch to other players in multiplayer
      const patch = { players: newState.players };
      get().trySendPatch(patch);

      // Log life changes
      if (currentLife !== newLife) {
        const changeText =
          delta > 0 ? `gains ${delta}` : `loses ${Math.abs(delta)}`;
        get().log(
          `${who.toUpperCase()} ${changeText} life (${currentLife} → ${newLife})`
        );
      }

      // Log state transitions
      if (currentLifeState !== newLifeState) {
        if (newLifeState === "dd") {
          get().log(`${who.toUpperCase()} enters Death's Door!`);
        } else if (newLifeState === "alive" && currentLifeState === "dd") {
          get().log(`${who.toUpperCase()} recovers from Death's Door`);
        } else if (newLifeState === "dead") {
          get().log(`${who.toUpperCase()} has died! Match ended.`);
        }
      }

      // Check for match end after state update
      setTimeout(() => get().checkMatchEnd(), 0);

      return newState;
    }),

  // Manual tie declaration: only when both players are at Death's Door
  tieGame: () =>
    set((s) => {
      const p1 = s.players.p1;
      const p2 = s.players.p2;
      if (s.matchEnded) return s as GameState;
      if (!(p1.lifeState === "dd" && p2.lifeState === "dd")) {
        // Not eligible; ignore
        return s as GameState;
      }
      const nextPlayers = {
        ...s.players,
        p1: { ...p1, life: 0, lifeState: "dead" as LifeState },
        p2: { ...p2, life: 0, lifeState: "dead" as LifeState },
      };
      // Broadcast players update; checkMatchEnd will send matchEnded/winner patch
      get().trySendPatch({ players: nextPlayers });
      get().log("Tie declared: both players have died simultaneously.");
      // Defer match end check to ensure state is updated first
      setTimeout(() => get().checkMatchEnd(), 0);
      return { players: nextPlayers } as Partial<GameState> as GameState;
    }),

  addMana: (who, delta) =>
    set((s) => {
      const current = Number(s.players[who]?.mana || 0);
      const next = current + delta;
      if (next === current) return s as GameState;

      const newState = {
        players: {
          ...s.players,
          [who]: {
            ...s.players[who],
            mana: next,
          },
        },
      } as Partial<GameState> as GameState;

      const patch: ServerPatchT = { players: newState.players };
      get().trySendPatch(patch);

      return newState;
    }),

  addThreshold: (who, element, delta) =>
    set((s) => {
      const currentThreshold = s.players[who].thresholds[element];
      const newThreshold = Math.max(0, currentThreshold + delta);

      const newState = {
        players: {
          ...s.players,
          [who]: {
            ...s.players[who],
            thresholds: {
              ...s.players[who].thresholds,
              [element]: newThreshold,
            },
          },
        },
      };

      // Send patch to other players in multiplayer
      const patch = { players: newState.players };
      get().trySendPatch(patch);

      // Log threshold changes
      if (currentThreshold !== newThreshold) {
        const changeText = delta > 0 ? `gains` : `loses`;
        const elementEmoji =
          element === "fire"
            ? "🔥"
            : element === "water"
            ? "💧"
            : element === "earth"
            ? "🌍"
            : "💨";
        get().log(
          `${who.toUpperCase()} ${changeText} ${Math.abs(
            delta
          )} ${elementEmoji} ${element} threshold (${currentThreshold} → ${newThreshold})`
        );
      }

      return newState;
    }),

  nextPhase: () => {
    const s = get();
    get().pushHistory();
    const idx = phases.indexOf(s.phase);
    const nextIdx = (idx + 1) % phases.length;
    const nextPhase = phases[nextIdx];
    const passTurn = nextPhase === "Start"; // wrapped around
    // On new turn start: untap next player's permanents and clear selection
    if (passTurn) {
      const nextPlayer = s.currentPlayer === 1 ? 2 : 1;
      const nextTurn = s.turn + 1;
      // Sites do not tap in Sorcery
      // Untap all permanents owned by the next player and collect deltas
      const permanents: Permanents = { ...s.permanents };
      const updates: PermanentDeltaUpdate[] = [];
      for (const cellKey of Object.keys(permanents)) {
        const cellPermanents = permanents[cellKey] || [];
        const arr = [...cellPermanents];
        let changed = false;
        for (let i = 0; i < arr.length; i++) {
          const cur = arr[i];
          if (!cur) continue;
          if (cur.owner !== nextPlayer) continue;
          if (cur.tapped) {
            const next = bumpPermanentVersion({ ...cur, tapped: false });
            arr[i] = next;
            updates.push({
              at: cellKey as CellKey,
              entry: {
                instanceId: next.instanceId ?? undefined,
                tapped: false,
                tapVersion: next.tapVersion,
                version: next.version,
              },
            });
            changed = true;
          }
        }
        if (changed) permanents[cellKey] = arr;
      }

      // Untap the next player's avatar locally
      const nextKey = (nextPlayer === 1 ? "p1" : "p2") as PlayerKey;
      const avatarsNext = {
        ...s.avatars,
        [nextKey]: { ...s.avatars[nextKey], tapped: false },
      } as GameState["avatars"];

      // Send authoritative patch for phase/turn and tapped=false deltas
      {
        const base: ServerPatchT = { phase: nextPhase, currentPlayer: nextPlayer, turn: nextTurn };
        const deltaPatch = updates.length > 0 ? createPermanentDeltaPatch(updates) : undefined;
        const patch: ServerPatchT = deltaPatch ? { ...deltaPatch, ...base } : base;
        get().trySendPatch(patch);
      }
      set({
        phase: nextPhase,
        currentPlayer: nextPlayer,
        turn: nextTurn,
        permanents,
        avatars: avatarsNext,
        selectedCard: null,
      });
      try {
        get().clearAllDamageForSeat(nextKey);
      } catch {}
      get().log(`Turn passes to P${nextPlayer}`);
      // Schedule auto-snapshot for new turn start (offline fallback and echo-safe)
      try {
        const snapshotTurn = nextTurn;
        const snapshotCP = nextPlayer;
        setTimeout(() => {
          try {
            const st = get();
            const hasForTurn = Array.isArray(st.snapshots) && st.snapshots.some((ss) => ss.kind === "auto" && ss.turn === snapshotTurn);
            if (!hasForTurn && st.phase !== "Setup") {
              st.createSnapshot(`Turn ${snapshotTurn} start (P${snapshotCP})`, "auto");
            }
          } catch {}
        }, 0);
      } catch {}
    } else {
      {
        const patch: ServerPatchT = { phase: nextPhase };
        get().trySendPatch(patch);
      }
      set({ phase: nextPhase });
    }
  },

  // End the current player's turn and advance to the next player's Main phase.
  // Note: No automatic draw; drawing is manual via drawFrom.
  endTurn: () => {
    const s = get();
    if (s.matchEnded) {
      console.debug("[game] endTurn ignored after match ended");
      return;
    }
    get().pushHistory();
    const cur = s.currentPlayer;
    get().log(`P${cur} ends the turn`);
    const nextPlayer = cur === 1 ? 2 : 1;
    const nextTurn = s.turn + 1;

    // Untap all permanents owned by the next player and collect deltas
    const permanents: Permanents = { ...s.permanents };
    const updates: PermanentDeltaUpdate[] = [];
    for (const cellKey of Object.keys(permanents)) {
      const cellPermanents = permanents[cellKey] || [];
      const arr = [...cellPermanents];
      let changed = false;
      for (let i = 0; i < arr.length; i++) {
        const cur = arr[i];
        if (!cur) continue;
        if (cur.owner !== nextPlayer) continue;
        if (cur.tapped) {
          const next = bumpPermanentVersion({ ...cur, tapped: false });
          arr[i] = next;
          updates.push({
            at: cellKey as CellKey,
            entry: {
              instanceId: next.instanceId ?? undefined,
              tapped: false,
              tapVersion: next.tapVersion,
              version: next.version,
            },
          });
          changed = true;
        }
      }
      if (changed) permanents[cellKey] = arr;
    }

    // Untap the next player's avatar
    const nextKey = (nextPlayer === 1 ? "p1" : "p2") as PlayerKey;
    const avatarsNext = {
      ...s.avatars,
      [nextKey]: { ...s.avatars[nextKey], tapped: false },
    } as GameState["avatars"];

    // Send authoritative patch (phase/turn and tapped=false deltas)
    {
      const base: ServerPatchT = { phase: "Main", currentPlayer: nextPlayer, turn: nextTurn };
      const deltaPatch = updates.length > 0 ? createPermanentDeltaPatch(updates) : undefined;
      const patch: ServerPatchT = deltaPatch ? { ...deltaPatch, ...base } : base;
      get().trySendPatch(patch);
    }
    set({
      phase: "Main",
      currentPlayer: nextPlayer,
      turn: nextTurn,
      permanents,
      avatars: avatarsNext,
      selectedCard: null,
      selectedPermanent: null,
    });
    try {
      const nextKey = (nextPlayer === 1 ? "p1" : "p2") as PlayerKey;
      get().clearAllDamageForSeat(nextKey);
    } catch {}

    // Schedule auto-snapshot for the beginning of the new player's turn
    try {
      const snapshotTurn = nextTurn;
      const snapshotCP = nextPlayer;
      setTimeout(() => {
        try {
          const st = get();
          const hasForTurn = Array.isArray(st.snapshots) && st.snapshots.some((ss) => ss.kind === "auto" && ss.turn === snapshotTurn);
          if (!hasForTurn && st.phase !== "Setup") {
            st.createSnapshot(`Turn ${snapshotTurn} start (P${snapshotCP})`, "auto");
          }
        } catch {}
      }, 0);
    } catch {}
    get().log(`Turn passes to P${nextPlayer}`);
  },

  // D20 Setup phase functions
  rollD20: (who) => {
    const roll = Math.floor(Math.random() * 20) + 1;
    const s = get();
    const newRolls = { ...s.d20Rolls, [who]: roll };

    // Check if both players have rolled
    if (newRolls.p1 !== null && newRolls.p2 !== null) {
      let winner: PlayerKey | null = null;
      if (newRolls.p1 > newRolls.p2) {
        winner = "p1";
      } else if (newRolls.p2 > newRolls.p1) {
        winner = "p2";
      }
      // If tie, notify server with the tie rolls; server will broadcast a reset
      if (newRolls.p1 === newRolls.p2) {
        get().log(`Both players rolled ${newRolls.p1}! Rolling again...`);
        const tiePatch: ServerPatchT = {
          d20Rolls: newRolls,
          // setupWinner intentionally omitted for server-side tie handling
        };
        get().trySendPatch(tiePatch);
        // Optimistically reflect both rolls locally; server will immediately reset to nulls
        set({ d20Rolls: newRolls, setupWinner: null });
        return;
      }

      const patch: ServerPatchT = {
        d20Rolls: newRolls,
        setupWinner: winner,
      };
      get().trySendPatch(patch);
      set({ d20Rolls: newRolls, setupWinner: winner });
      get().log(
        `Player ${newRolls.p1 > newRolls.p2 ? "1" : "2"} wins the roll (${
          newRolls.p1 > newRolls.p2 ? newRolls.p1 : newRolls.p2
        } vs ${newRolls.p1 > newRolls.p2 ? newRolls.p2 : newRolls.p1})!`
      );
    } else {
      const patch: ServerPatchT = { d20Rolls: newRolls };
      get().trySendPatch(patch);
      set({ d20Rolls: newRolls });
      get().log(`Player ${who === "p1" ? "1" : "2"} rolled a ${roll}`);
    }
  },

  choosePlayerOrder: (winner, wantsToGoFirst) => {
    const firstPlayer = wantsToGoFirst
      ? winner === "p1"
        ? 1
        : 2
      : winner === "p1"
      ? 2
      : 1;

    const patch: ServerPatchT = {
      phase: "Start",
      currentPlayer: firstPlayer,
    };
    get().trySendPatch(patch);
    set({ phase: "Start", currentPlayer: firstPlayer });

    const winnerNum = winner === "p1" ? 1 : 2;
    const choiceText = wantsToGoFirst ? "goes first" : "goes second";
    get().log(
      `Player ${winnerNum} chooses to ${choiceText}. Player ${firstPlayer} starts!`
    );
  },

  toggleGridOverlay: () =>
    set((s) => ({ showGridOverlay: !s.showGridOverlay })),
  togglePlaymat: () => set((s) => ({ showPlaymat: !s.showPlaymat })),
  setCameraMode: (mode) => set({ cameraMode: mode }),
  toggleCameraMode: () =>
    set((s) => ({
      cameraMode: s.cameraMode === "orbit" ? "topdown" : "orbit",
    })),

  toggleTapSite: (x, y) =>
    set((s) => {
      void x;
      void y;
      // Sites do not tap in Sorcery
      get().log("Sites do not tap.");
      return s as GameState;
    }),

  initLibraries: (who, spellbook, atlas) =>
    set((s) => {
      const mapForSeat = (cards: CardRef[]) =>
        cards.map((card) => prepareCardForSeat(card, who));
      const sub: Zones = {
        ...s.zones[who],
        spellbook: mapForSeat(spellbook as CardRef[]),
        atlas: mapForSeat(atlas as CardRef[]),
        hand: [],
        graveyard: [],
        battlefield: [],
        banished: [],
      };
      const zonesNext = { ...s.zones, [who]: sub } as GameState["zones"];
      {
        const tr = get().transport;
        if (tr) {
          const zonePatch = createZonesPatchFor(zonesNext, who);
          if (zonePatch) {
            get().trySendPatch(zonePatch);
          }
        }
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  shuffleSpellbook: (who) =>
    set((s) => {
      const pile = [...s.zones[who].spellbook].map((card) =>
        prepareCardForSeat(card, who)
      );
      for (let i = pile.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pile[i], pile[j]] = [pile[j], pile[i]];
      }
      get().log(`${who.toUpperCase()} shuffles Spellbook (${pile.length})`);
      const zonesNext = {
        ...s.zones,
        [who]: { ...s.zones[who], spellbook: pile },
      } as GameState["zones"];
      {
        const tr = get().transport;
        if (tr) {
          const zonePatch = createZonesPatchFor(zonesNext, who);
          if (zonePatch) {
            get().trySendPatch(zonePatch);
          }
        }
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  shuffleAtlas: (who) =>
    set((s) => {
      const pile = [...s.zones[who].atlas].map((card) =>
        prepareCardForSeat(card, who)
      );
      for (let i = pile.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pile[i], pile[j]] = [pile[j], pile[i]];
      }
      get().log(`${who.toUpperCase()} shuffles Atlas (${pile.length})`);
      const zonesNext = {
        ...s.zones,
        [who]: { ...s.zones[who], atlas: pile },
      } as GameState["zones"];
      {
        const tr = get().transport;
        if (tr) {
          const zonePatch = createZonesPatchFor(zonesNext, who);
          if (zonePatch) {
            get().trySendPatch(zonePatch);
          }
        }
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  drawFrom: (who, from, count = 1) =>
    set((s) => {
      // Enforce simple rule: only current player may draw during Draw/Main
      const isCurrent = (who === "p1" ? 1 : 2) === s.currentPlayer;
      if (!isCurrent || (s.phase !== "Draw" && s.phase !== "Main")) return s;

      get().pushHistory();

      const pile =
        from === "spellbook"
          ? [...s.zones[who].spellbook].map((card) =>
              prepareCardForSeat(card, who)
            )
          : [...s.zones[who].atlas].map((card) =>
              prepareCardForSeat(card, who)
            );
      const hand = [...s.zones[who].hand];
      for (let i = 0; i < count; i++) {
        const c = pile.shift();
        if (!c) break;
        hand.push(prepareCardForSeat(c, who));
      }
      const updated =
        from === "spellbook" ? { spellbook: pile } : { atlas: pile };
      get().log(`${who.toUpperCase()} draws ${count} from ${from}`);

      const zonesNext = {
        ...s.zones,
        [who]: { ...s.zones[who], ...updated, hand },
      } as GameState["zones"];

      {
        const tr = get().transport;
        if (tr) {
          const zonePatch = createZonesPatchFor(zonesNext, who);
          if (zonePatch) {
            get().trySendPatch(zonePatch);
          }
        }
      }

      return {
        zones: zonesNext,
      } as Partial<GameState> as GameState;
    }),

  // Draw from the BOTTOM of a pile (useful for effects that place cards on bottom)
  drawFromBottom: (who: PlayerKey, from: "spellbook" | "atlas", count = 1) =>
    set((s) => {
      // Only allow draws by the current player during Draw/Main (same rule as drawFrom)
      const isCurrent = (who === "p1" ? 1 : 2) === s.currentPlayer;
      if (!isCurrent || (s.phase !== "Draw" && s.phase !== "Main")) return s;

      get().pushHistory();

      const pile =
        from === "spellbook"
          ? [...s.zones[who].spellbook].map((card) =>
              prepareCardForSeat(card, who)
            )
          : [...s.zones[who].atlas].map((card) =>
              prepareCardForSeat(card, who)
            );
      const hand = [...s.zones[who].hand];

      for (let i = 0; i < count; i++) {
        const c = pile.pop();
        if (!c) break;
        hand.push(prepareCardForSeat(c, who));
      }

      const updated =
        from === "spellbook" ? { spellbook: pile } : { atlas: pile };
      get().log(`${who.toUpperCase()} draws ${count} from bottom of ${from}`);

      const seatZones = { ...s.zones[who], ...updated, hand } as Zones;
      const zonesNext = {
        ...s.zones,
        [who]: seatZones,
      } as GameState["zones"];

      {
        const tr = get().transport;
        if (tr) {
          const zonePatch = createZonesPatchFor(zonesNext, who);
          if (zonePatch) {
            get().trySendPatch(zonePatch);
          }
        }
      }

      return {
        zones: zonesNext,
      } as Partial<GameState> as GameState;
    }),

  scryTop: (
    who: PlayerKey,
    from: "spellbook" | "atlas",
    decision: "top" | "bottom"
  ) =>
    set((s) => {
      const secondSeat: PlayerKey = s.currentPlayer === 1 ? "p2" : "p1";
      if (who !== secondSeat) return s as GameState;
      if (s.phase !== "Start") return s as GameState;
      const pile = from === "spellbook" ? [...s.zones[who].spellbook] : [...s.zones[who].atlas];
      if (pile.length === 0) return s as GameState;
      const top = pile[0];
      let nextPile = pile;
      if (decision === "bottom" && top) {
        nextPile = pile.slice(1);
        nextPile.push(prepareCardForSeat(top, who));
      }
      const zonesNext = {
        ...s.zones,
        [who]: {
          ...s.zones[who],
          ...(from === "spellbook" ? { spellbook: nextPile } : { atlas: nextPile }),
        },
      } as GameState["zones"]; 
      get().log(
        `${who.toUpperCase()} scries ${from} (${decision === "bottom" ? "bottom" : "top"}${top?.name ? ": " + top.name : ""})`
      );
      {
        const tr = get().transport;
        if (tr) {
          const zonePatch = createZonesPatchFor(zonesNext, who);
          if (zonePatch) get().trySendPatch(zonePatch);
        }
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  drawOpening: (who, spellbookCount?: number, atlasCount?: number) =>
    set((s) => {
      get().pushHistory();

      const avatarName = (s.avatars[who]?.card?.name || "").toLowerCase();
      const isSpellslinger = avatarName === "spellslinger";
      const isPathfinder = avatarName === "pathfinder";
      const sbCount = spellbookCount ?? (isSpellslinger ? 4 : 3);
      const atCount = atlasCount ?? (isPathfinder ? 0 : 3);
      const sb = [...s.zones[who].spellbook];
      const at = [...s.zones[who].atlas];
      const hand = [...s.zones[who].hand];
      for (let i = 0; i < sbCount; i++) {
        const c = sb.shift();
        if (!c) break;
        hand.push(prepareCardForSeat(c, who));
      }
      for (let i = 0; i < atCount; i++) {
        const c = at.shift();
        if (!c) break;
        hand.push(prepareCardForSeat(c, who));
      }
      get().log(
        `${who.toUpperCase()} draws opening hand (${sbCount} SB + ${atCount} AT)`
      );
      const zonesNext = {
        ...s.zones,
        [who]: { ...s.zones[who], spellbook: sb, atlas: at, hand },
      } as GameState["zones"];
      {
        const tr = get().transport;
        if (tr) {
          const zonePatch = createZonesPatchFor(zonesNext, who);
          if (zonePatch) {
            get().trySendPatch(zonePatch);
          }
        }
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  selectHandCard: (who, index) =>
    set((s) => {
      const card = s.zones[who].hand[index];
      if (!card) return s;
      return {
        selectedCard: { who, index, card },
        selectedPermanent: null,
        selectedAvatar: null,
        previewCard: null,
      };
    }),

  selectAvatar: (who) =>
    set({
      selectedAvatar: who,
      selectedCard: null,
      selectedPermanent: null,
      previewCard: null,
    }),

  clearSelection: () =>
    set({ selectedCard: null, selectedPermanent: null, selectedAvatar: null }),
  // Hand visibility setters
  setMouseInHandZone: (inZone) => set({ mouseInHandZone: inZone }),
  setHandHoverCount: (count) => set({ handHoverCount: count }),

  playSelectedTo: (x, y) =>
    set((s) => {
      const sel = s.selectedCard;
      if (!sel) {
        get().log("No selected card to play");
        return s;
      }
      const { who, index, card } = sel;
      const typeEarly = (card.type || "").toLowerCase();
      const isCurrent = (who === "p1" ? 1 : 2) === s.currentPlayer;
      // Allow a single out-of-turn play if we have an approved 'instantSpell' grant
      let consumeInstantId: string | null = null;
      const allowInstant =
        !isCurrent && !!s.transport && (() => {
          const myId = s.localPlayerId;
          for (const [rid, entry] of Object.entries(s.interactionLog)) {
            if (!entry || entry.status !== "approved") continue;
            if (entry.request.kind !== "instantSpell") continue;
            const g = entry.grant;
            if (!g) continue;
            const isMe = myId ? g.grantedTo === myId : entry.direction === "outbound";
            if (!isMe) continue;
            const exp = typeof g.expiresAt === "number" ? g.expiresAt : null;
            if (exp !== null && exp <= Date.now()) continue;
            if (g.singleUse) consumeInstantId = rid;
            return true;
          }
          return false;
        })();
      if (!isCurrent && !allowInstant && !typeEarly.includes("token")) {
        get().log(
          `Cannot play '${
            card.name
          }': ${who.toUpperCase()} is not the current player`
        );
        return s;
      }
      const type = typeEarly;
      // For non-site cards only: warn if thresholds are missing. Sites never cost thresholds.
      if (!type.includes("site")) {
        const req = (card.thresholds || {}) as Partial<
          Record<keyof Thresholds, number>
        >;
        const have = computeThresholdTotals(s.board, s.permanents, who);
        const miss: string[] = [];
        for (const kk of Object.keys(req) as (keyof Thresholds)[]) {
          const need = Number(req[kk] ?? 0);
          const haveVal = Number(have[kk] ?? 0);
          if (need > haveVal) {
            miss.push(`${kk} ${need - haveVal}`);
          }
        }
        if (miss.length)
          get().log(
            `[Warning] '${card.name}' missing thresholds (${miss.join(", ")})`
          );
      }

      // Only non-sites restricted to Main phase; tokens are exempt
      if (
        !type.includes("site") &&
        !type.includes("token") &&
        s.phase !== "Main" &&
        !allowInstant
      ) {
        get().log(`Cannot play '${card.name}' during ${s.phase} phase`);
        return s;
      }

      get().pushHistory();

      // Remove from hand
      const hand = [...s.zones[who].hand];
      hand.splice(index, 1);

      const key: CellKey = `${x},${y}`;
      const cellNo = y * s.board.size.w + x + 1;

      // Check if this is a rubble token that should behave like a site
      const isRubble =
        type.includes("token") &&
        TOKEN_BY_NAME[(card.name || "").toLowerCase()]?.siteReplacement;

      if (type.includes("site")) {
        if (s.board.sites[key]) {
          get().log(
            `Cannot play site '${card.name}': #${cellNo} already occupied`
          );
          return s; // occupied
        }
        const sites = {
          ...s.board.sites,
          [key]: { owner: (who === "p1" ? 1 : 2) as 1 | 2, tapped: false, card },
        };
        get().log(
          `${who.toUpperCase()} plays site '${card.name}' at #${cellNo}`
        );
        {
          const tr = get().transport;
          if (tr) {
            const zonesNext = {
              ...s.zones,
              [who]: { ...s.zones[who], hand },
            } as GameState["zones"];
            const zonePatch = createZonesPatchFor(zonesNext, who);
            const patch: ServerPatchT = {
              ...(zonePatch && zonePatch.zones ? { zones: zonePatch.zones } : {}),
              board: { ...s.board, sites } as GameState["board"],
            };
            get().trySendPatch(patch);
          }
        }
        if (!s.avatars[who]?.tapped) {
          try {
            get().toggleTapAvatar(who);
          } catch {}
        }
        // Consume single-use instant permission if present
        let nextInteractionLog: GameState["interactionLog"] | undefined;
        if (consumeInstantId) {
          nextInteractionLog = { ...(s.interactionLog as GameState["interactionLog"]) };
          const e0 = nextInteractionLog[consumeInstantId];
          if (e0) nextInteractionLog[consumeInstantId] = { ...e0, status: "expired", updatedAt: Date.now() } as typeof e0;
        }
        return {
          zones: { ...s.zones, [who]: { ...s.zones[who], hand } },
          board: { ...s.board, sites },
          selectedCard: null,
          selectedPermanent: null,
          ...(nextInteractionLog ? { interactionLog: nextInteractionLog } : {}),
        } as Partial<GameState> as GameState;
      }

      // Rubble token validation: should only be placed on empty tiles (like sites)
      if (isRubble) {
        if (s.board.sites[key]) {
          get().log(
            `Cannot place token '${card.name}': #${cellNo} already occupied`
          );
          return s; // occupied
        }
      }

      // Non-site permanent: place on tile
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[key] || [])];
      const cardWithId = ensureCardInstanceId(card);
      arr.push({
        owner: (who === "p1" ? 1 : 2) as 1 | 2,
        card: cardWithId,
        offset: null,
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId:
          cardWithId.instanceId ?? newPermanentInstanceId(),
      });
      per[key] = arr;
      get().log(`${who.toUpperCase()} plays '${card.name}' at #${cellNo}`);
      const zonesNext = {
        ...s.zones,
        [who]: { ...s.zones[who], hand },
      } as GameState["zones"];

      {
        const newest = arr[arr.length - 1];
        const deltaPatch = newest
          ? createPermanentDeltaPatch([
              {
                at: key,
                entry: { ...(newest as PermanentItem) },
              },
            ])
          : null;
        const fallbackPatch = deltaPatch
          ? null
          : createPermanentsPatch(per, key);
        const zonePatch = createZonesPatchFor(zonesNext, who);
        const combined: ServerPatchT = {};
        if (deltaPatch) {
          Object.assign(combined, deltaPatch);
        } else if (fallbackPatch?.permanents) {
          combined.permanents = fallbackPatch.permanents;
        }
        if (zonePatch?.zones) {
          combined.zones = zonePatch.zones;
        }
        if (Object.keys(combined).length > 0) {
          get().trySendPatch(combined);
        }
      }

      // Consume single-use instant permission if present
      let nextInteractionLog: GameState["interactionLog"] | undefined;
      if (consumeInstantId) {
        nextInteractionLog = { ...(s.interactionLog as GameState["interactionLog"]) };
        const e0 = nextInteractionLog[consumeInstantId];
        if (e0) nextInteractionLog[consumeInstantId] = { ...e0, status: "expired", updatedAt: Date.now() } as typeof e0;
      }
      return {
        zones: zonesNext,
        permanents: per,
        selectedCard: null,
        selectedPermanent: null,
        ...(nextInteractionLog ? { interactionLog: nextInteractionLog } : {}),
      } as Partial<GameState> as GameState;
    }),

  // Play a card that is being dragged from a pile (spellbook, atlas, graveyard, or tokens)
  playFromPileTo: (x, y) =>
    set((s) => {
      const info = s.dragFromPile;
      if (!info || !info.card) return s;
      const who = info.who;
      const from = info.from;
      const card = info.card;
      const type = (card.type || "").toLowerCase();
      // Owner-only pile plays when online (tokens excluded)
      if (
        from !== "tokens" &&
        s.transport &&
        s.actorKey &&
        s.actorKey !== who
      ) {
        get().log(`Cannot play from opponent's ${from}`);
        return {
          dragFromPile: null,
          dragFromHand: false,
        } as Partial<GameState> as GameState;
      }
      const isCurrent = (who === "p1" ? 1 : 2) === s.currentPlayer;
      // Allow a single out-of-turn play if we have an approved 'instantSpell' grant
      let consumeInstantId: string | null = null;
      const allowInstant =
        !isCurrent && !!s.transport && (() => {
          const myId = s.localPlayerId;
          for (const [rid, entry] of Object.entries(s.interactionLog)) {
            if (!entry || entry.status !== "approved") continue;
            if (entry.request.kind !== "instantSpell") continue;
            const g = entry.grant;
            if (!g) continue;
            const isMe = myId ? g.grantedTo === myId : entry.direction === "outbound";
            if (!isMe) continue;
            const exp = typeof g.expiresAt === "number" ? g.expiresAt : null;
            if (exp !== null && exp <= Date.now()) continue;
            if (g.singleUse) consumeInstantId = rid;
            return true;
          }
          return false;
        })();
      if (!isCurrent && !allowInstant && !type.includes("token")) {
        get().log(
          `Cannot play '${
            card.name
          }' from ${from}: ${who.toUpperCase()} is not the current player`
        );
        return {
          dragFromPile: null,
          dragFromHand: false,
        } as Partial<GameState> as GameState;
      }

      // Sites can be played any phase; other cards only during Main (tokens are exempt)
      if (
        !type.includes("site") &&
        !type.includes("token") &&
        s.phase !== "Main" &&
        !allowInstant
      ) {
        get().log(
          `Cannot play '${card.name}' from ${from} during ${s.phase} phase`
        );
        return {
          dragFromPile: null,
          dragFromHand: false,
        } as Partial<GameState> as GameState;
      }

      get().pushHistory();
      // Remove from zones for real piles; tokens are virtual and not in zones
      const z = { ...s.zones[who] };
      let pileName: keyof Zones | null = null;
      let pile: CardRef[] = [];
      if (from !== "tokens") {
        pileName = from as keyof Zones;
        pile = [...(z[pileName] as CardRef[])];
        let removedIndex = pile.findIndex((c) => c === card);
        if (removedIndex < 0) {
          removedIndex = pile.findIndex(
            (c) =>
              c.cardId === card.cardId &&
              c.variantId === card.variantId &&
              c.name === card.name
          );
        }
        if (removedIndex < 0) {
          get().log(`Card to play from ${from} was not found`);
          return {
            dragFromPile: null,
            dragFromHand: false,
          } as Partial<GameState> as GameState;
        }
        const removed = pile.splice(removedIndex, 1)[0];
        if (!removed) {
          get().log(`Card to play from ${from} was not found`);
          return {
            dragFromPile: null,
            dragFromHand: false,
          } as Partial<GameState> as GameState;
        }
      }

      const key: CellKey = `${x},${y}`;
      const cellNo = y * s.board.size.w + x + 1;

      // Check if this is a rubble token that should behave like a site
      const isRubble =
        type.includes("token") &&
        TOKEN_BY_NAME[(card.name || "").toLowerCase()]?.siteReplacement;

      if (type.includes("site")) {
        if (s.board.sites[key]) {
          get().log(
            `Cannot play site '${card.name}': #${cellNo} already occupied`
          );
          return {
            dragFromPile: null,
            dragFromHand: false,
          } as Partial<GameState> as GameState;
        }
        const ensuredSiteCard = ensureCardInstanceId(card);
        const sites = {
          ...s.board.sites,
          [key]: {
            owner: (who === "p1" ? 1 : 2) as 1 | 2,
            tapped: false,
            card: prepareCardForSeat(ensuredSiteCard, who),
          },
        };
        get().log(
          `${who.toUpperCase()} plays site '${
            card.name
          }' from ${from} at #${cellNo}`
        );
        {
          const tr = get().transport;
          if (tr) {
            const boardNext = { ...s.board, sites } as GameState["board"];
            const zonesAfter = pileName
              ? ({
                  ...s.zones,
                  [who]: { ...z, [pileName]: pile },
                } as GameState["zones"])
              : s.zones;
            const zonePatch = pileName
              ? createZonesPatchFor(zonesAfter, who)
              : null;
            const combined: ServerPatchT = zonePatch?.zones
              ? { board: boardNext, zones: zonePatch.zones }
              : { board: boardNext };
            get().trySendPatch(combined);
          }
        }
        if (!s.avatars[who]?.tapped) {
          try {
            get().toggleTapAvatar(who);
          } catch {}
        }
        // Consume single-use instant permission if present
        let nextInteractionLog: GameState["interactionLog"] | undefined;
        if (consumeInstantId) {
          nextInteractionLog = { ...(s.interactionLog as GameState["interactionLog"]) };
          const e0 = nextInteractionLog[consumeInstantId];
          if (e0) nextInteractionLog[consumeInstantId] = { ...e0, status: "expired", updatedAt: Date.now() } as typeof e0;
        }
        return {
          zones: pileName
            ? ({
                ...s.zones,
                [who]: { ...z, [pileName]: pile },
              } as GameState["zones"])
            : s.zones,
          board: { ...s.board, sites },
          dragFromPile: null,
          dragFromHand: false,
          ...(nextInteractionLog ? { interactionLog: nextInteractionLog } : {}),
        } as Partial<GameState> as GameState;
      }

      // Rubble token validation: should only be placed on empty tiles (like sites)
      if (isRubble) {
        if (s.board.sites[key]) {
          get().log(
            `Cannot place token '${card.name}': #${cellNo} already occupied`
          );
          return {
            dragFromPile: null,
            dragFromHand: false,
          } as Partial<GameState> as GameState;
        }
      }

      // Non-site
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[key] || [])];
      const cardWithId = prepareCardForSeat(card, who);
      arr.push({
        owner: (who === "p1" ? 1 : 2) as 1 | 2,
        card: cardWithId,
        offset: null,
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId:
          cardWithId.instanceId ?? newPermanentInstanceId(),
      });
      per[key] = arr;
      get().log(
        `${who.toUpperCase()} plays '${card.name}' from ${from} at #${cellNo}`
      );
      const zonesNext =
        from !== "tokens"
          ? ({
              ...s.zones,
              [who]: { ...z, [pileName as keyof Zones]: pile },
            } as GameState["zones"])
          : null;

      {
        const newest = arr[arr.length - 1];
        const deltaPatch = newest
          ? createPermanentDeltaPatch([
              {
                at: key,
                entry: { ...(newest as PermanentItem) },
              },
            ])
          : null;
        const fallbackPatch = deltaPatch
          ? null
          : createPermanentsPatch(per, key);
        const zonePatch = zonesNext
          ? createZonesPatchFor(zonesNext, who)
          : null;
        const combined: ServerPatchT = {};
        if (deltaPatch) {
          Object.assign(combined, deltaPatch);
        } else if (fallbackPatch?.permanents) {
          combined.permanents = fallbackPatch.permanents;
        }
        if (zonePatch?.zones) {
          combined.zones = zonePatch.zones;
        }
        if (Object.keys(combined).length > 0) {
          get().trySendPatch(combined);
        }
      }

      // Consume single-use instant permission if present
      let nextInteractionLog: GameState["interactionLog"] | undefined;
      if (consumeInstantId) {
        nextInteractionLog = { ...(s.interactionLog as GameState["interactionLog"]) };
        const e0 = nextInteractionLog[consumeInstantId];
        if (e0) nextInteractionLog[consumeInstantId] = { ...e0, status: "expired", updatedAt: Date.now() } as typeof e0;
      }
      return {
        zones: zonesNext ?? s.zones,
        permanents: per,
        dragFromPile: null,
        dragFromHand: false,
        ...(nextInteractionLog ? { interactionLog: nextInteractionLog } : {}),
      } as Partial<GameState> as GameState;
    }),

  // Draw a card from a pile to hand
  drawFromPileToHand: () =>
    set((s) => {
      const info = s.dragFromPile;
      if (!info || !info.card) return s;
      const who = info.who;
      const from = info.from;
      const card = info.card;
      // Owner-only pile draws when online
      if (s.transport && s.actorKey && s.actorKey !== who) {
        get().log(`Cannot draw from opponent's ${from}`);
        return { dragFromPile: null } as Partial<GameState> as GameState;
      }
      const isCurrent = (who === "p1" ? 1 : 2) === s.currentPlayer;
      if (!isCurrent) {
        get().log(
          `Cannot draw '${
            card.name
          }' from ${from}: ${who.toUpperCase()} is not the current player`
        );
        return { dragFromPile: null } as Partial<GameState> as GameState;
      }

      get().pushHistory();

      // Remove the card from the corresponding pile
      const z = { ...s.zones[who] };
      const pileName = from as keyof Zones;
      const pile = [...(z[pileName] as CardRef[])].map((card) =>
        prepareCardForSeat(card, who)
      );
      let removedIndex = pile.findIndex((c) => c === card);
      if (removedIndex < 0) {
        removedIndex = pile.findIndex(
          (c) =>
            c.cardId === card.cardId &&
            c.variantId === card.variantId &&
            c.name === card.name
        );
      }
      if (removedIndex < 0) {
        get().log(`Card to draw from ${from} was not found`);
        return { dragFromPile: null } as Partial<GameState> as GameState;
      }
      const removed = pile.splice(removedIndex, 1)[0];
      if (!removed) {
        get().log(`Card to draw from ${from} was not found`);
        return { dragFromPile: null } as Partial<GameState> as GameState;
      }

      // Add the card to hand
      const ensured = prepareCardForSeat(removed, who);
      const hand = [...z.hand, ensured];
      get().log(
        `${who.toUpperCase()} draws '${card.name}' from ${from} to hand`
      );

      const zonesNext = {
        ...s.zones,
        [who]: { ...z, [pileName]: pile, hand },
      } as GameState["zones"];

      {
        const tr = get().transport;
        if (tr) {
          const zonePatch = createZonesPatchFor(zonesNext, who);
          if (zonePatch) {
            get().trySendPatch(zonePatch);
          }
        }
      }

      return {
        zones: zonesNext,
        dragFromPile: null,
      } as Partial<GameState> as GameState;
    }),

  // Move a card from hand to a pile (spellbook or atlas)
  moveCardFromHandToPile: (who, pile, position) =>
    set((s) => {
      const selectedCard = s.selectedCard;
      if (!selectedCard || selectedCard.who !== who) return s;

      const isCurrent = (who === "p1" ? 1 : 2) === s.currentPlayer;
      if (!isCurrent) {
        get().log(
          `Cannot move card to ${pile}: ${who.toUpperCase()} is not the current player`
        );
        return s;
      }

      get().pushHistory();

      const zones = { ...s.zones[who] };
      const hand = [...zones.hand];
      const targetPile = [...(zones[pile] as CardRef[])].map((card) =>
        prepareCardForSeat(card, who)
      );

      // Remove card from hand
      const cardToMove = hand.splice(selectedCard.index, 1)[0];
      if (!cardToMove) {
        get().log(`Card at index ${selectedCard.index} not found in hand`);
        return s;
      }
      const ensuredCard = prepareCardForSeat(cardToMove, who);

      // Add to pile at specified position
      if (position === "top") {
        targetPile.unshift(ensuredCard);
      } else {
        targetPile.push(ensuredCard);
      }

      get().log(
        `${who.toUpperCase()} moves '${
          ensuredCard.name
        }' from hand to ${position} of ${pile}`
      );

      const zonesNext = {
        ...s.zones,
        [who]: { ...zones, hand, [pile]: targetPile },
      } as GameState["zones"];

      {
        const tr = get().transport;
        if (tr) {
          const zonePatch = createZonesPatchFor(zonesNext, who);
          if (zonePatch) {
            get().trySendPatch(zonePatch);
          }
        }
      }

      return {
        zones: zonesNext,
        selectedCard: null,
      } as Partial<GameState> as GameState;
    }),

  selectPermanent: (at, index) =>
    set((s) => {
      const arr = s.permanents[at] || [];
      if (!arr[index]) return s;
      return {
        selectedPermanent: { at, index },
        selectedCard: null,
        selectedAvatar: null,
        previewCard: null,
      };
    }),

  moveSelectedPermanentTo: (x, y) =>
    set((s) => {
      const sel = s.selectedPermanent;
      if (!sel) return s;
      get().pushHistory();
      const fromKey: CellKey = sel.at;
      const toKey: CellKey = `${x},${y}`;
      const exists = (s.permanents[fromKey] || [])[sel.index];
      if (!exists) return s;
      const { per, movedName, removed, added, updated } = movePermanentCore(
        s.permanents,
        fromKey,
        sel.index,
        toKey,
        null
      );
      const cellNo = y * s.board.size.w + x + 1;
      get().log(`Moved '${movedName}' to #${cellNo}`);
      {
        const tr = get().transport;
        if (tr) {
          const patch = buildMoveDeltaPatch(
            fromKey,
            toKey,
            removed,
            updated,
            added,
            per,
            s.permanents
          );
          get().trySendPatch(patch);
        }
      }
      return {
        permanents: per,
        selectedPermanent: null,
      } as Partial<GameState> as GameState;
    }),

  moveSelectedPermanentToWithOffset: (x, y, offset) =>
    set((s) => {
      const sel = s.selectedPermanent;
      if (!sel) return s;
      get().pushHistory();
      const fromKey: CellKey = sel.at;
      const toKey: CellKey = `${x},${y}`;
      const exists = (s.permanents[fromKey] || [])[sel.index];
      if (!exists) return s;

      const { per, movedName, removed, added, updated } = movePermanentCore(
        s.permanents,
        fromKey,
        sel.index,
        toKey,
        offset
      );

      const cellNo = y * s.board.size.w + x + 1;
      get().log(`Moved '${movedName}' to #${cellNo}`);
      {
        const tr = get().transport;
        if (tr) {
          const patch = buildMoveDeltaPatch(
            fromKey,
            toKey,
            removed,
            updated,
            added,
            per,
            s.permanents
          );
          // Add a small delay to prevent rapid patch sends during transfers
          setTimeout(() => {
            get().trySendPatch(patch);
          }, 50);
        }
      }
      return {
        permanents: per,
        selectedPermanent: null,
      } as Partial<GameState> as GameState;
    }),

  setPermanentOffset: (at, index, offset) =>
    set((s) => {
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[at] || [])];
      if (!arr[index]) return s;
      const next = bumpPermanentVersion({ ...arr[index], offset });
      arr[index] = next;
      per[at] = arr;
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: next.instanceId ?? undefined,
            offset: next.offset ?? offset ?? null,
            version: next.version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  toggleTapPermanent: (at, index) =>
    set((s) => {
      get().pushHistory();
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[at] || [])];
      if (!arr[index]) return s;
      const cur = arr[index];
      // Owner-only tap/untap when online
      if (s.transport && s.actorKey) {
        const ownerKey = (cur.owner === 1 ? "p1" : "p2") as PlayerKey;
        if (s.actorKey !== ownerKey) {
          get().log(`Cannot change tap on opponent permanent`);
          return s as GameState;
        }
      }
      const nextTapVersion = Number(cur.tapVersion ?? 0) + 1;
      const next = bumpPermanentVersion({
        ...cur,
        tapped: !cur.tapped,
        tapVersion: nextTapVersion,
      });
      arr[index] = next;
      per[at] = arr;
      const cell = at.split(",");
      const x = Number(cell[0] || 0);
      const y = Number(cell[1] || 0);
      const cellNo = y * s.board.size.w + x + 1;
      get().log(
        `${next.tapped ? "Tapped" : "Untapped"} '${
          cur.card.name
        }' at #${cellNo}`
      );
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: next.instanceId ?? undefined,
            tapped: next.tapped,
            tapVersion: next.tapVersion,
            version: next.version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  // Move a permanent from the board to a target zone
  movePermanentToZone: (at, index, target, position) =>
    set((s) => {
      get().pushHistory();
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[at] || [])];
      const item = arr.splice(index, 1)[0];
      if (!item) return s;
      // Ownership guard in online play
      const ownerKey = (item.owner === 1 ? "p1" : "p2") as PlayerKey;
      if (s.transport) {
        if (!s.actorKey) {
          get().log(
            "Cannot move permanents until seat ownership is established"
          );
          return s as GameState;
        }
        if (s.actorKey !== ownerKey) {
          get().log("Cannot move opponent's permanent to a zone");
          return s as GameState;
        }
      }
      per[at] = arr;
      const owner: PlayerKey = item.owner === 1 ? "p1" : "p2";
      const zonesNext = { ...s.zones } as Record<PlayerKey, Zones>;
      const seatZones = { ...zonesNext[owner] };
      const movedCard = prepareCardForSeat(item.card, owner);
      const isToken = String(item.card?.type || "").toLowerCase().includes("token");
      const finalTarget = target === "graveyard" && isToken ? "banished" : target;
      if (finalTarget === "hand") seatZones.hand = [...seatZones.hand, movedCard];
      else if (finalTarget === "graveyard")
        seatZones.graveyard = [movedCard, ...seatZones.graveyard];
      else if (target === "spellbook") {
        const pile = [...seatZones.spellbook];
        if (position === "top") pile.unshift(movedCard);
        else pile.push(movedCard);
        seatZones.spellbook = pile;
      } else {
        seatZones.banished = [...seatZones.banished, movedCard];
      }
      zonesNext[owner] = seatZones as Zones;
      const cell = at.split(",");
      const x = Number(cell[0] || 0);
      const y = Number(cell[1] || 0);
      const cellNo = y * s.board.size.w + x + 1;
      const label =
        finalTarget === "hand"
          ? "hand"
          : finalTarget === "graveyard"
          ? "graveyard"
          : finalTarget === "spellbook"
          ? "spellbook"
          : "banished";
      get().log(
        `Moved '${
          item.card.name
        }' from #${cellNo} to ${owner.toUpperCase()} ${label}`
      );
      {
        const deltaPatch = item.instanceId
          ? createPermanentDeltaPatch([
              {
                at,
                entry: { instanceId: item.instanceId },
                remove: true,
              },
            ])
          : null;
        const fallbackPatch = deltaPatch
          ? null
          : createPermanentsPatch(per, at);
        const zonePatch = createZonesPatchFor(
          zonesNext as GameState["zones"],
          owner
        );
        const combined: ServerPatchT = {};
        if (deltaPatch) {
          Object.assign(combined, deltaPatch);
        } else if (fallbackPatch?.permanents) {
          combined.permanents = fallbackPatch.permanents;
        }
        if (zonePatch?.zones) {
          combined.zones = zonePatch.zones;
        }
        if (Object.keys(combined).length > 0) {
          get().trySendPatch(combined);
        }
      }
      return {
        permanents: per,
        zones: zonesNext as GameState["zones"],
      } as Partial<GameState> as GameState;
    }),

  // Move a site from the board to a target zone
  moveSiteToZone: (x, y, target, position) =>
    set((s) => {
      get().pushHistory();
      const key: CellKey = `${x},${y}`;
      const site = s.board.sites[key];
      if (!site || !site.card) return s;
      // Ownership guard in online play
      if (s.transport) {
        if (!s.actorKey) {
          get().log(
            "Cannot move sites until seat ownership is established"
          );
          return s as GameState;
        }
        const ownerKey = (site.owner === 1 ? "p1" : "p2") as PlayerKey;
        if (s.actorKey !== ownerKey) {
          get().log("Cannot move opponent's site to a zone");
          return s as GameState;
        }
      }
      const owner: PlayerKey = site.owner === 1 ? "p1" : "p2";
      // Remove the site from the board
      const sites = { ...s.board.sites };
      delete sites[key];
      const zones = { ...s.zones } as Record<PlayerKey, Zones>;
      const z = { ...zones[owner] };
      const movedSiteCard = site.card
        ? prepareCardForSeat(site.card, owner)
        : site.card;
      if (target === "hand" && movedSiteCard) {
        z.hand = [...z.hand, movedSiteCard];
      } else if (target === "graveyard" && movedSiteCard) {
        z.graveyard = [movedSiteCard, ...z.graveyard];
      } else if (target === "atlas" && movedSiteCard) {
        const pile = [...z.atlas];
        if (position === "top") pile.unshift(movedSiteCard);
        else pile.push(movedSiteCard);
        z.atlas = pile;
      } else if (movedSiteCard) {
        z.banished = [...z.banished, movedSiteCard];
      }
      zones[owner] = z;
      const cellNo = y * s.board.size.w + x + 1;
      const label =
        target === "hand"
          ? "hand"
          : target === "graveyard"
          ? "graveyard"
          : target === "atlas"
          ? "atlas"
          : "banished";
      get().log(
        `Moved site '${
          site.card.name
        }' from #${cellNo} to ${owner.toUpperCase()} ${label}`
      );
      {
        const boardNext = { ...s.board, sites } as GameState["board"];
        const patch: ServerPatchT = {
          board: boardNext,
          zones: zones as GameState["zones"],
        };
        get().trySendPatch(patch);
      }
      return {
        board: { ...s.board, sites },
        zones,
      } as Partial<GameState> as GameState;
    }),

  moveFromBanishedToZone: (who, instanceId, target) =>
    set((s) => {
      get().pushHistory();
      if (!instanceId) return s as GameState;
      if (s.transport && s.actorKey && s.actorKey !== who) {
        get().log("Cannot modify opponent banished without consent");
        return s as GameState;
      }
      const zonesNext = { ...s.zones } as Record<PlayerKey, Zones>;
      const seatZones = { ...zonesNext[who] } as Zones;
      const banished = [...seatZones.banished];
      const idx = banished.findIndex((c) => c && c.instanceId === instanceId);
      if (idx < 0) return s as GameState;
      const card = banished.splice(idx, 1)[0];
      if (!card) return s as GameState;
      if (target === "hand") {
        seatZones.hand = [...seatZones.hand, card];
      } else {
        seatZones.graveyard = [card, ...seatZones.graveyard];
      }
      seatZones.banished = banished;
      zonesNext[who] = seatZones;
      get().log(
        `Returned '${card.name}' from banished to ${
          target === "hand" ? "hand" : "graveyard"
        } (${who.toUpperCase()})`
      );
      {
        const patch = createZonesPatchFor(zonesNext as GameState["zones"], who);
        if (patch) get().trySendPatch(patch);
      }
      return { zones: zonesNext as GameState["zones"] } as Partial<GameState> as GameState;
    }),

  // Transfer control of a permanent at a given cell/index (toggle if 'to' not provided)
  transferPermanentControl: (at, index, to) =>
    set((s) => {
      get().pushHistory();
      if (s.transport) {
        if (!s.actorKey) {
          get().log("Cannot transfer control until seat is established");
          return s as GameState;
        }
      }
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[at] || [])];
      const item = arr[index];
      if (!item) return s;
      if (s.transport && s.actorKey) {
        const ownerSeat = item.owner === 1 ? "p1" : "p2";
        if (s.actorKey !== ownerSeat) {
          get().log("Cannot transfer opponent permanent");
          return s as GameState;
        }
      }
      const fromOwner = item.owner;
      const newOwner: 1 | 2 = to ?? (fromOwner === 1 ? 2 : 1);
      const newOwnerSeat: PlayerKey = newOwner === 1 ? "p1" : "p2";

      // CRITICAL FIX: Preserve exact world position when changing ownership
      // The card should ONLY rotate 180° without any positional movement.
      //
      // Card's world position: worldZ = tileZ + zBase + offset[1]
      // When ownership changes, zBase flips from one side to the other.
      // To maintain the same worldZ: oldWorldZ = newWorldZ
      // Therefore: tileZ + oldZBase + oldOffset[1] = tileZ + newZBase + newOffset[1]
      // Solving: newOffset[1] = oldOffset[1] + (oldZBase - newZBase)
      //
      // BUT: The zBase flip also means the offset direction reverses!
      // If a card is offset +0.2 from player 1's side, it should be -0.2 from player 2's side
      // to stay in the same world position.
      const TILE_SIZE = 2.0; // From @/lib/game/constants
      const STACK_MARGIN_Z = TILE_SIZE * 0.1;

      const oldZBase = fromOwner === 1
        ? -TILE_SIZE * 0.5 + STACK_MARGIN_Z
        : TILE_SIZE * 0.5 - STACK_MARGIN_Z;
      const newZBase = newOwner === 1
        ? -TILE_SIZE * 0.5 + STACK_MARGIN_Z
        : TILE_SIZE * 0.5 - STACK_MARGIN_Z;

      const currentOffset = item.offset || [0, 0];
      const zBaseDiff = oldZBase - newZBase;

      // Adjust offset to maintain world position
      // Formula: newOffset = oldOffset + (oldZBase - newZBase)
      // This ensures: tileZ + oldZBase + oldOffset = tileZ + newZBase + newOffset
      // DO NOT invert offset - just add the zBase difference
      const adjustedOffset: [number, number] = [
        currentOffset[0], // X offset unchanged
        currentOffset[1] + zBaseDiff // Z offset adjusted by zBase difference
      ];

      console.log('[ownership-change]', {
        from: fromOwner,
        to: newOwner,
        oldZBase,
        newZBase,
        zBaseDiff,
        currentOffset,
        adjustedOffset,
        at,
        instanceId: item.card.instanceId,
        cardName: item.card.name,
        strategy: 'invert-offset-and-adjust'
      });

      // Log what we're sending in the patch
      console.log('[ownership-change] Permanent update:', {
        at,
        instanceId: item.card.instanceId,
        owner: newOwner,
        offset: adjustedOffset
      });

      const updated = bumpPermanentVersion({
        ...item,
        owner: newOwner,
        offset: adjustedOffset,
        card: prepareCardForSeat(item.card, newOwnerSeat),
      });
      arr[index] = updated;
      per[at] = arr;
      const instanceId = item.card.instanceId;
      let zonesNext = s.zones;
      let changedSeats: PlayerKey[] = [];
      if (instanceId) {
        const removal = removeCardInstanceFromAllZones(s.zones, instanceId);
        if (removal) {
          zonesNext = removal.zones;
          changedSeats = removal.seats;
        }
      }
      // Add to new owner's battlefield locally for immediate feedback
      if (zonesNext) {
        const currentSeatZones = {
          ...(zonesNext[newOwnerSeat] ?? createEmptyPlayerZones()),
        } as Zones;
        const battlefield = [...currentSeatZones.battlefield];
        const alreadyPresent = instanceId
          ? battlefield.some((card) => card.instanceId === instanceId)
          : battlefield.some((card) => card.cardId === item.card.cardId);
        if (!alreadyPresent) {
          battlefield.push(prepareCardForSeat(item.card, newOwnerSeat));
          currentSeatZones.battlefield = battlefield;
          zonesNext = {
            ...zonesNext,
            [newOwnerSeat]: currentSeatZones,
          } as GameState["zones"];
          if (!changedSeats.includes(newOwnerSeat)) {
            changedSeats.push(newOwnerSeat);
          }
        }
      }
      const cell = at.split(",");
      const x = Number(cell[0] || 0);
      const y = Number(cell[1] || 0);
      const cellNo = y * s.board.size.w + x + 1;
      get().log(
        `Control of '${item.card.name}' at #${cellNo} transferred to P${newOwner}`
      );
      {
        const actorSeat = s.actorKey;
        const current = arr[index];
        const deltaPatch =
          current && current.instanceId
            ? createPermanentDeltaPatch([
                {
                  at,
                  entry: {
                    instanceId: current.instanceId,
                    owner: current.owner,
                    offset: current.offset, // CRITICAL: Include offset in patch
                    card: { ...(current.card as CardRef) },
                    version: current.version,
                  },
                },
              ])
            : null;
        const fallbackPatch = deltaPatch
          ? null
          : createPermanentsPatch(per, at);
        const patch: ServerPatchT = {};
        if (deltaPatch) {
          Object.assign(patch, deltaPatch);
        } else if (fallbackPatch?.permanents) {
          patch.permanents = fallbackPatch.permanents;
        }
        if (zonesNext) {
          const seatsForZone: PlayerKey[] = [
            fromOwner === 1 ? "p1" : "p2",
            newOwnerSeat,
          ];
          const zonePatch = createZonesPatchFor(zonesNext, seatsForZone);
          if (zonePatch?.zones) {
            (patch as Record<string, unknown>).__allowZoneSeats = seatsForZone;
            patch.zones = zonePatch.zones;
          }
        }
        if (Object.keys(patch).length > 0) {
          get().trySendPatch(patch);
        }
      }
      return {
        permanents: per,
        ...(zonesNext !== s.zones ? { zones: zonesNext } : {}),
      } as Partial<GameState> as GameState;
    }),

  // Transfer control of a site at a given x,y (toggle if 'to' not provided)
  transferSiteControl: (x, y, to) =>
    set((s) => {
      get().pushHistory();
      if (s.transport) {
        if (!s.actorKey) {
          get().log("Cannot transfer control until seat is established");
          return s as GameState;
        }
      }
      const key: CellKey = `${x},${y}`;
      const site = s.board.sites[key];
      if (!site) return s;
      if (s.transport && s.actorKey) {
        const ownerSeat = site.owner === 1 ? "p1" : "p2";
        if (s.actorKey !== ownerSeat) {
          get().log("Cannot transfer opponent site");
          return s as GameState;
        }
      }
      const fromOwner = site.owner;
      const newOwner: 1 | 2 = to ?? (fromOwner === 1 ? 2 : 1);
      const newOwnerSeat: PlayerKey = newOwner === 1 ? "p1" : "p2";
      const updatedSiteCard = site.card
        ? prepareCardForSeat(site.card, newOwnerSeat)
        : site.card;
      const sites = {
        ...s.board.sites,
        [key]: { ...site, owner: newOwner, card: updatedSiteCard },
      };
      let zonesNext = s.zones;
      let changedSeats: PlayerKey[] = [];
      if (updatedSiteCard?.instanceId) {
        const removal = removeCardInstanceFromAllZones(
          s.zones,
          updatedSiteCard.instanceId
        );
        if (removal) {
          zonesNext = removal.zones;
          changedSeats = removal.seats;
        }
      }
      const cellNo = y * s.board.size.w + x + 1;
      const name = site.card?.name || `Site #${cellNo}`;
      get().log(
        `Control of '${name}' at #${cellNo} transferred to P${newOwner}`
      );
      {
        const boardNext = { ...s.board, sites } as GameState["board"];
        const patch: ServerPatchT = { board: boardNext };
        if (changedSeats.length > 0 && zonesNext) {
          const zonePatch = createZonesPatchFor(
            zonesNext,
            changedSeats as Array<keyof GameState["zones"]>
          );
          if (zonePatch?.zones) {
            patch.zones = zonePatch.zones;
          }
        }
        get().trySendPatch(patch);
      }
      return {
        board: { ...s.board, sites },
        ...(zonesNext !== s.zones ? { zones: zonesNext } : {}),
      } as Partial<GameState> as GameState;
    }),

  setAvatarCard: (who, card) =>
    set((s) => {
      get().log(`${who.toUpperCase()} sets Avatar to '${card.name}'`);
      const avatarsNext = {
        ...s.avatars,
        [who]: { ...s.avatars[who], card },
      } as GameState["avatars"];
      {
        const tr = get().transport;
        if (tr) {
          const patch: ServerPatchT = {
            avatars: { [who]: { card } } as GameState["avatars"],
          };
          get().trySendPatch(patch);
        }
      }
      return { avatars: avatarsNext } as Partial<GameState> as GameState;
    }),

  placeAvatarAtStart: (who) =>
    set((s) => {
      const w = s.board.size.w;
      const h = s.board.size.h;
      const x = Math.floor(w / 2);
      // Board coordinate system: y=0 is bottom row, y=h-1 is top row.
      // Desired: p1 at TOP middle, p2 at BOTTOM middle.
      const y = who === "p1" ? h - 1 : 0;
      const cellNo = y * w + x + 1;
      get().log(`${who.toUpperCase()} places Avatar at #${cellNo}`);
      const avatarsNext = {
        ...s.avatars,
        [who]: { ...s.avatars[who], pos: [x, y], offset: null },
      } as GameState["avatars"];
      {
        const tr = get().transport;
        if (tr) {
          // Only send the acting seat to avoid touching opponent avatar state
          const patch: ServerPatchT = {
            avatars: { [who]: { pos: [x, y] as [number, number], offset: null } } as GameState["avatars"],
          };
          get().trySendPatch(patch);
        }
      }
      return { avatars: avatarsNext } as Partial<GameState> as GameState;
    }),

  moveAvatarTo: (who, x, y) =>
    set((s) => {
      get().pushHistory();
      const w = s.board.size.w;
      const cellNo = y * w + x + 1;

      // Get old avatar position
      const oldPos = s.avatars[who]?.pos;
      const oldKey = oldPos ? `${oldPos[0]},${oldPos[1]}` as CellKey : null;
      const newKey = `${x},${y}` as CellKey;

      // Update avatar position
      const avatars = buildAvatarUpdate(
        s,
        who,
        [x, y] as [number, number],
        null
      );

      // Move attached artifacts if avatar moved to a different tile
      let permanents = s.permanents;
      if (oldKey && oldKey !== newKey) {
        const result = moveAvatarAttachedArtifacts(s.permanents, oldKey, newKey);
        permanents = result.permanents;
        if (result.movedArtifacts.length > 0) {
          get().log(`Moved ${result.movedArtifacts.length} attached artifact(s) with avatar`);
        }
      }

      get().log(`${who.toUpperCase()} moves Avatar to #${cellNo}`);
      {
        const tr = get().transport;
        if (tr) {
          const patch: ServerPatchT = {
            avatars: {
              [who]: { pos: [x, y] as [number, number], offset: null },
            } as GameState["avatars"],
          };
          // Also send permanents patch if artifacts moved
          if (oldKey && oldKey !== newKey) {
            patch.permanents = {
              [oldKey]: permanents[oldKey] || [],
              [newKey]: permanents[newKey] || [],
            };
          }
          get().trySendPatch(patch);
        }
      }
      return { avatars, permanents } as Partial<GameState> as GameState;
    }),

  moveAvatarToWithOffset: (who, x, y, offset) =>
    set((s) => {
      get().pushHistory();
      const w = s.board.size.w;
      const cellNo = y * w + x + 1;

      // Get old avatar position
      const oldPos = s.avatars[who]?.pos;
      const oldKey = oldPos ? `${oldPos[0]},${oldPos[1]}` as CellKey : null;
      const newKey = `${x},${y}` as CellKey;

      // Update avatar position
      const avatars = buildAvatarUpdate(
        s,
        who,
        [x, y] as [number, number],
        offset
      );

      // Move attached artifacts if avatar moved to a different tile
      let permanents = s.permanents;
      if (oldKey && oldKey !== newKey) {
        const result = moveAvatarAttachedArtifacts(s.permanents, oldKey, newKey);
        permanents = result.permanents;
        if (result.movedArtifacts.length > 0) {
          get().log(`Moved ${result.movedArtifacts.length} attached artifact(s) with avatar`);
        }
      }

      get().log(`${who.toUpperCase()} moves Avatar to #${cellNo}`);
      {
        const tr = get().transport;
        if (tr) {
          // Only send the acting seat to avoid opponent-zone write detection
          const patch: ServerPatchT = {
            avatars: {
              [who]: { pos: [x, y] as [number, number], offset },
            } as GameState["avatars"],
          };
          // Also send permanents patch if artifacts moved
          if (oldKey && oldKey !== newKey) {
            patch.permanents = {
              [oldKey]: permanents[oldKey] || [],
              [newKey]: permanents[newKey] || [],
            };
          }
          get().trySendPatch(patch);
        }
      }
      return { avatars, permanents } as Partial<GameState> as GameState;
    }),

  setAvatarOffset: (who, offset) =>
    set((s) => {
      const cur = s.avatars[who];
      if (!cur) return s;
      const avatarsNext = {
        ...s.avatars,
        [who]: { ...cur, offset },
      } as GameState["avatars"];
      const updates: Partial<GameState> = {
        avatars: avatarsNext,
      };
      const actorSeat = s.actorKey;
      const patch: ServerPatchT = {
        avatars: { [who]: { offset } } as GameState["avatars"],
      };
      if (!actorSeat) {
        const pending = Array.isArray(s.pendingPatches)
          ? s.pendingPatches
          : [];
        updates.pendingPatches = [...pending, patch];
      } else if (actorSeat !== who) {
        get().log("Cannot adjust opponent avatar offset");
        return s as GameState;
      } else {
        get().trySendPatch(patch);
      }
      return updates as Partial<GameState> as GameState;
    }),

  toggleTapAvatar: (who) =>
    set((s) => {
      get().pushHistory();
      const actorSeat = s.actorKey;
      if (actorSeat && actorSeat !== who) {
        get().log(`Cannot change tap on opponent avatar`);
        return s as GameState;
      }
      const cur = s.avatars[who];
      const next = { ...cur, tapped: !cur.tapped };
      get().log(
        `${who.toUpperCase()} ${next.tapped ? "taps" : "untaps"} Avatar`
      );
      const avatarsNext = { ...s.avatars, [who]: next } as GameState["avatars"];
      const patch: ServerPatchT = {
        avatars: { [who]: { tapped: next.tapped } } as GameState["avatars"],
      };
      const updates: Partial<GameState> = {
        avatars: avatarsNext,
      };
      if (!actorSeat) {
        const pending = Array.isArray(s.pendingPatches)
          ? s.pendingPatches
          : [];
        updates.pendingPatches = [...pending, patch];
      } else {
        get().trySendPatch(patch);
      }
      return updates as Partial<GameState> as GameState;
    }),

  // Mulligan: shuffle current hand back into libraries (sites -> atlas, others -> spellbook), then draw a new opening hand.
  mulligan: (who) =>
    set((s) => {
      if (s.mulligans[who] <= 0) return s;
      const hand = [...s.zones[who].hand];
      const sb = [...s.zones[who].spellbook];
      const at = [...s.zones[who].atlas];
      for (const c of hand) {
        const isSite = (c.type || "").toLowerCase().includes("site");
        if (isSite) at.push(c);
        else sb.push(c);
      }
      // shuffle both piles
      for (let i = sb.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sb[i], sb[j]] = [sb[j], sb[i]];
      }
      for (let i = at.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [at[i], at[j]] = [at[j], at[i]];
      }
      // draw new opening hand (default counts)
      const newHand: CardRef[] = [];
      const drawN = (pile: CardRef[], n: number) => {
        for (let i = 0; i < n; i++) {
          const c = pile.shift();
          if (!c) break;
          newHand.push(c);
        }
      };
      const avatarName = (s.avatars[who]?.card?.name || "").toLowerCase();
      const isSpellslinger = avatarName === "spellslinger";
      const isPathfinder = avatarName === "pathfinder";
      const sbCount = isSpellslinger ? 4 : 3;
      const atCount = isPathfinder ? 0 : 3;
      drawN(sb, sbCount);
      drawN(at, atCount);
      const m = { ...s.mulligans, [who]: s.mulligans[who] - 1 };
      get().log(
        `${who.toUpperCase()} mulligans (draws ${sbCount} SB + ${atCount} AT)`
      );
      const zonesNext = {
        ...s.zones,
        [who]: { ...s.zones[who], spellbook: sb, atlas: at, hand: newHand },
      } as GameState["zones"];
      const mulligansNext = m as GameState["mulligans"];
      const mulliganDrawnNext = {
        ...s.mulliganDrawn,
        [who]: newHand,
      } as GameState["mulliganDrawn"];
      {
        const tr = get().transport;
        if (tr) {
          const patch: ServerPatchT = {
            zones: zonesNext,
            mulligans: mulligansNext,
            mulliganDrawn: mulliganDrawnNext,
          };
          get().trySendPatch(patch);
        }
      }
      return {
        zones: zonesNext,
        mulligans: mulligansNext,
        mulliganDrawn: mulliganDrawnNext,
      } as Partial<GameState> as GameState;
    }),

  // Mulligan with manual selection: return selected cards to the BOTTOM of their respective piles
  // (sites -> atlas, others -> spellbook) and draw the same number of replacements from the TOP.
  mulliganWithSelection: (who, indices) =>
    set((s) => {
      if (s.mulligans[who] <= 0) return s;
      const hand = [...s.zones[who].hand];
      if (!indices || indices.length === 0) return s;
      const idxSet = new Set(indices);
      const kept: CardRef[] = [];
      const toReturn: CardRef[] = [];
      hand.forEach((c, i) => {
        if (idxSet.has(i)) toReturn.push(c);
        else kept.push(c);
      });

      const sb = [...s.zones[who].spellbook];
      const at = [...s.zones[who].atlas];
      let backSpell = 0;
      let backAtlas = 0;
      for (const c of toReturn) {
        const isSite = (c.type || "").toLowerCase().includes("site");
        if (isSite) {
          at.push(c);
          backAtlas++;
        } else {
          sb.push(c);
          backSpell++;
        }
      }

      const drawn: CardRef[] = [];
      const drawN = (pile: CardRef[], n: number) => {
        for (let i = 0; i < n; i++) {
          const c = pile.shift();
          if (!c) break;
          kept.push(c);
          drawn.push(c);
        }
      };
      drawN(sb, backSpell);
      drawN(at, backAtlas);

      const m = { ...s.mulligans, [who]: s.mulligans[who] - 1 };
      get().log(
        `${who.toUpperCase()} mulligans ${
          toReturn.length
        } card(s) (${backAtlas} site(s), ${backSpell} other)`
      );
      if (drawn.length)
        get().log(
          `${who.toUpperCase()} draws ${drawn.length} replacement card(s)`
        );
      const zonesNext = {
        ...s.zones,
        [who]: { ...s.zones[who], spellbook: sb, atlas: at, hand: kept },
      } as GameState["zones"];
      const mulligansNext = m as GameState["mulligans"];
      const mulliganDrawnNext = {
        ...s.mulliganDrawn,
        [who]: drawn,
      } as GameState["mulliganDrawn"];
      {
        const tr = get().transport;
        if (tr) {
          const patch: ServerPatchT = {
            zones: { [who]: zonesNext[who] } as unknown as GameState["zones"],
            mulligans: { [who]: mulligansNext[who] } as unknown as GameState["mulligans"],
            mulliganDrawn: { [who]: mulliganDrawnNext[who] } as unknown as GameState["mulliganDrawn"],
          };
          get().trySendPatch(patch);
        }
      }
      return {
        zones: zonesNext,
        mulligans: mulligansNext,
        mulliganDrawn: mulliganDrawnNext,
      } as Partial<GameState> as GameState;
    }),

  // Clear mulligan drawn cards and finalize hands after mulligan phase
  finalizeMulligan: () =>
    set(() => {
      const next = { p1: [], p2: [] } as Record<PlayerKey, CardRef[]>;
      {
        const tr = get().transport;
        if (tr) {
          // Only clear my seat on the server to avoid interfering with opponent state
          const who = get().actorKey;
          if (who === "p1" || who === "p2") {
            const patch: ServerPatchT = { mulliganDrawn: { [who]: [] } as unknown as GameState["mulliganDrawn"] };
            get().trySendPatch(patch);
          }
          // Explicitly notify the server that this player has completed mulligans
          try {
            tr.mulliganDone();
          } catch {}
        }
      }
      return { mulliganDrawn: next } as Partial<GameState> as GameState;
    }),

  // ===== PERMANENT POSITION SLICE (Burrow/Submerge) =====

  // State storage
  permanentPositions: {},
  permanentAbilities: {},
  sitePositions: {},
  playerPositions: {
    p1: { playerId: 1, position: { x: 0, z: 0 } },
    p2: { playerId: 2, position: { x: 0, z: 0 } },
  },

  // Position Actions
  setPermanentPosition: (permanentId: number, position: PermanentPosition) =>
    set((state) => ({
      permanentPositions: {
        ...state.permanentPositions,
        [permanentId]: position,
      },
    })),

  updatePermanentState: (
    permanentId: number,
    newState: PermanentPositionState
  ) =>
    set((state) => {
      const currentPos = state.permanentPositions[permanentId];
      if (!currentPos) return state;

      // Calculate new Y position based on state
      let newY = currentPos.position.y;
      switch (newState) {
        case "surface":
          newY = 0;
          break;
        case "burrowed":
        case "submerged":
          newY = -0.25; // Underground depth
          break;
      }

      const updatedPosition: PermanentPosition = {
        ...currentPos,
        state: newState,
        position: {
          ...currentPos.position,
          y: newY,
        },
      };

      const nextPositions = {
        ...state.permanentPositions,
        [permanentId]: updatedPosition,
      } as GameState["permanentPositions"];

      // Broadcast as a partial patch if online
      try {
        const tr = get().transport;
        if (tr) {
          const patch: ServerPatchT = { permanentPositions: nextPositions };
          get().trySendPatch(patch);
        }
      } catch {}

      return {
        permanentPositions: nextPositions,
      } as Partial<GameState> as GameState;
    }),

  setPermanentAbility: (permanentId: number, ability: BurrowAbility) =>
    set((state) => ({
      permanentAbilities: {
        ...state.permanentAbilities,
        [permanentId]: ability,
      },
    })),

  setSitePosition: (siteId: number, positionData: SitePositionData) =>
    set((state) => ({
      sitePositions: {
        ...state.sitePositions,
        [siteId]: positionData,
      },
    })),

  setPlayerPosition: (playerId: PlayerKey, position: PlayerPositionReference) =>
    set((state) => ({
      playerPositions: {
        ...state.playerPositions,
        [playerId]: position,
      },
    })),

  // Validation and Utilities
  canTransitionState: (
    permanentId: number,
    targetState: PermanentPositionState
  ) => {
    const state = get();
    const currentPos = state.permanentPositions[permanentId];
    const ability = state.permanentAbilities[permanentId];

    if (!currentPos || !ability) return false;

    const currentState = currentPos.state;

    // Same state transitions not allowed
    if (currentState === targetState) return false;

    // Check ability requirements
    if (targetState === "burrowed" && !ability.canBurrow) return false;
    if (targetState === "submerged" && !ability.canSubmerge) return false;

    // Direct burrowed ↔ submerged transitions forbidden
    if (currentState === "burrowed" && targetState === "submerged")
      return false;
    if (currentState === "submerged" && targetState === "burrowed")
      return false;

    return true;
  },

  getAvailableActions: (permanentId: number): ContextMenuAction[] => {
    const state = get();
    const currentPos = state.permanentPositions[permanentId];
    const ability = state.permanentAbilities[permanentId];

    if (!currentPos || !ability) return [];

    const actions: ContextMenuAction[] = [];
    const currentState = currentPos.state;

    // Add burrow action if possible
    if (currentState === "surface" && ability.canBurrow) {
      actions.push({
        actionId: "burrow",
        displayText: "Burrow",
        icon: "arrow-down",
        isEnabled: true,
        targetPermanentId: permanentId,
        newPositionState: "burrowed",
        description: "Move this permanent under the current site",
      });
    }

    // Add submerge action if possible
    if (currentState === "surface" && ability.canSubmerge) {
      // TODO: Check if at water site when site system is integrated
      const isAtWaterSite = true; // Placeholder
      actions.push({
        actionId: "submerge",
        displayText: "Submerge",
        icon: "waves",
        isEnabled: isAtWaterSite,
        targetPermanentId: permanentId,
        newPositionState: "submerged",
        description: "Submerge this permanent underwater (water sites only)",
      });
    }

    // Add surface/emerge actions if underground
    if (currentState === "burrowed") {
      actions.push({
        actionId: "surface",
        displayText: "Surface",
        icon: "arrow-up",
        isEnabled: true,
        targetPermanentId: permanentId,
        newPositionState: "surface",
        description: "Bring this permanent back to the surface",
      });
    }

    if (currentState === "submerged") {
      actions.push({
        actionId: "emerge",
        displayText: "Emerge",
        icon: "arrow-up",
        isEnabled: true,
        targetPermanentId: permanentId,
        newPositionState: "surface",
        description: "Emerge this permanent from underwater",
      });
    }

    return actions;
  },

  calculateEdgePosition: (
    tileCoords: { x: number; z: number },
    playerPos: { x: number; z: number }
  ) => {
    // Calculate offset toward player position from tile center
    const dx = playerPos.x - tileCoords.x;
    const dz = playerPos.z - tileCoords.z;

    // Normalize and scale to edge (max ±0.2 offset, closer to center)
    const magnitude = Math.sqrt(dx * dx + dz * dz);
    if (magnitude === 0) return { x: 0, z: 0 };

    const scale = 0.2;
    return {
      x: (dx / magnitude) * scale,
      z: (dz / magnitude) * scale,
    };
  },

  calculatePlacementAngle: (
    tilePos: { x: number; z: number },
    playerPos: { x: number; z: number }
  ) => {
    // Calculate angle from tile to player (0 = east, π/2 = north)
    const dx = playerPos.x - tilePos.x;
    const dz = playerPos.z - tilePos.z;

    return Math.atan2(dz, dx);
  },

  // Reset all game state to initial values (for new matches)
  resetGameState: () =>
    set((state) => {
      console.log("[game] Resetting game state for new match");
      try { clearSnapshotsStorageFor(get().matchId ?? null); } catch {}
      const reset: Partial<GameState> = {
        players: {
          p1: {
            life: 20,
            lifeState: "alive",
            mana: 0,
            thresholds: { air: 0, water: 0, earth: 0, fire: 0 },
          },
          p2: {
            life: 20,
            lifeState: "alive",
            mana: 0,
            thresholds: { air: 0, water: 0, earth: 0, fire: 0 },
          },
        },
        currentPlayer: 1,
        turn: 1,
        phase: "Setup",
        lastServerTs: 0,
        lastLocalActionTs: 0,
        setupWinner: null,
        d20Rolls: { p1: null, p2: null },
        actorKey: state.actorKey, // Preserve actorKey during reset
        matchEnded: false,
        winner: null,
        board: { size: { w: 5, h: 4 }, sites: {} },
        zones: createEmptyZonesRecord(),
        selectedCard: null,
        selectedPermanent: null,
        selectedAvatar: null,
        mouseInHandZone: false,
        handHoverCount: 0,
        avatars: createDefaultAvatars(),
        permanents: {},
        permanentPositions: {},
        permanentAbilities: {},
        sitePositions: {},
        playerPositions: createDefaultPlayerPositions(),
        dragFromHand: false,
        dragFromPile: null,
        hoverCell: null,
        previewCard: null,
        contextMenu: null,
        boardPings: [],
        lastPointerWorldPos: null,
        history: [],
        historyByPlayer: { p1: [], p2: [] },
        mulligans: { p1: 1, p2: 1 },
        mulliganDrawn: { p1: [], p2: [] },
        events: [],
        eventSeq: 0,
        pendingPatches: [],
        interactionLog: {},
        pendingInteractionId: null,
        acknowledgedInteractionIds: {},
        activeInteraction: null,
        transportSubscriptions: [],
        snapshots: [],
      };
      return reset as GameState;
    })
});

export const createGameStore = () => create<GameState>(createGameStoreState);

export const useGameStore = createGameStore();

getStoreState = useGameStore.getState;
