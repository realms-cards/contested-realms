import { create } from "zustand";
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
  slug?: string | null; // variant slug for images
  thresholds?: Partial<Thresholds> | null; // cost/requirements
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
    spellbook: Array.isArray(spellbook) ? spellbook : base.spellbook,
    atlas: Array.isArray(atlas) ? atlas : base.atlas,
    hand: Array.isArray(hand) ? hand : base.hand,
    graveyard: Array.isArray(graveyard) ? graveyard : base.graveyard,
    battlefield: Array.isArray(battlefield) ? battlefield : base.battlefield,
    banished: Array.isArray(banished) ? banished : base.banished,
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
  // Optional attachment to a permanent at the same tile
  attachedTo?: { at: CellKey; index: number } | null;
  // Generic numeric counter displayed on the card (e.g., +1 counters)
  counters?: number; // absent/0 => no counter badge
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
};

const phases: Phase[] = ["Setup", "Start", "Draw", "Main", "End"];

const THRESHOLD_KEYS: (keyof Thresholds)[] = ["air", "water", "earth", "fire"];

function emptyThresholds(): Thresholds {
  return { air: 0, water: 0, earth: 0, fire: 0 };
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

export type GameEvent = { id: number; ts: number; text: string };
const MAX_EVENTS = 200;
export const BOARD_PING_LIFETIME_MS = 2500;
export const BOARD_PING_MAX_HISTORY = 8;

// Snapshot of serializable game state we can restore on undo
export type SerializedGame = {
  actorKey: PlayerKey | null;
  players: Record<PlayerKey, PlayerState>;
  currentPlayer: 1 | 2;
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

// ---- Shared helpers (pure) -------------------------------------------------

// Move a permanent between cells with optional new offset while preserving
// existing behavior around tilt and offset. Returns a new permanents map and
// the moved card's name for logging.
function movePermanentCore(
  perIn: Permanents,
  fromKey: CellKey,
  index: number,
  toKey: CellKey,
  newOffset: [number, number] | null
): { per: Permanents; movedName: string } {
  const per: Permanents = { ...perIn };
  const fromArr = [...(per[fromKey] || [])];
  const spliced = fromArr.splice(index, 1);
  const item = spliced[0];
  if (!item) {
    // Nothing to move; return original state
    return { per: perIn, movedName: "" };
  }

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
        attachedTokens.unshift(removed); // Add to front to maintain order
      }
    });

  // Update indices for any remaining attachments in fromArr
  // (since we removed items, indices may have shifted)
  fromArr.forEach((perm) => {
    if (perm.attachedTo && perm.attachedTo.at === fromKey) {
      let newIndex = perm.attachedTo.index;
      // Count how many items were removed before this attachment's target
      for (const removedIdx of attachedTokenIndices) {
        if (removedIdx < perm.attachedTo.index) {
          newIndex--;
        }
      }
      if (index < perm.attachedTo.index) {
        newIndex--; // Also account for the main permanent being moved
      }
      perm.attachedTo.index = newIndex;
    }
  });

  const toArr = [...(per[toKey] || [])];
  const newIndex = toArr.length; // The index where the permanent will be placed

  // When newOffset is null, keep existing offset; when provided, set it.
  // For tilt: if item has none, assign a random one on move; otherwise keep.
  const toPush: PermanentItem =
    newOffset == null
      ? item.tilt == null
        ? { ...item, tilt: randomTilt() }
        : item
      : { ...item, offset: newOffset, tilt: item.tilt ?? randomTilt() };
  toArr.push(toPush);

  // Add attached tokens with updated attachment references
  attachedTokens.forEach((token) => {
    toArr.push({
      ...token,
      attachedTo: { at: toKey, index: newIndex },
    });
  });

  per[fromKey] = fromArr;
  per[toKey] = toArr;
  return { per, movedName: item.card.name };
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
function deepMergeReplaceArrays<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base as T;
  if (patch === null) return null as unknown as T;
  if (Array.isArray(patch)) return patch as unknown as T; // replace arrays
  if (typeof patch !== "object") return patch as T; // primitives overwrite

  const baseObj =
    base && typeof base === "object" && !Array.isArray(base)
      ? (base as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const out: Record<string, unknown> = { ...baseObj };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const cur = out[k];
    out[k] = deepMergeReplaceArrays(cur as unknown, v as unknown) as unknown;
  }
  return out as unknown as T;
}

// Normalize permanents arrays without dropping duplicates across cells.
// Trust server/state sync; allow multiple copies of the same cardId.
function dedupePermanents(
  per: Permanents | undefined | null
): Permanents | undefined {
  if (!per || typeof per !== "object")
    return per as unknown as Permanents | undefined;
  const out: Permanents = {} as Permanents;
  for (const [cell, arrAny] of Object.entries(per as Record<string, unknown>)) {
    const arr = Array.isArray(arrAny) ? (arrAny as PermanentItem[]) : [];
    const nextArr: PermanentItem[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      nextArr.push(item as PermanentItem);
    }
    out[cell as keyof Permanents] = nextArr as Permanents[keyof Permanents];
  }
  return out;
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

export const useGameStore = create<GameState>((set, get) => ({
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
  phase: "Setup",
  setPhase: (phase) => set({ phase }),
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
  // Actor seat for online play; null in offline/hotseat
  actorKey: null,
  setActorKey: (key) =>
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
    }),
  // Match end state
  matchEnded: false,
  winner: null,
  interactionLog: {},
  pendingInteractionId: null,
  acknowledgedInteractionIds: {},
  activeInteraction: null,
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
      try {
        if (message.message) get().log(message.message);
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
    const tr = get().transport;
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
      try {
        const p = patch as ServerPatchT;
        const sanitized: ServerPatchT = { ...p };
        // Filter avatars: if actorKey known, allow only that seat; if unknown, allow present seats but remove 'tapped'
        if (p.avatars && typeof p.avatars === "object") {
          const out: Partial<GameState["avatars"]> = {};
          const keys = Object.keys(p.avatars).filter(
            (k) => k === "p1" || k === "p2"
          ) as PlayerKey[];
          if (actorKey === "p1" || actorKey === "p2") {
            // Keep only actor seat
            const k = actorKey as PlayerKey;
            if (keys.includes(k)) {
              const v = (p.avatars as GameState["avatars"])[k] as
                | AvatarState
                | undefined;
              if (v && typeof v === "object") {
                const rest = { ...(v as unknown as Record<string, unknown>) };
                delete (rest as Record<string, unknown>)["tapped"];
                (out as Record<string, unknown>)[k] = rest as unknown;
              }
            }
          } else {
            // Actor unknown: allow optimistic avatar updates but strip tap intent
            for (const k of keys) {
              const v = (p.avatars as GameState["avatars"])[k];
              if (!v || typeof v !== "object") continue;
              const rest = { ...(v as Record<string, unknown>) };
              delete rest.tapped;
              (out as Record<string, unknown>)[k] = rest as unknown;
            }
          }
          if (Object.keys(out).length > 0) {
            sanitized.avatars = out as GameState["avatars"];
          } else {
            delete (sanitized as unknown as { avatars?: unknown }).avatars;
          }
        }
        // Filter zones: keep only actor seat updates when actor known
        if (p.zones && typeof p.zones === "object") {
          if (actorKey === "p1" || actorKey === "p2") {
            const z = p.zones as Partial<Record<PlayerKey, Zones>>;
            const outZ: Partial<Record<PlayerKey, Zones>> = {};
            if (z[actorKey]) outZ[actorKey] = z[actorKey] as Zones;
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
    const tr = get().transport;
    if (!tr) return;
    const queue = get().pendingPatches;
    if (!Array.isArray(queue) || queue.length === 0) return;
    let sentAll = true;
    for (const p of queue) {
      try {
        // Sanitize queued patch as we do in trySendPatch
        const actorKey = get().actorKey;
        let toSend: ServerPatchT = p as ServerPatchT;
        const replaceKeysCandidate = Array.isArray(
          (p as ServerPatchT).__replaceKeys
        )
          ? (p as ServerPatchT).__replaceKeys
          : null;
        const isAuthoritativeSnapshot = !!(
          replaceKeysCandidate && replaceKeysCandidate.length > 0
        );
        if (!isAuthoritativeSnapshot) {
          try {
            const sanitized: ServerPatchT = { ...(p as ServerPatchT) };
            if (sanitized.avatars && typeof sanitized.avatars === "object") {
              const out: Partial<GameState["avatars"]> = {};
              const keys = Object.keys(sanitized.avatars).filter(
                (k) => k === "p1" || k === "p2"
              ) as PlayerKey[];
              if (actorKey === "p1" || actorKey === "p2") {
                const k = actorKey as PlayerKey;
                if (keys.includes(k)) {
                  const v = (sanitized.avatars as GameState["avatars"])[k] as
                    | AvatarState
                    | undefined;
                  if (v && typeof v === "object") {
                    const rest = {
                      ...(v as unknown as Record<string, unknown>),
                    };
                    delete (rest as Record<string, unknown>)["tapped"];
                    (out as Record<string, unknown>)[k] = rest as unknown;
                  }
                }
              } else {
                for (const k of keys) {
                  const v = (sanitized.avatars as GameState["avatars"])[k];
                  if (!v || typeof v !== "object") continue;
                  const rest = { ...(v as Record<string, unknown>) };
                  delete rest.tapped;
                  (out as Record<string, unknown>)[k] = rest as unknown;
                }
              }
              if (Object.keys(out).length > 0) {
                sanitized.avatars = out as GameState["avatars"];
              } else {
                delete (sanitized as unknown as { avatars?: unknown }).avatars;
              }
            }
            if (sanitized.zones && typeof sanitized.zones === "object") {
              if (actorKey === "p1" || actorKey === "p2") {
                const z = sanitized.zones as Partial<Record<PlayerKey, Zones>>;
                const outZ: Partial<Record<PlayerKey, Zones>> = {};
                if (z[actorKey]) outZ[actorKey] = z[actorKey] as Zones;
                if (Object.keys(outZ).length > 0) {
                  sanitized.zones = outZ as GameState["zones"];
                } else {
                  delete (sanitized as unknown as { zones?: unknown }).zones;
                }
              } else {
                // Drop zones on unknown actor for queued patches as well
                try {
                  console.warn(
                    "[net] flushPendingPatches: dropping zones until actorKey is set",
                    { keys: Object.keys(sanitized.zones) }
                  );
                } catch {}
                delete (sanitized as unknown as { zones?: unknown }).zones;
              }
            }
            toSend = sanitized;
          } catch {}
        }
        if (process.env.NODE_ENV !== "production") {
          try {
            if (toSend.avatars && typeof toSend.avatars === "object") {
              console.debug("[net] flushPendingPatches avatars ->", {
                actorKey,
                avatars: toSend.avatars,
              });
            }
          } catch {}
        }
        // Send each patch
        tr.sendAction(toSend);
      } catch (err) {
        sentAll = false;
        try {
          console.warn(`[net] Flush failed: ${String(err)}`);
        } catch {}
        break;
      }
    }
    if (sentAll) set({ pendingPatches: [] });
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
      const e = { id: nextId, ts: Date.now(), text };
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

  // Apply an incremental server patch into the store.
  // - Only whitelisted game-state fields are updated
  // - Arrays are replaced; objects are deep-merged
  // - UI/transient fields (drag, dialogs, selection, overlays, camera, history) are untouched
  applyServerPatch: (patch, t) =>
    set((s) => {
      if (!patch || typeof patch !== "object") return s as GameState;
      if (typeof t === "number" && t < (s.lastServerTs ?? 0))
        return s as GameState;

      const p = patch as ServerPatchT;
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
      if (p.phase !== undefined) {
        next.phase = p.phase;
      }
      if (p.d20Rolls !== undefined) {
        next.d20Rolls = replaceKeys.has("d20Rolls")
          ? p.d20Rolls
          : deepMergeReplaceArrays(s.d20Rolls, p.d20Rolls);
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
      if (p.matchEnded !== undefined) {
        next.matchEnded = !!p.matchEnded;
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
          : deepMergeReplaceArrays(s.permanents, p.permanents);
        next.permanents = dedupePermanents(source) as GameState["permanents"];
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

      const lastTs =
        typeof t === "number" ? Math.max(s.lastServerTs ?? 0, t) : Date.now();
      const extra: Partial<GameState> = {};
      if (replaceKeys.size > 0) {
        // Authoritative snapshot: drop any queued patches to avoid reapplying stale actions
        try {
          console.debug(
            "[net] applyServerPatch: clearing pendingPatches due to snapshot"
          );
        } catch {}
        extra.pendingPatches = [] as unknown as GameState["pendingPatches"];
        // Also clear transient selections to avoid UI referencing stale indices
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
      return {
        ...s,
        ...next,
        ...extra,
        lastServerTs: lastTs,
      } as Partial<GameState> as GameState;
    }),

  // Apply a replay patch (simplified version without server communication or timestamps)
  applyPatch: (patch) =>
    set((s) => {
      if (!patch || typeof patch !== "object") return s as GameState;

      const p = patch as ServerPatchT;
      const next: Partial<GameState> = {};

      if (p.players !== undefined) {
        next.players = deepMergeReplaceArrays(s.players, p.players);
      }
      if (p.currentPlayer !== undefined) {
        next.currentPlayer = p.currentPlayer;
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
        next.board = deepMergeReplaceArrays(s.board, p.board);
      }
      if (p.zones !== undefined) {
        next.zones = deepMergeReplaceArrays(s.zones, p.zones);
      }
      if (p.avatars !== undefined) {
        next.avatars = deepMergeReplaceArrays(s.avatars, p.avatars);
      }
      if (p.permanents !== undefined) {
        next.permanents = deepMergeReplaceArrays(s.permanents, p.permanents);
      }
      if (p.mulligans !== undefined) {
        next.mulligans = deepMergeReplaceArrays(s.mulligans, p.mulligans);
      }
      if (p.mulliganDrawn !== undefined) {
        next.mulliganDrawn = deepMergeReplaceArrays(
          s.mulliganDrawn,
          p.mulliganDrawn
        );
      }
      if (p.permanentPositions !== undefined) {
        next.permanentPositions = deepMergeReplaceArrays(
          s.permanentPositions,
          p.permanentPositions
        );
      }
      if (p.permanentAbilities !== undefined) {
        next.permanentAbilities = deepMergeReplaceArrays(
          s.permanentAbilities,
          p.permanentAbilities
        );
      }
      if (p.sitePositions !== undefined) {
        next.sitePositions = deepMergeReplaceArrays(
          s.sitePositions,
          p.sitePositions
        );
      }
      if (p.playerPositions !== undefined) {
        next.playerPositions = deepMergeReplaceArrays(
          s.playerPositions,
          p.playerPositions
        );
      }
      if (p.events !== undefined) {
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
      } else if (p.eventSeq !== undefined) {
        next.eventSeq = Math.max(s.eventSeq, Number(p.eventSeq) || 0);
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
      const card = {
        cardId: newTokenInstanceId(def),
        variantId: null,
        name: def.name,
        type: "Token",
        slug: tokenSlug(def),
        thresholds: null,
      } as CardRef;
      hand.push(card);
      get().log(`${who.toUpperCase()} adds token '${def.name}' to hand`);
      const zonesNext = {
        ...s.zones,
        [who]: { ...s.zones[who], hand },
      } as GameState["zones"];
      {
        const tr = get().transport;
        if (tr) {
          const patch: ServerPatchT = { zones: zonesNext };
          get().trySendPatch(patch);
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
      list[index] = { ...token, attachedTo: { at, index: targetIdx } };
      per[at] = list;
      get().log(`Attached token '${token.card.name}' to permanent at ${at}`);
      {
        const patch: ServerPatchT = {
          permanents: per as GameState["permanents"],
        };
        get().trySendPatch(patch);
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
      list[tokenIndex] = { ...token, attachedTo: { at, index: targetIndex } };
      per[at] = list;
      get().log(
        `Attached token '${token.card.name}' to permanent '${target.card.name}' at ${at}`
      );
      {
        const patch: ServerPatchT = {
          permanents: per as GameState["permanents"],
        };
        get().trySendPatch(patch);
      }
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
      const next = { ...cur, counters: nextCount } as PermanentItem;
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
      {
        const patch: ServerPatchT = {
          permanents: per as GameState["permanents"],
        };
        get().trySendPatch(patch);
      }
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  incrementPermanentCounter: (at, index) =>
    set((s) => {
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[at] || [])];
      const cur = arr[index];
      if (!cur) return s;
      const nextCount = Math.max(1, Number(cur.counters || 0) + 1);
      arr[index] = { ...cur, counters: nextCount } as PermanentItem;
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
      {
        const patch: ServerPatchT = {
          permanents: per as GameState["permanents"],
        };
        get().trySendPatch(patch);
      }
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
        const next = { ...cur } as PermanentItem;
        delete (next as { counters?: number }).counters;
        arr[index] = next;
        per[at] = arr;
        const cell = at.split(",");
        const x = Number(cell[0] || 0);
        const y = Number(cell[1] || 0);
        const cellNo = y * s.board.size.w + x + 1;
        get().log(`Removed counter from '${cur.card.name}' at #${cellNo}`);
      } else {
        const nextCount = curCount - 1;
        arr[index] = { ...cur, counters: nextCount } as PermanentItem;
        per[at] = arr;
        // Log decrement
        const cell = at.split(",");
        const x = Number(cell[0] || 0);
        const y = Number(cell[1] || 0);
        const cellNo = y * s.board.size.w + x + 1;
        get().log(
          `Decremented counter on '${cur.card.name}' at #${cellNo} (now ${nextCount})`
        );
      }
      {
        const patch: ServerPatchT = {
          permanents: per as GameState["permanents"],
        };
        get().trySendPatch(patch);
      }
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  clearPermanentCounter: (at, index) =>
    set((s) => {
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[at] || [])];
      const cur = arr[index];
      if (!cur || cur.counters == null) return s;
      const next = { ...cur } as PermanentItem;
      delete (next as { counters?: number }).counters;
      arr[index] = next;
      per[at] = arr;
      const cell = at.split(",");
      const x = Number(cell[0] || 0);
      const y = Number(cell[1] || 0);
      const cellNo = y * s.board.size.w + x + 1;
      get().log(`Removed counter from '${cur.card.name}' at #${cellNo}`);
      {
        const patch: ServerPatchT = {
          permanents: per as GameState["permanents"],
        };
        get().trySendPatch(patch);
      }
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  detachToken: (at, index) =>
    set((s) => {
      const token = (s.permanents[at] || [])[index];
      if (!token) return s;
      const per: Permanents = { ...s.permanents };
      const list = [...(per[at] || [])];
      list[index] = { ...token, attachedTo: null };
      per[at] = list;
      get().log(`Detached token '${token.card.name}'`);
      {
        const patch: ServerPatchT = {
          permanents: per as GameState["permanents"],
        };
        get().trySendPatch(patch);
      }
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
    return computeAvailableMana(s.board, s.permanents, who);
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
      const currentMana = s.players[who].mana;
      const newMana = Math.max(0, currentMana + delta);
      if (newMana === currentMana) return s as GameState;

      const newState = {
        players: {
          ...s.players,
          [who]: {
            ...s.players[who],
            mana: newMana,
          },
        },
      } as Partial<GameState> as GameState;

      // Send patch to other players in multiplayer
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
    // On new turn start: untap all sites of the active player and clear selection
    if (passTurn) {
      const nextPlayer = s.currentPlayer === 1 ? 2 : 1;
      // Sites do not tap in Sorcery; do not modify board.sites.tapped
      // Untap all permanents owned by the next player
      const permanents: Permanents = { ...s.permanents };
      for (const cellKey of Object.keys(permanents)) {
        const cellPermanents = permanents[cellKey] || [];
        permanents[cellKey] = cellPermanents.map((permanent) =>
          permanent.owner === nextPlayer
            ? { ...permanent, tapped: false }
            : permanent
        );
      }

      // Untap the next player's avatar
      const nextKey = (nextPlayer === 1 ? "p1" : "p2") as PlayerKey;
      const avatarsNext = {
        ...s.avatars,
        [nextKey]: { ...s.avatars[nextKey], tapped: false },
      } as GameState["avatars"];

      {
        // Server is authoritative for start-of-turn untaps (permanents and avatar).
        // Only send phase/currentPlayer; server will broadcast the full authoritative patch.
        const patch: ServerPatchT = {
          phase: nextPhase,
          currentPlayer: nextPlayer,
        };
        get().trySendPatch(patch);
      }
      set({
        phase: nextPhase,
        currentPlayer: nextPlayer,
        permanents,
        avatars: avatarsNext,
        selectedCard: null,
      });
      get().log(`Turn passes to P${nextPlayer}`);
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
    get().pushHistory();
    const cur = s.currentPlayer;
    get().log(`P${cur} ends the turn`);
    const nextPlayer = cur === 1 ? 2 : 1;

    // Untap all permanents owned by the next player
    const permanents: Permanents = { ...s.permanents };
    for (const cellKey of Object.keys(permanents)) {
      const cellPermanents = permanents[cellKey] || [];
      permanents[cellKey] = cellPermanents.map((permanent) =>
        permanent.owner === nextPlayer
          ? { ...permanent, tapped: false }
          : permanent
      );
    }

    // Untap the next player's avatar
    const nextKey = (nextPlayer === 1 ? "p1" : "p2") as PlayerKey;
    const avatarsNext = {
      ...s.avatars,
      [nextKey]: { ...s.avatars[nextKey], tapped: false },
    } as GameState["avatars"];

    {
      // Server will compute start-of-turn untaps. Send only phase/currentPlayer.
      const patch: ServerPatchT = {
        phase: "Main",
        currentPlayer: nextPlayer,
      };
      get().trySendPatch(patch);
    }
    set({
      phase: "Main",
      currentPlayer: nextPlayer,
      permanents,
      avatars: avatarsNext,
      selectedCard: null,
      selectedPermanent: null,
    });

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
      const sub = {
        ...s.zones[who],
        spellbook: [...spellbook],
        atlas: [...atlas],
        hand: [],
        graveyard: [],
        battlefield: [],
        banished: [],
      };
      const zonesNext = { ...s.zones, [who]: sub } as GameState["zones"];
      {
        const tr = get().transport;
        if (tr) {
          // Send only my seat to avoid wiping opponent zones on the server
          const patch: ServerPatchT = { zones: { [who]: sub } as unknown as GameState["zones"] };
          get().trySendPatch(patch);
        }
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  shuffleSpellbook: (who) =>
    set((s) => {
      const pile = [...s.zones[who].spellbook];
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
          const patch: ServerPatchT = { zones: { [who]: zonesNext[who] } as unknown as GameState["zones"] };
          get().trySendPatch(patch);
        }
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  shuffleAtlas: (who) =>
    set((s) => {
      const pile = [...s.zones[who].atlas];
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
          const patch: ServerPatchT = { zones: { [who]: zonesNext[who] } as unknown as GameState["zones"] };
          get().trySendPatch(patch);
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
          ? [...s.zones[who].spellbook]
          : [...s.zones[who].atlas];
      const hand = [...s.zones[who].hand];
      for (let i = 0; i < count; i++) {
        const c = pile.shift();
        if (!c) break;
        hand.push(c);
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
          const patch: ServerPatchT = { zones: { [who]: zonesNext[who] } as unknown as GameState["zones"] };
          get().trySendPatch(patch);
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
          ? [...s.zones[who].spellbook]
          : [...s.zones[who].atlas];
      const hand = [...s.zones[who].hand];

      for (let i = 0; i < count; i++) {
        const c = pile.pop();
        if (!c) break;
        hand.push(c);
      }

      const updated =
        from === "spellbook" ? { spellbook: pile } : { atlas: pile };
      get().log(`${who.toUpperCase()} draws ${count} from bottom of ${from}`);

      // Broadcast as a zones patch if online
      {
        const tr = get().transport;
        if (tr) {
          const seatZones = { ...s.zones[who], ...updated, hand } as Zones;
          const patch: ServerPatchT = { zones: { [who]: seatZones } as unknown as GameState["zones"] };
          get().trySendPatch(patch);
        }
      }

      return {
        zones: { ...s.zones, [who]: { ...s.zones[who], ...updated, hand } },
      } as Partial<GameState> as GameState;
    }),

  drawOpening: (who, spellbookCount?: number, atlasCount?: number) =>
    set((s) => {
      get().pushHistory();

      const isSpellslinger =
        (s.avatars[who]?.card?.name || "").toLowerCase() === "spellslinger";
      const sbCount = spellbookCount ?? (isSpellslinger ? 4 : 3);
      const atCount = atlasCount ?? 3;
      const sb = [...s.zones[who].spellbook];
      const at = [...s.zones[who].atlas];
      const hand = [...s.zones[who].hand];
      for (let i = 0; i < sbCount; i++) {
        const c = sb.shift();
        if (!c) break;
        hand.push(c);
      }
      for (let i = 0; i < atCount; i++) {
        const c = at.shift();
        if (!c) break;
        hand.push(c);
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
          const patch: ServerPatchT = { zones: { [who]: zonesNext[who] } as unknown as GameState["zones"] };
          get().trySendPatch(patch);
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
          [key]: { owner: s.currentPlayer as 1 | 2, tapped: false, card },
        };
        get().log(
          `${who.toUpperCase()} plays site '${card.name}' at #${cellNo}`
        );
        {
          const tr = get().transport;
          if (tr) {
            const patch: ServerPatchT = {
              zones: {
                ...s.zones,
                [who]: { ...s.zones[who], hand },
              } as GameState["zones"],
              board: { ...s.board, sites } as GameState["board"],
            };
            get().trySendPatch(patch);
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
      arr.push({
        owner: (who === "p1" ? 1 : 2) as 1 | 2,
        card,
        offset: null,
        tilt: randomTilt(),
      });
      per[key] = arr;
      get().log(`${who.toUpperCase()} plays '${card.name}' at #${cellNo}`);

      {
        const tr = get().transport;
        if (tr) {
          const patch: ServerPatchT = {
            zones: {
              ...s.zones,
              [who]: { ...s.zones[who], hand },
            } as GameState["zones"],
            permanents: per as GameState["permanents"],
          };
          get().trySendPatch(patch);
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
        zones: { ...s.zones, [who]: { ...s.zones[who], hand } },
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
        const sites = {
          ...s.board.sites,
          [key]: { owner: s.currentPlayer as 1 | 2, tapped: false, card },
        };
        get().log(
          `${who.toUpperCase()} plays site '${
            card.name
          }' from ${from} at #${cellNo}`
        );
        {
          const tr = get().transport;
          if (tr) {
            const zonesNext = pileName
              ? ({
                  ...s.zones,
                  [who]: { ...z, [pileName]: pile },
                } as GameState["zones"])
              : s.zones;
            const patch: ServerPatchT = {
              zones: zonesNext,
              board: { ...s.board, sites } as GameState["board"],
            };
            get().trySendPatch(patch);
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
          zones: pileName
            ? { ...s.zones, [who]: { ...z, [pileName]: pile } }
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
      arr.push({
        owner: (who === "p1" ? 1 : 2) as 1 | 2,
        card,
        offset: null,
        tilt: randomTilt(),
      });
      per[key] = arr;
      get().log(
        `${who.toUpperCase()} plays '${card.name}' from ${from} at #${cellNo}`
      );

      {
        const tr = get().transport;
        if (tr) {
          const zonesNext =
            from !== "tokens"
              ? ({
                  ...s.zones,
                  [who]: { ...z, [pileName as keyof Zones]: pile },
                } as GameState["zones"])
              : s.zones;
          const patch: ServerPatchT = {
            permanents: per as GameState["permanents"],
            ...(from !== "tokens" ? { zones: zonesNext } : {}),
          };
          get().trySendPatch(patch);
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
        zones:
          from !== "tokens"
            ? ({
                ...s.zones,
                [who]: { ...z, [pileName as keyof Zones]: pile },
              } as GameState["zones"])
            : s.zones,
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
      const pile = [...(z[pileName] as CardRef[])];
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
      const hand = [...z.hand, removed];
      get().log(
        `${who.toUpperCase()} draws '${card.name}' from ${from} to hand`
      );

      return {
        zones: { ...s.zones, [who]: { ...z, [pileName]: pile, hand } },
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
      const targetPile = [...(zones[pile] as CardRef[])];

      // Remove card from hand
      const cardToMove = hand.splice(selectedCard.index, 1)[0];
      if (!cardToMove) {
        get().log(`Card at index ${selectedCard.index} not found in hand`);
        return s;
      }

      // Add to pile at specified position
      if (position === "top") {
        targetPile.unshift(cardToMove);
      } else {
        targetPile.push(cardToMove);
      }

      get().log(
        `${who.toUpperCase()} moves '${
          cardToMove.name
        }' from hand to ${position} of ${pile}`
      );

      return {
        zones: { ...s.zones, [who]: { ...zones, hand, [pile]: targetPile } },
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
      const { per, movedName } = movePermanentCore(
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
          const patch: ServerPatchT = {
            permanents: per as GameState["permanents"],
          };
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
      const { per, movedName } = movePermanentCore(
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
          const patch: ServerPatchT = {
            permanents: per as GameState["permanents"],
          };
          get().trySendPatch(patch);
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
      arr[index] = { ...arr[index], offset };
      per[at] = arr;
      {
        const tr = get().transport;
        if (tr) {
          const patch: ServerPatchT = {
            permanents: per as GameState["permanents"],
          };
          get().trySendPatch(patch);
        }
      }
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
      const next = { ...cur, tapped: !cur.tapped };
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
      {
        const patch: ServerPatchT = {
          permanents: per as GameState["permanents"],
        };
        get().trySendPatch(patch);
      }
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
      if (s.transport && s.actorKey) {
        const ownerKey = (item.owner === 1 ? "p1" : "p2") as PlayerKey;
        if (s.actorKey !== ownerKey) {
          get().log("Cannot move opponent's permanent to a zone");
          return s as GameState;
        }
      }
      per[at] = arr;
      const owner: PlayerKey = item.owner === 1 ? "p1" : "p2";
      const zones = { ...s.zones } as Record<PlayerKey, Zones>;
      const z = { ...zones[owner] };
      if (target === "hand") z.hand = [...z.hand, item.card];
      else if (target === "graveyard")
        z.graveyard = [...z.graveyard, item.card];
      else if (target === "spellbook") {
        const pile = [...z.spellbook];
        if (position === "top") pile.unshift(item.card);
        else pile.push(item.card);
        z.spellbook = pile;
      } else z.banished = [...z.banished, item.card];
      zones[owner] = z;
      const cell = at.split(",");
      const x = Number(cell[0] || 0);
      const y = Number(cell[1] || 0);
      const cellNo = y * s.board.size.w + x + 1;
      const label =
        target === "hand"
          ? "hand"
          : target === "graveyard"
          ? "graveyard"
          : target === "spellbook"
          ? "spellbook"
          : "banished";
      get().log(
        `Moved '${
          item.card.name
        }' from #${cellNo} to ${owner.toUpperCase()} ${label}`
      );
      {
        const patch: ServerPatchT = {
          permanents: per as GameState["permanents"],
          zones: zones as GameState["zones"],
        };
        get().trySendPatch(patch);
      }
      return { permanents: per, zones } as Partial<GameState> as GameState;
    }),

  // Move a site from the board to a target zone
  moveSiteToZone: (x, y, target, position) =>
    set((s) => {
      get().pushHistory();
      const key: CellKey = `${x},${y}`;
      const site = s.board.sites[key];
      if (!site || !site.card) return s;
      // Ownership guard in online play
      if (s.transport && s.actorKey) {
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
      if (target === "hand") z.hand = [...z.hand, site.card];
      else if (target === "graveyard")
        z.graveyard = [...z.graveyard, site.card];
      else if (target === "atlas") {
        const pile = [...z.atlas];
        if (position === "top") pile.unshift(site.card);
        else pile.push(site.card);
        z.atlas = pile;
      } else z.banished = [...z.banished, site.card];
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

  // Transfer control of a permanent at a given cell/index (toggle if 'to' not provided)
  transferPermanentControl: (at, index, to) =>
    set((s) => {
      get().pushHistory();
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[at] || [])];
      const item = arr[index];
      if (!item) return s;
      const fromOwner = item.owner;
      const newOwner: 1 | 2 = to ?? (fromOwner === 1 ? 2 : 1);
      arr[index] = { ...item, owner: newOwner };
      per[at] = arr;
      const cell = at.split(",");
      const x = Number(cell[0] || 0);
      const y = Number(cell[1] || 0);
      const cellNo = y * s.board.size.w + x + 1;
      get().log(
        `Control of '${item.card.name}' at #${cellNo} transferred to P${newOwner}`
      );
      {
        const patch: ServerPatchT = {
          permanents: per as GameState["permanents"],
        };
        get().trySendPatch(patch);
      }
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  // Transfer control of a site at a given x,y (toggle if 'to' not provided)
  transferSiteControl: (x, y, to) =>
    set((s) => {
      get().pushHistory();
      const key: CellKey = `${x},${y}`;
      const site = s.board.sites[key];
      if (!site) return s;
      const fromOwner = site.owner;
      const newOwner: 1 | 2 = to ?? (fromOwner === 1 ? 2 : 1);
      const sites = { ...s.board.sites, [key]: { ...site, owner: newOwner } };
      const cellNo = y * s.board.size.w + x + 1;
      const name = site.card?.name || `Site #${cellNo}`;
      get().log(
        `Control of '${name}' at #${cellNo} transferred to P${newOwner}`
      );
      {
        const boardNext = { ...s.board, sites } as GameState["board"];
        const patch: ServerPatchT = { board: boardNext };
        get().trySendPatch(patch);
      }
      return {
        board: { ...s.board, sites },
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
      const avatars = buildAvatarUpdate(
        s,
        who,
        [x, y] as [number, number],
        null
      );
      get().log(`${who.toUpperCase()} moves Avatar to #${cellNo}`);
      {
        const tr = get().transport;
        if (tr) {
          const patch: ServerPatchT = {
            avatars: {
              [who]: { pos: [x, y] as [number, number], offset: null },
            } as GameState["avatars"],
          };
          get().trySendPatch(patch);
        }
      }
      return { avatars } as Partial<GameState> as GameState;
    }),

  moveAvatarToWithOffset: (who, x, y, offset) =>
    set((s) => {
      get().pushHistory();
      const w = s.board.size.w;
      const cellNo = y * w + x + 1;
      const avatars = buildAvatarUpdate(
        s,
        who,
        [x, y] as [number, number],
        offset
      );
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
          get().trySendPatch(patch);
        }
      }
      return { avatars } as Partial<GameState> as GameState;
    }),

  setAvatarOffset: (who, offset) =>
    set((s) => {
      const cur = s.avatars[who];
      if (!cur) return s;
      const avatarsNext = {
        ...s.avatars,
        [who]: { ...cur, offset },
      } as GameState["avatars"];
      {
        const tr = get().transport;
        if (tr) {
          // Only send the acting seat's offset change
          const patch: ServerPatchT = {
            avatars: { [who]: { offset } } as GameState["avatars"],
          };
          get().trySendPatch(patch);
        }
      }
      return { avatars: avatarsNext } as Partial<GameState> as GameState;
    }),

  toggleTapAvatar: (who) =>
    set((s) => {
      get().pushHistory();
      // Owner-only
      if (s.actorKey && s.actorKey !== who) {
        get().log(`Cannot change tap on opponent avatar`);
        return s as GameState;
      }
      const cur = s.avatars[who];
      const next = { ...cur, tapped: !cur.tapped };
      get().log(
        `${who.toUpperCase()} ${next.tapped ? "taps" : "untaps"} Avatar`
      );
      const avatarsNext = { ...s.avatars, [who]: next } as GameState["avatars"];
      // Only send tapped field for the acting seat
      const patch: ServerPatchT = {
        avatars: { [who]: { tapped: next.tapped } } as GameState["avatars"],
      };
      get().trySendPatch(patch);
      return { avatars: avatarsNext } as Partial<GameState> as GameState;
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
      const isSpellslinger =
        (s.avatars[who]?.card?.name || "").toLowerCase() === "spellslinger";
      const sbCount = isSpellslinger ? 4 : 3;
      const atCount = 3;
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
      };
      return reset as GameState;
    }),
}));
