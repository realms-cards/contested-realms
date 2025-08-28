import { create } from "zustand";
import type { GameTransport } from "@/lib/net/transport";

export type Phase = "Setup" | "Start" | "Draw" | "Main" | "Combat" | "End";
export type PlayerKey = "p1" | "p2";

export type Thresholds = {
  air: number;
  water: number;
  earth: number;
  fire: number;
};

export type LifeState = 'alive' | 'dd' | 'dead';

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
};
export type Permanents = Record<CellKey, PermanentItem[]>;

// Context menu targeting for click-driven actions
export type ContextMenuTarget =
  | { kind: "site"; x: number; y: number }
  | { kind: "permanent"; at: CellKey; index: number }
  | { kind: "avatar"; who: PlayerKey }
  | { kind: "pile"; who: PlayerKey; from: "spellbook" | "atlas" | "graveyard" };

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
  lastServerTs: number;
  // Multiplayer transport (null => offline)
  transport: GameTransport | null;
  setTransport: (t: GameTransport | null) => void;
  // Match end detection
  matchEnded: boolean;
  winner: PlayerKey | null;
  checkMatchEnd: () => void;
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
  moveCardFromHandToPile: (who: PlayerKey, pile: "spellbook" | "atlas", position: "top" | "bottom") => void;
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
  // Events / console
  events: GameEvent[];
  eventSeq: number;
  log: (text: string) => void;
  // UI cross-surface drag state
  dragFromHand: boolean;
  dragFromPile: {
    who: PlayerKey;
    from: "spellbook" | "atlas" | "graveyard";
    card: CardRef | null;
  } | null;
  setDragFromHand: (on: boolean) => void;
  setDragFromPile: (
    info: {
      who: PlayerKey;
      from: "spellbook" | "atlas" | "graveyard";
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
  // Derived selectors (pure getters)
  getPlayerSites: (who: PlayerKey) => Array<[CellKey, SiteTile]>;
  getUntappedSitesCount: (who: PlayerKey) => number;
  getAvailableMana: (who: PlayerKey) => number; // default: 1 per untapped site
  // History / Undo
  history: SerializedGame[];
  pushHistory: () => void;
  undo: () => void;
};

const phases: Phase[] = ["Setup", "Start", "Draw", "Main", "Combat", "End"];

export type GameEvent = { id: number; ts: number; text: string };

// Snapshot of serializable game state we can restore on undo
export type SerializedGame = {
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
  events: GameState["events"];
  eventSeq: GameState["eventSeq"];
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
  const item = fromArr.splice(index, 1)[0]!;
  const toArr = [...(per[toKey] || [])];
  // When newOffset is null, keep existing offset; when provided, set it.
  // For tilt: if item has none, assign a random one on move; otherwise keep.
  const toPush: PermanentItem =
    newOffset == null
      ? item.tilt == null
        ? { ...item, tilt: randomTilt() }
        : item
      : { ...item, offset: newOffset, tilt: item.tilt ?? randomTilt() };
  toArr.push(toPush);
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

  const baseObj = (base && typeof base === "object" && !Array.isArray(base))
    ? (base as Record<string, unknown>)
    : {} as Record<string, unknown>;
  const out: Record<string, unknown> = { ...baseObj };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const cur = out[k];
    out[k] = deepMergeReplaceArrays(cur as unknown, v as unknown) as unknown;
  }
  return out as unknown as T;
}

export const useGameStore = create<GameState>((set, get) => ({
  players: {
    p1: {
      life: 20,
      lifeState: 'alive',
      mana: 0,
      thresholds: { air: 0, water: 0, earth: 0, fire: 0 },
    },
    p2: {
      life: 20,
      lifeState: 'alive',
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
  // Multiplayer transport (injected by online play UI)
  transport: null,
  // Match end state
  matchEnded: false,
  winner: null,
  setTransport: (t) => {
    set({ transport: t });
    if (t) {
      try {
        get().flushPendingPatches();
      } catch {}
    }
  },
  // Pending patches queue for offline/error cases
  pendingPatches: [],
  // Centralized, safe patch sender. Returns true if sent immediately, false if queued.
  trySendPatch: (patch) => {
    const tr = get().transport;
    if (!patch || typeof patch !== "object") return false;
    if (!tr) {
      set((s) => ({ pendingPatches: [...s.pendingPatches, patch] }));
      get().log("Transport unavailable: queued patch");
      return false;
    }
    try {
      tr.sendAction(patch);
      return true;
    } catch (err) {
      set((s) => ({ pendingPatches: [...s.pendingPatches, patch] }));
      get().log(`Send failed, queued patch: ${String(err)}`);
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
        tr.sendAction(p);
      } catch (err) {
        get().log(`Flush failed: ${String(err)}`);
        sentAll = false;
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
    if (p1LifeState === 'dead' && p2LifeState !== 'dead') {
      set({ matchEnded: true, winner: 'p2' });
      const patch = { matchEnded: true, winner: 'p2' as PlayerKey };
      get().trySendPatch(patch);
      return;
    }
    if (p2LifeState === 'dead' && p1LifeState !== 'dead') {
      set({ matchEnded: true, winner: 'p1' });
      const patch = { matchEnded: true, winner: 'p1' as PlayerKey };
      get().trySendPatch(patch);
      return;
    }
    if (p1LifeState === 'dead' && p2LifeState === 'dead') {
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
  zones: {
    p1: {
      spellbook: [],
      atlas: [],
      hand: [],
      graveyard: [],
      battlefield: [],
      banished: [],
    },
    p2: {
      spellbook: [],
      atlas: [],
      hand: [],
      graveyard: [],
      battlefield: [],
      banished: [],
    },
  },
  selectedCard: null,
  selectedPermanent: null,
  selectedAvatar: null,
  // Hand visibility state
  mouseInHandZone: false,
  handHoverCount: 0,
  avatars: {
    p1: { card: null, pos: null, tapped: false },
    p2: { card: null, pos: null, tapped: false },
  },
  permanents: {},
  // UI state
  dragFromHand: false,
  dragFromPile: null,
  hoverCell: null,
  previewCard: null,
  contextMenu: null,
  history: [],
  // Mulligans
  mulligans: { p1: 1, p2: 1 },
  mulliganDrawn: { p1: [], p2: [] },
  // Events
  events: [],
  eventSeq: 0,
  log: (text: string) =>
    set((s) => ({
      events: [...s.events, { id: s.eventSeq + 1, ts: Date.now(), text }],
      eventSeq: s.eventSeq + 1,
    })),

  // Apply an incremental server patch into the store.
  // - Only whitelisted game-state fields are updated
  // - Arrays are replaced; objects are deep-merged
  // - UI/transient fields (drag, dialogs, selection, overlays, camera, history) are untouched
  applyServerPatch: (patch, t) =>
    set((s) => {
      if (!patch || typeof patch !== "object") return s as GameState;
      if (typeof t === "number" && t < (s.lastServerTs ?? 0)) return s as GameState;

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
        next.mulliganDrawn = deepMergeReplaceArrays(s.mulliganDrawn, p.mulliganDrawn);
      }
      if (p.events !== undefined) {
        next.events = deepMergeReplaceArrays(s.events, p.events);
      }
      if (p.eventSeq !== undefined) {
        next.eventSeq = Number(p.eventSeq) || s.eventSeq;
      }

      if (typeof t === "number") next.lastServerTs = Math.max(s.lastServerTs ?? 0, t);
      return next as Partial<GameState> as GameState;
    }),

  // History helpers
  pushHistory: () =>
    set((s) => {
      const snap: SerializedGame = {
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
        events: JSON.parse(JSON.stringify(s.events)),
        eventSeq: s.eventSeq,
      };
      const nextHist = [...s.history, snap];
      if (nextHist.length > 10) nextHist.shift();
      return { history: nextHist } as Partial<GameState> as GameState;
    }),
  undo: () =>
    set((s) => {
      if (!s.history.length) return s as GameState;
      const nextHist = [...s.history];
      const prev = nextHist.pop()!;
      return {
        history: nextHist,
        // restore snapshot
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
  openPlacementDialog: (cardName, pileName, onPlace) => set({ placementDialog: { cardName, pileName, onPlace } }),
  closePlacementDialog: () => set({ placementDialog: null }),
  searchDialog: null,
  openSearchDialog: (pileName, cards, onSelectCard) => {
    set({ searchDialog: { pileName, cards, onSelectCard } });
    get().log(`Viewing ${pileName} (${cards.length} cards)`);
  },
  closeSearchDialog: () => set({ searchDialog: null }),

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
    const owner = who === "p1" ? 1 : 2;
    // Default rule: each untapped site provides 1 mana
    return Object.values(s.board.sites).filter(
      (st) => st.owner === owner && !st.tapped
    ).length;
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
        if (currentLifeState === 'alive') {
          newLife = 0;
          newLifeState = 'dd'; // Death's Door
        } else if (currentLifeState === 'dd') {
          newLife = 0;
          newLifeState = 'dead'; // Death
        }
      } else if (newLife > 0 && currentLifeState === 'dd') {
        // Recovering from Death's Door
        newLifeState = 'alive';
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
        const changeText = delta > 0 ? `gains ${delta}` : `loses ${Math.abs(delta)}`;
        get().log(`${who.toUpperCase()} ${changeText} life (${currentLife} → ${newLife})`);
      }
      
      // Log state transitions
      if (currentLifeState !== newLifeState) {
        if (newLifeState === 'dd') {
          get().log(`${who.toUpperCase()} enters Death's Door!`);
        } else if (newLifeState === 'alive' && currentLifeState === 'dd') {
          get().log(`${who.toUpperCase()} recovers from Death's Door`);
        } else if (newLifeState === 'dead') {
          get().log(`${who.toUpperCase()} has died! Match ended.`);
        }
      }
      
      // Check for match end after state update
      setTimeout(() => get().checkMatchEnd(), 0);
      
      return newState;
    }),

  addMana: (who, delta) =>
    set((s) => ({
      players: {
        ...s.players,
        [who]: {
          ...s.players[who],
          mana: Math.max(0, s.players[who].mana + delta),
        },
      },
    })),

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
        const elementEmoji = element === 'fire' ? '🔥' : element === 'water' ? '💧' : element === 'earth' ? '🌍' : '💨';
        get().log(`${who.toUpperCase()} ${changeText} ${Math.abs(delta)} ${elementEmoji} ${element} threshold (${currentThreshold} → ${newThreshold})`);
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
      const sites: Record<CellKey, SiteTile> = { ...s.board.sites };
      for (const key of Object.keys(sites)) {
        if (sites[key].owner === nextPlayer)
          sites[key] = { ...sites[key], tapped: false };
      }
      {
        const patch: ServerPatchT = {
          phase: nextPhase,
          currentPlayer: nextPlayer,
          board: { ...s.board, sites } as GameState["board"],
        };
        get().trySendPatch(patch);
      }
      set({
        phase: nextPhase,
        currentPlayer: nextPlayer,
        board: { ...s.board, sites },
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

    // Untap next player's sites
    const sites: Record<CellKey, SiteTile> = { ...s.board.sites };
    for (const key of Object.keys(sites)) {
      if (sites[key].owner === nextPlayer)
        sites[key] = { ...sites[key], tapped: false };
    }

    {
      const patch: ServerPatchT = {
        phase: "Main",
        currentPlayer: nextPlayer,
        board: { ...s.board, sites } as GameState["board"],
      };
      get().trySendPatch(patch);
    }
    set({
      phase: "Main",
      currentPlayer: nextPlayer,
      board: { ...s.board, sites },
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
      // If tie, re-roll automatically
      if (newRolls.p1 === newRolls.p2) {
        get().log(`Both players rolled ${newRolls.p1}! Rolling again...`);
        set({ d20Rolls: { p1: null, p2: null } });
        return;
      }
      
      const patch: ServerPatchT = {
        d20Rolls: newRolls,
        setupWinner: winner,
      };
      get().trySendPatch(patch);
      set({ d20Rolls: newRolls, setupWinner: winner });
      get().log(`Player ${newRolls.p1 > newRolls.p2 ? "1" : "2"} wins the roll (${newRolls.p1 > newRolls.p2 ? newRolls.p1 : newRolls.p2} vs ${newRolls.p1 > newRolls.p2 ? newRolls.p2 : newRolls.p1})!`);
    } else {
      const patch: ServerPatchT = { d20Rolls: newRolls };
      get().trySendPatch(patch);
      set({ d20Rolls: newRolls });
      get().log(`Player ${who === "p1" ? "1" : "2"} rolled a ${roll}`);
    }
  },

  choosePlayerOrder: (winner, wantsToGoFirst) => {
    const firstPlayer = wantsToGoFirst ? (winner === "p1" ? 1 : 2) : (winner === "p1" ? 2 : 1);
    
    const patch: ServerPatchT = {
      phase: "Start",
      currentPlayer: firstPlayer,
    };
    get().trySendPatch(patch);
    set({ phase: "Start", currentPlayer: firstPlayer });
    
    const winnerNum = winner === "p1" ? 1 : 2;
    const choiceText = wantsToGoFirst ? "goes first" : "goes second";
    get().log(`Player ${winnerNum} chooses to ${choiceText}. Player ${firstPlayer} starts!`);
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
      get().pushHistory();
      const key: CellKey = `${x},${y}`;
      const site = s.board.sites[key];
      if (!site) return s;
      const next = { ...site, tapped: !site.tapped };
      const cellNo = y * s.board.size.w + x + 1;
      get().log(`Site #${cellNo} ${next.tapped ? "tapped" : "untapped"}`);
      const boardNext = { ...s.board, sites: { ...s.board.sites, [key]: next } } as GameState["board"];
      {
        const patch: ServerPatchT = { board: boardNext };
        get().trySendPatch(patch);
      }
      return {
        board: boardNext,
      } as GameState;
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
          const patch: ServerPatchT = { zones: zonesNext };
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
      const zonesNext = { ...s.zones, [who]: { ...s.zones[who], spellbook: pile } } as GameState["zones"];
      {
        const tr = get().transport;
        if (tr) {
          const patch: ServerPatchT = { zones: zonesNext };
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
      const zonesNext = { ...s.zones, [who]: { ...s.zones[who], atlas: pile } } as GameState["zones"];
      {
        const tr = get().transport;
        if (tr) {
          const patch: ServerPatchT = { zones: zonesNext };
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
      return {
        zones: { ...s.zones, [who]: { ...s.zones[who], ...updated, hand } },
      };
    }),

  drawOpening: (who, spellbookCount?: number, atlasCount?: number) =>
    set((s) => {
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
          const patch: ServerPatchT = { zones: zonesNext };
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
    set({ selectedAvatar: who, selectedCard: null, selectedPermanent: null, previewCard: null }),

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
      const isCurrent = (who === "p1" ? 1 : 2) === s.currentPlayer;
      if (!isCurrent) {
        get().log(
          `Cannot play '${
            card.name
          }': ${who.toUpperCase()} is not the current player`
        );
        return s;
      }
      const type = (card.type || "").toLowerCase();
      // For non-site cards only: warn if thresholds are missing. Sites never cost thresholds.
      if (!type.includes("site")) {
        const req = (card.thresholds || {}) as Partial<
          Record<keyof Thresholds, number>
        >;
        const have = s.players[who].thresholds;
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
            `Warning: '${card.name}' missing thresholds (${miss.join(", ")})`
          );
      }

      // Only non-sites restricted to Main phase
      if (!type.includes("site") && s.phase !== "Main") {
        get().log(`Cannot play '${card.name}' during ${s.phase} phase`);
        return s;
      }

      get().pushHistory();

      // Remove from hand
      const hand = [...s.zones[who].hand];
      hand.splice(index, 1);

      const key: CellKey = `${x},${y}`;
      const cellNo = y * s.board.size.w + x + 1;

      if (type.includes("site")) {
        if (s.board.sites[key]) {
          get().log(
            `Cannot play site '${card.name}': #${cellNo} already occupied`
          );
          return s; // occupied
        }
        // Auto-add thresholds provided by this site
        const add: Partial<Thresholds> = {};
        const req = (card.thresholds || {}) as Partial<
          Record<keyof Thresholds, number>
        >;
        for (const kk of Object.keys(req) as (keyof Thresholds)[]) {
          if (s.players[who].thresholds[kk] != null) {
            add[kk] = Number(req[kk] ?? 0);
          }
        }
        const curP = s.players[who];
        const nextP: PlayerState = {
          ...curP,
          thresholds: {
            ...curP.thresholds,
            air: (curP.thresholds.air || 0) + (add.air || 0),
            water: (curP.thresholds.water || 0) + (add.water || 0),
            earth: (curP.thresholds.earth || 0) + (add.earth || 0),
            fire: (curP.thresholds.fire || 0) + (add.fire || 0),
          },
        };
        const sites = {
          ...s.board.sites,
          [key]: { owner: s.currentPlayer as 1 | 2, tapped: false, card },
        };
        get().log(
          `${who.toUpperCase()} plays site '${card.name}' at #${cellNo}${
            Object.keys(add).length ? " (thresholds updated)" : ""
          }`
        );
        {
          const tr = get().transport;
          if (tr) {
            const patch: ServerPatchT = {
              players: { ...s.players, [who]: nextP } as GameState["players"],
              zones: { ...s.zones, [who]: { ...s.zones[who], hand } } as GameState["zones"],
              board: { ...s.board, sites } as GameState["board"],
            };
            get().trySendPatch(patch);
          }
        }
        return {
          players: { ...s.players, [who]: nextP },
          zones: { ...s.zones, [who]: { ...s.zones[who], hand } },
          board: { ...s.board, sites },
          selectedCard: null,
          selectedPermanent: null,
        } as Partial<GameState> as GameState;
      }

      // Non-site permanent: place on tile
      const per: Permanents = { ...s.permanents };
      const arr = per[key] ? [...per[key]!] : [];
      arr.push({
        owner: s.currentPlayer as 1 | 2,
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
            zones: { ...s.zones, [who]: { ...s.zones[who], hand } } as GameState["zones"],
            permanents: per as GameState["permanents"],
          };
          get().trySendPatch(patch);
        }
      }

      return {
        zones: { ...s.zones, [who]: { ...s.zones[who], hand } },
        permanents: per,
        selectedCard: null,
        selectedPermanent: null,
      } as Partial<GameState> as GameState;
    }),

  // Play a card that is being dragged from a pile (spellbook, atlas, graveyard)
  playFromPileTo: (x, y) =>
    set((s) => {
      const info = s.dragFromPile;
      if (!info || !info.card) return s;
      const who = info.who;
      const from = info.from;
      const card = info.card;
      const isCurrent = (who === "p1" ? 1 : 2) === s.currentPlayer;
      if (!isCurrent) {
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
      const type = (card.type || "").toLowerCase();
      // Sites can be played any phase; other cards only during Main
      if (!type.includes("site") && s.phase !== "Main") {
        get().log(
          `Cannot play '${card.name}' from ${from} during ${s.phase} phase`
        );
        return {
          dragFromPile: null,
          dragFromHand: false,
        } as Partial<GameState> as GameState;
      }

      get().pushHistory();

      // Remove the card from the corresponding pile (first matching instance)
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
      if (removedIndex < 0) removedIndex = 0; // fallback to top of pile
      const removed = pile.splice(removedIndex, 1)[0];
      if (!removed) {
        get().log(`Card to play from ${from} was not found`);
        return {
          dragFromPile: null,
          dragFromHand: false,
        } as Partial<GameState> as GameState;
      }

      const key: CellKey = `${x},${y}`;
      const cellNo = y * s.board.size.w + x + 1;

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
        // Auto-add thresholds provided by this site
        const add: Partial<Thresholds> = {};
        const req = (card.thresholds || {}) as Partial<
          Record<keyof Thresholds, number>
        >;
        for (const kk of Object.keys(req) as (keyof Thresholds)[]) {
          if (s.players[who].thresholds[kk] != null) {
            add[kk] = Number(req[kk] ?? 0);
          }
        }
        const curP = s.players[who];
        const nextP: PlayerState = {
          ...curP,
          thresholds: {
            ...curP.thresholds,
            air: (curP.thresholds.air || 0) + (add.air || 0),
            water: (curP.thresholds.water || 0) + (add.water || 0),
            earth: (curP.thresholds.earth || 0) + (add.earth || 0),
            fire: (curP.thresholds.fire || 0) + (add.fire || 0),
          },
        };
        const sites = {
          ...s.board.sites,
          [key]: { owner: s.currentPlayer as 1 | 2, tapped: false, card },
        };
        get().log(
          `${who.toUpperCase()} plays site '${
            card.name
          }' from ${from} at #${cellNo}${
            Object.keys(add).length ? " (thresholds updated)" : ""
          }`
        );
        {
          const tr = get().transport;
          if (tr) {
            const zonesNext = { ...s.zones, [who]: { ...z, [pileName]: pile } } as GameState["zones"];
            const patch: ServerPatchT = {
              players: { ...s.players, [who]: nextP } as GameState["players"],
              zones: zonesNext,
              board: { ...s.board, sites } as GameState["board"],
            };
            get().trySendPatch(patch);
          }
        }
        return {
          players: { ...s.players, [who]: nextP },
          zones: { ...s.zones, [who]: { ...z, [pileName]: pile } },
          board: { ...s.board, sites },
          dragFromPile: null,
          dragFromHand: false,
        } as Partial<GameState> as GameState;
      }

      // Non-site
      const per: Permanents = { ...s.permanents };
      const arr = per[key] ? [...per[key]!] : [];
      arr.push({
        owner: s.currentPlayer as 1 | 2,
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
          const zonesNext = { ...s.zones, [who]: { ...z, [pileName]: pile } } as GameState["zones"];
          const patch: ServerPatchT = {
            zones: zonesNext,
            permanents: per as GameState["permanents"],
          };
          get().trySendPatch(patch);
        }
      }

      return {
        zones: { ...s.zones, [who]: { ...z, [pileName]: pile } },
        permanents: per,
        dragFromPile: null,
        dragFromHand: false,
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
      if (removedIndex < 0) removedIndex = 0; // fallback to top of pile
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
        get().log(`Cannot move card to ${pile}: ${who.toUpperCase()} is not the current player`);
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
        `${who.toUpperCase()} moves '${cardToMove.name}' from hand to ${position} of ${pile}`
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
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  toggleTapPermanent: (at, index) =>
    set((s) => {
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[at] || [])];
      if (!arr[index]) return s;
      const cur = arr[index];
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
        const patch: ServerPatchT = { permanents: per as GameState["permanents"] };
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
      per[at] = arr;
      const owner: PlayerKey = item.owner === 1 ? "p1" : "p2";
      const zones = { ...s.zones } as Record<PlayerKey, Zones>;
      const z = { ...zones[owner] };
      if (target === "hand") z.hand = [...z.hand, item.card];
      else if (target === "graveyard") z.graveyard = [...z.graveyard, item.card];
      else if (target === "spellbook") {
        const pile = [...z.spellbook];
        if (position === "top") pile.unshift(item.card);
        else pile.push(item.card);
        z.spellbook = pile;
      }
      else z.banished = [...z.banished, item.card];
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
      const owner: PlayerKey = site.owner === 1 ? "p1" : "p2";
      // Remove the site from the board
      const sites = { ...s.board.sites };
      delete sites[key];
      const zones = { ...s.zones } as Record<PlayerKey, Zones>;
      const z = { ...zones[owner] };
      if (target === "hand") z.hand = [...z.hand, site.card];
      else if (target === "graveyard") z.graveyard = [...z.graveyard, site.card];
      else if (target === "atlas") {
        const pile = [...z.atlas];
        if (position === "top") pile.unshift(site.card);
        else pile.push(site.card);
        z.atlas = pile;
      }
      else z.banished = [...z.banished, site.card];
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
        const patch: ServerPatchT = { permanents: per as GameState["permanents"] };
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
      const avatarsNext = { ...s.avatars, [who]: { ...s.avatars[who], card } } as GameState["avatars"];
      {
        const tr = get().transport;
        if (tr) {
          const patch: ServerPatchT = { avatars: avatarsNext };
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
          const patch: ServerPatchT = { avatars: avatarsNext };
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
            avatars: avatars as GameState["avatars"],
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
          const patch: ServerPatchT = {
            avatars: avatars as GameState["avatars"],
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
      return {
        avatars: { ...s.avatars, [who]: { ...cur, offset } },
      } as Partial<GameState> as GameState;
    }),

  toggleTapAvatar: (who) =>
    set((s) => {
      get().pushHistory();
      const cur = s.avatars[who];
      const next = { ...cur, tapped: !cur.tapped };
      get().log(
        `${who.toUpperCase()} ${next.tapped ? "taps" : "untaps"} Avatar`
      );
      return {
        avatars: { ...s.avatars, [who]: next },
      } as Partial<GameState> as GameState;
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
      const mulliganDrawnNext = { ...s.mulliganDrawn, [who]: newHand } as GameState["mulliganDrawn"];
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
      const mulliganDrawnNext = { ...s.mulliganDrawn, [who]: drawn } as GameState["mulliganDrawn"];
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

  // Clear mulligan drawn cards and finalize hands after mulligan phase
  finalizeMulligan: () =>
    set(() => {
      const next = { p1: [], p2: [] } as Record<PlayerKey, CardRef[]>;
      {
        const tr = get().transport;
        if (tr) {
          const patch: ServerPatchT = { mulliganDrawn: next };
          get().trySendPatch(patch);
          // Explicitly notify the server that this player has completed mulligans
          try {
            tr.mulliganDone();
          } catch {}
        }
      }
      return { mulliganDrawn: next } as Partial<GameState> as GameState;
    }),
}));
