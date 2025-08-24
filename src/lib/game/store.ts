import { create } from "zustand";

export type Phase = "Start" | "Draw" | "Main" | "Combat" | "End";
export type PlayerKey = "p1" | "p2";

export type Thresholds = {
  air: number;
  water: number;
  earth: number;
  fire: number;
};

export type PlayerState = {
  life: number;
  mana: number;
  thresholds: Thresholds;
};

export type BoardSize = { w: number; h: number };
export type CellKey = string; // `${x},${y}`
export type SiteTile = { owner: 1 | 2; tapped?: boolean; card?: CardRef | null };
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

export type AvatarState = { card: CardRef | null; pos: [number, number] | null; tapped: boolean };
export type PermanentItem = { owner: 1 | 2; card: CardRef; offset?: [number, number] | null; tapped?: boolean; tilt?: number };
export type Permanents = Record<CellKey, PermanentItem[]>;

// Context menu targeting for click-driven actions
export type ContextMenuTarget =
  | { kind: "site"; x: number; y: number }
  | { kind: "permanent"; at: CellKey; index: number }
  | { kind: "avatar"; who: PlayerKey };

export type GameState = {
  players: Record<PlayerKey, PlayerState>;
  currentPlayer: 1 | 2;
  phase: Phase;
  setPhase: (phase: Phase) => void;
  addLife: (who: PlayerKey, delta: number) => void;
  addMana: (who: PlayerKey, delta: number) => void;
  addThreshold: (who: PlayerKey, element: keyof Thresholds, delta: number) => void;
  nextPhase: () => void; // legacy manual stepping
  endTurn: () => void; // auto-resolve to next player's Main
  // Board
  board: BoardState;
  sitePlacementMode: boolean;
  showGridOverlay: boolean;
  showPlaymat: boolean;
  toggleSitePlacement: () => void;
  toggleGridOverlay: () => void;
  togglePlaymat: () => void;
  placeSite: (x: number, y: number) => void; // legacy quick placement (no card)
  toggleTapSite: (x: number, y: number) => void;
  // Zones and actions
  zones: Record<PlayerKey, Zones>;
  initLibraries: (who: PlayerKey, spellbook: CardRef[], atlas: CardRef[]) => void;
  shuffleSpellbook: (who: PlayerKey) => void;
  shuffleAtlas: (who: PlayerKey) => void;
  drawFrom: (who: PlayerKey, from: 'spellbook' | 'atlas', count?: number) => void;
  drawOpening: (who: PlayerKey, spellbookCount?: number, atlasCount?: number) => void;
  selectedCard: { who: PlayerKey; index: number; card: CardRef } | null;
  selectedPermanent: { at: CellKey; index: number } | null;
  selectHandCard: (who: PlayerKey, index: number) => void;
  clearSelection: () => void;
  playSelectedTo: (x: number, y: number) => void;
  playFromPileTo: (x: number, y: number) => void;
  selectPermanent: (at: CellKey, index: number) => void;
  moveSelectedPermanentTo: (x: number, y: number) => void;
  moveSelectedPermanentToWithOffset: (x: number, y: number, offset: [number, number]) => void;
  setPermanentOffset: (at: CellKey, index: number, offset: [number, number]) => void;
  toggleTapPermanent: (at: CellKey, index: number) => void;
  // Move cards from board back to zones
  movePermanentToZone: (at: CellKey, index: number, target: 'hand' | 'graveyard' | 'banished') => void;
  moveSiteToZone: (x: number, y: number, target: 'hand' | 'graveyard' | 'banished') => void;
  avatars: Record<PlayerKey, AvatarState>;
  permanents: Permanents;
  setAvatarCard: (who: PlayerKey, card: CardRef) => void;
  placeAvatarAtStart: (who: PlayerKey) => void;
  moveAvatarTo: (who: PlayerKey, x: number, y: number) => void;
  toggleTapAvatar: (who: PlayerKey) => void;
  // Mulligans
  mulligans: Record<PlayerKey, number>;
  mulligan: (who: PlayerKey) => void;
  mulliganWithSelection: (who: PlayerKey, indices: number[]) => void;
  mulliganDrawn: Record<PlayerKey, CardRef[]>;
  // Events / console
  events: GameEvent[];
  eventSeq: number;
  log: (text: string) => void;
  // UI cross-surface drag state
  dragFromHand: boolean;
  dragFromPile: { who: PlayerKey; from: 'spellbook' | 'atlas' | 'graveyard'; card: CardRef | null } | null;
  setDragFromHand: (on: boolean) => void;
  setDragFromPile: (info: { who: PlayerKey; from: 'spellbook' | 'atlas' | 'graveyard'; card: CardRef | null } | null) => void;
  hoverCell: [number, number] | null;
  setHoverCell: (x: number, y: number) => void;
  clearHoverCell: () => void;
  // Hover preview card
  previewCard: CardRef | null;
  setPreviewCard: (card: CardRef | null) => void;
  // Context menu
  contextMenu: { target: ContextMenuTarget; screen?: { x: number; y: number } } | null;
  openContextMenu: (target: ContextMenuTarget, screen?: { x: number; y: number }) => void;
  closeContextMenu: () => void;
  // History / Undo
  history: SerializedGame[];
  pushHistory: () => void;
  undo: () => void;
};

const phases: Phase[] = ["Start", "Draw", "Main", "Combat", "End"];

export type GameEvent = { id: number; ts: number; text: string };

// Snapshot of serializable game state we can restore on undo
export type SerializedGame = {
  players: Record<PlayerKey, PlayerState>;
  currentPlayer: 1 | 2;
  phase: Phase;
  board: BoardState;
  sitePlacementMode: boolean;
  showGridOverlay: boolean;
  showPlaymat: boolean;
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

// Small random visual tilt for permanents to reduce overlap uniformity (radians ~ -0.05..+0.05)
const randomTilt = () => Math.random() * 0.1 - 0.05;

export const useGameStore = create<GameState>((set, get) => ({
  players: {
    p1: { life: 20, mana: 0, thresholds: { air: 0, water: 0, earth: 0, fire: 0 } },
    p2: { life: 20, mana: 0, thresholds: { air: 0, water: 0, earth: 0, fire: 0 } },
  },
  currentPlayer: 1,
  phase: "Start",
  setPhase: (phase) => set({ phase }),
  board: { size: { w: 5, h: 4 }, sites: {} },
  sitePlacementMode: false,
  showGridOverlay: false,
  showPlaymat: true,
  zones: {
    p1: { spellbook: [], atlas: [], hand: [], graveyard: [], battlefield: [], banished: [] },
    p2: { spellbook: [], atlas: [], hand: [], graveyard: [], battlefield: [], banished: [] },
  },
  selectedCard: null,
  selectedPermanent: null,
  avatars: { p1: { card: null, pos: null, tapped: false }, p2: { card: null, pos: null, tapped: false } },
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
    set((s) => ({ events: [...s.events, { id: s.eventSeq + 1, ts: Date.now(), text }], eventSeq: s.eventSeq + 1 })),

  // History helpers
  pushHistory: () =>
    set((s) => {
      const snap: SerializedGame = {
        players: JSON.parse(JSON.stringify(s.players)),
        currentPlayer: s.currentPlayer,
        phase: s.phase,
        board: JSON.parse(JSON.stringify(s.board)),
        sitePlacementMode: s.sitePlacementMode,
        showGridOverlay: s.showGridOverlay,
        showPlaymat: s.showPlaymat,
        zones: JSON.parse(JSON.stringify(s.zones)),
        selectedCard: s.selectedCard ? JSON.parse(JSON.stringify(s.selectedCard)) : null,
        selectedPermanent: s.selectedPermanent ? { ...s.selectedPermanent } : null,
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
        board: prev.board,
        sitePlacementMode: prev.sitePlacementMode,
        showGridOverlay: prev.showGridOverlay,
        showPlaymat: prev.showPlaymat,
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

  addLife: (who, delta) =>
    set((s) => ({
      players: {
        ...s.players,
        [who]: { ...s.players[who], life: Math.max(0, s.players[who].life + delta) },
      },
    })),

  addMana: (who, delta) =>
    set((s) => ({
      players: {
        ...s.players,
        [who]: { ...s.players[who], mana: Math.max(0, s.players[who].mana + delta) },
      },
    })),

  addThreshold: (who, element, delta) =>
    set((s) => ({
      players: {
        ...s.players,
        [who]: {
          ...s.players[who],
          thresholds: {
            ...s.players[who].thresholds,
            [element]: Math.max(0, s.players[who].thresholds[element] + delta),
          },
        },
      },
    })),

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
        if (sites[key].owner === nextPlayer) sites[key] = { ...sites[key], tapped: false };
      }
      set({
        phase: nextPhase,
        currentPlayer: nextPlayer,
        board: { ...s.board, sites },
        sitePlacementMode: false,
        selectedCard: null,
      });
      get().log(`Turn passes to P${nextPlayer}`);
    } else {
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
      if (sites[key].owner === nextPlayer) sites[key] = { ...sites[key], tapped: false };
    }

    set({
      phase: "Main",
      currentPlayer: nextPlayer,
      board: { ...s.board, sites },
      sitePlacementMode: false,
      selectedCard: null,
      selectedPermanent: null,
    });

    get().log(`Turn passes to P${nextPlayer}`);
  },

  toggleSitePlacement: () => set((s) => ({ sitePlacementMode: !s.sitePlacementMode })),
  toggleGridOverlay: () => set((s) => ({ showGridOverlay: !s.showGridOverlay })),
  togglePlaymat: () => set((s) => ({ showPlaymat: !s.showPlaymat })),

  placeSite: (x, y) =>
    set((s) => {
      if (!s.sitePlacementMode) return s;
      const key: CellKey = `${x},${y}`;
      if (s.board.sites[key]) return s; // occupied
      return {
        board: {
          ...s.board,
          sites: { ...s.board.sites, [key]: { owner: s.currentPlayer } },
        },
        sitePlacementMode: false,
      } as Partial<GameState> as GameState;
    }),

  toggleTapSite: (x, y) =>
    set((s) => {
      get().pushHistory();
      const key: CellKey = `${x},${y}`;
      const site = s.board.sites[key];
      if (!site) return s;
      const next = { ...site, tapped: !site.tapped };
      const cellNo = y * s.board.size.w + x + 1;
      get().log(`Site #${cellNo} ${next.tapped ? "tapped" : "untapped"}`);
      return { board: { ...s.board, sites: { ...s.board.sites, [key]: next } } } as GameState;
    }),

  initLibraries: (who, spellbook, atlas) =>
    set((s) => ({ zones: { ...s.zones, [who]: { ...s.zones[who], spellbook: [...spellbook], atlas: [...atlas], hand: [], graveyard: [], battlefield: [], banished: [] } } })),

  shuffleSpellbook: (who) =>
    set((s) => {
      const pile = [...s.zones[who].spellbook];
      for (let i = pile.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pile[i], pile[j]] = [pile[j], pile[i]];
      }
      get().log(`${who.toUpperCase()} shuffles Spellbook (${pile.length})`);
      return { zones: { ...s.zones, [who]: { ...s.zones[who], spellbook: pile } } };
    }),

  shuffleAtlas: (who) =>
    set((s) => {
      const pile = [...s.zones[who].atlas];
      for (let i = pile.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pile[i], pile[j]] = [pile[j], pile[i]];
      }
      get().log(`${who.toUpperCase()} shuffles Atlas (${pile.length})`);
      return { zones: { ...s.zones, [who]: { ...s.zones[who], atlas: pile } } };
    }),

  drawFrom: (who, from, count = 1) =>
    set((s) => {
      // Enforce simple rule: only current player may draw during Draw/Main
      const isCurrent = (who === "p1" ? 1 : 2) === s.currentPlayer;
      if (!isCurrent || (s.phase !== "Draw" && s.phase !== "Main")) return s;
      const pile = from === 'spellbook' ? [...s.zones[who].spellbook] : [...s.zones[who].atlas];
      const hand = [...s.zones[who].hand];
      for (let i = 0; i < count; i++) {
        const c = pile.shift();
        if (!c) break;
        hand.push(c);
      }
      const updated = from === 'spellbook' ? { spellbook: pile } : { atlas: pile };
      get().log(`${who.toUpperCase()} draws ${count} from ${from}`);
      return { zones: { ...s.zones, [who]: { ...s.zones[who], ...updated, hand } } };
    }),

  drawOpening: (who, spellbookCount?: number, atlasCount?: number) =>
    set((s) => {
      const isSpellslinger = ((s.avatars[who]?.card?.name || "").toLowerCase() === "spellslinger");
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
      get().log(`${who.toUpperCase()} draws opening hand (${sbCount} SB + ${atCount} AT)`);
      return { zones: { ...s.zones, [who]: { ...s.zones[who], spellbook: sb, atlas: at, hand } } };
    }),

  selectHandCard: (who, index) =>
    set((s) => {
      const card = s.zones[who].hand[index];
      if (!card) return s;
      return { selectedCard: { who, index, card }, selectedPermanent: null };
    }),

  clearSelection: () => set({ selectedCard: null, selectedPermanent: null, sitePlacementMode: false }),

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
        get().log(`Cannot play '${card.name}': ${who.toUpperCase()} is not the current player`);
        return s;
      }
      const type = (card.type || "").toLowerCase();
      // For non-site cards only: warn if thresholds are missing. Sites never cost thresholds.
      if (!type.includes("site")) {
        const req = (card.thresholds || {}) as Partial<Record<keyof Thresholds, number>>;
        const have = s.players[who].thresholds;
        const miss: string[] = [];
        for (const kk of Object.keys(req) as (keyof Thresholds)[]) {
          const need = Number(req[kk] ?? 0);
          const haveVal = Number(have[kk] ?? 0);
          if (need > haveVal) {
            miss.push(`${kk} ${need - haveVal}`);
          }
        }
        if (miss.length) get().log(`Warning: '${card.name}' missing thresholds (${miss.join(", ")})`);
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
          get().log(`Cannot play site '${card.name}': #${cellNo} already occupied`);
          return s; // occupied
        }
        // Auto-add thresholds provided by this site
        const add: Partial<Thresholds> = {};
        const req = (card.thresholds || {}) as Partial<Record<keyof Thresholds, number>>;
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
        const sites = { ...s.board.sites, [key]: { owner: s.currentPlayer as 1 | 2, tapped: false, card } };
        get().log(`${who.toUpperCase()} plays site '${card.name}' at #${cellNo}${Object.keys(add).length ? " (thresholds updated)" : ""}`);
        return {
          players: { ...s.players, [who]: nextP },
          zones: { ...s.zones, [who]: { ...s.zones[who], hand } },
          board: { ...s.board, sites },
          selectedCard: null,
          sitePlacementMode: false,
        } as Partial<GameState> as GameState;
      }

      // Non-site permanent: place on tile
      const per: Permanents = { ...s.permanents };
      const arr = per[key] ? [...per[key]!] : [];
      arr.push({ owner: s.currentPlayer as 1 | 2, card, offset: null, tilt: randomTilt() });
      per[key] = arr;
      get().log(`${who.toUpperCase()} plays '${card.name}' at #${cellNo}`);

      return {
        zones: { ...s.zones, [who]: { ...s.zones[who], hand } },
        permanents: per,
        selectedCard: null,
        selectedPermanent: null,
        sitePlacementMode: false,
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
        get().log(`Cannot play '${card.name}' from ${from}: ${who.toUpperCase()} is not the current player`);
        return { dragFromPile: null, dragFromHand: false } as Partial<GameState> as GameState;
      }
      const type = (card.type || "").toLowerCase();
      // Sites can be played any phase; other cards only during Main
      if (!type.includes("site") && s.phase !== "Main") {
        get().log(`Cannot play '${card.name}' from ${from} during ${s.phase} phase`);
        return { dragFromPile: null, dragFromHand: false } as Partial<GameState> as GameState;
      }

      get().pushHistory();

      // Remove the card from the corresponding pile (first matching instance)
      const z = { ...s.zones[who] };
      const pileName = from as keyof Zones;
      const pile = [...(z[pileName] as CardRef[])];
      let removedIndex = pile.findIndex((c) => c === card);
      if (removedIndex < 0) {
        removedIndex = pile.findIndex(
          (c) => c.cardId === card.cardId && c.variantId === card.variantId && c.name === card.name
        );
      }
      if (removedIndex < 0) removedIndex = 0; // fallback to top of pile
      const removed = pile.splice(removedIndex, 1)[0];
      if (!removed) {
        get().log(`Card to play from ${from} was not found`);
        return { dragFromPile: null, dragFromHand: false } as Partial<GameState> as GameState;
      }

      const key: CellKey = `${x},${y}`;
      const cellNo = y * s.board.size.w + x + 1;

      if (type.includes("site")) {
        if (s.board.sites[key]) {
          get().log(`Cannot play site '${card.name}': #${cellNo} already occupied`);
          return { dragFromPile: null, dragFromHand: false } as Partial<GameState> as GameState;
        }
        // Auto-add thresholds provided by this site
        const add: Partial<Thresholds> = {};
        const req = (card.thresholds || {}) as Partial<Record<keyof Thresholds, number>>;
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
        const sites = { ...s.board.sites, [key]: { owner: s.currentPlayer as 1 | 2, tapped: false, card } };
        get().log(`${who.toUpperCase()} plays site '${card.name}' from ${from} at #${cellNo}${Object.keys(add).length ? " (thresholds updated)" : ""}`);
        return {
          players: { ...s.players, [who]: nextP },
          zones: { ...s.zones, [who]: { ...z, [pileName]: pile } },
          board: { ...s.board, sites },
          dragFromPile: null,
          dragFromHand: false,
          sitePlacementMode: false,
        } as Partial<GameState> as GameState;
      }

      // Non-site
      const per: Permanents = { ...s.permanents };
      const arr = per[key] ? [...per[key]!] : [];
      arr.push({ owner: s.currentPlayer as 1 | 2, card, offset: null, tilt: randomTilt() });
      per[key] = arr;
      get().log(`${who.toUpperCase()} plays '${card.name}' from ${from} at #${cellNo}`);

      return {
        zones: { ...s.zones, [who]: { ...z, [pileName]: pile } },
        permanents: per,
        dragFromPile: null,
        dragFromHand: false,
        sitePlacementMode: false,
      } as Partial<GameState> as GameState;
    }),

  selectPermanent: (at, index) =>
    set((s) => {
      const arr = s.permanents[at] || [];
      if (!arr[index]) return s;
      return { selectedPermanent: { at, index }, selectedCard: null };
    }),

  moveSelectedPermanentTo: (x, y) =>
    set((s) => {
      const sel = s.selectedPermanent;
      if (!sel) return s;
      get().pushHistory();
      const fromKey: CellKey = sel.at;
      const toKey: CellKey = `${x},${y}`;
      const per: Permanents = { ...s.permanents };
      const fromArr = [...(per[fromKey] || [])];
      const item = fromArr.splice(sel.index, 1)[0];
      if (!item) return s;
      const toArr = [...(per[toKey] || [])];
      const toPush: PermanentItem = item.tilt == null ? { ...item, tilt: randomTilt() } : item;
      toArr.push(toPush);
      per[fromKey] = fromArr;
      per[toKey] = toArr;
      const cellNo = y * s.board.size.w + x + 1;
      get().log(`Moved '${item.card.name}' to #${cellNo}`);
      return { permanents: per, selectedPermanent: null } as Partial<GameState> as GameState;
    }),

  moveSelectedPermanentToWithOffset: (x, y, offset) =>
    set((s) => {
      const sel = s.selectedPermanent;
      if (!sel) return s;
      get().pushHistory();
      const fromKey: CellKey = sel.at;
      const toKey: CellKey = `${x},${y}`;
      const per: Permanents = { ...s.permanents };
      const fromArr = [...(per[fromKey] || [])];
      const item = fromArr.splice(sel.index, 1)[0];
      if (!item) return s;
      const toArr = [...(per[toKey] || [])];
      const toPush: PermanentItem = { ...item, offset, tilt: item.tilt ?? randomTilt() };
      toArr.push(toPush);
      per[fromKey] = fromArr;
      per[toKey] = toArr;
      const cellNo = y * s.board.size.w + x + 1;
      get().log(`Moved '${item.card.name}' to #${cellNo} (nudged)`);
      return { permanents: per, selectedPermanent: null } as Partial<GameState> as GameState;
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
      get().log(`${next.tapped ? "Tapped" : "Untapped"} '${cur.card.name}' at #${cellNo}`);
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  // Move a permanent from the board to a target zone
  movePermanentToZone: (at, index, target) =>
    set((s) => {
      get().pushHistory();
      const per: Permanents = { ...s.permanents };
      const arr = [...(per[at] || [])];
      const item = arr.splice(index, 1)[0];
      if (!item) return s;
      per[at] = arr;
      const owner: PlayerKey = item.owner === 1 ? 'p1' : 'p2';
      const zones = { ...s.zones } as Record<PlayerKey, Zones>;
      const z = { ...zones[owner] };
      if (target === 'hand') z.hand = [...z.hand, item.card];
      else if (target === 'graveyard') z.graveyard = [...z.graveyard, item.card];
      else z.banished = [...z.banished, item.card];
      zones[owner] = z;
      const cell = at.split(",");
      const x = Number(cell[0] || 0);
      const y = Number(cell[1] || 0);
      const cellNo = y * s.board.size.w + x + 1;
      const label = target === 'hand' ? 'hand' : target === 'graveyard' ? 'graveyard' : 'banished';
      get().log(`Moved '${item.card.name}' from #${cellNo} to ${owner.toUpperCase()} ${label}`);
      return { permanents: per, zones } as Partial<GameState> as GameState;
    }),

  // Move a site from the board to a target zone
  moveSiteToZone: (x, y, target) =>
    set((s) => {
      get().pushHistory();
      const key: CellKey = `${x},${y}`;
      const site = s.board.sites[key];
      if (!site || !site.card) return s;
      const owner: PlayerKey = site.owner === 1 ? 'p1' : 'p2';
      // Remove the site from the board
      const sites = { ...s.board.sites };
      delete sites[key];
      const zones = { ...s.zones } as Record<PlayerKey, Zones>;
      const z = { ...zones[owner] };
      if (target === 'hand') z.hand = [...z.hand, site.card];
      else if (target === 'graveyard') z.graveyard = [...z.graveyard, site.card];
      else z.banished = [...z.banished, site.card];
      zones[owner] = z;
      const cellNo = y * s.board.size.w + x + 1;
      const label = target === 'hand' ? 'hand' : target === 'graveyard' ? 'graveyard' : 'banished';
      get().log(`Moved site '${site.card.name}' from #${cellNo} to ${owner.toUpperCase()} ${label}`);
      return { board: { ...s.board, sites }, zones } as Partial<GameState> as GameState;
    }),

  setAvatarCard: (who, card) =>
    set((s) => {
      get().log(`${who.toUpperCase()} sets Avatar to '${card.name}'`);
      return { avatars: { ...s.avatars, [who]: { ...s.avatars[who], card } } };
    }),

  placeAvatarAtStart: (who) =>
    set((s) => {
      const w = s.board.size.w;
      const h = s.board.size.h;
      const x = Math.floor(w / 2);
      const y = who === "p1" ? 0 : h - 1;
      const cellNo = y * w + x + 1;
      get().log(`${who.toUpperCase()} places Avatar at #${cellNo}`);
      return { avatars: { ...s.avatars, [who]: { ...s.avatars[who], pos: [x, y] } } } as Partial<GameState> as GameState;
    }),

  moveAvatarTo: (who, x, y) =>
    set((s) => {
      get().pushHistory();
      const w = s.board.size.w;
      const cellNo = y * w + x + 1;
      const next = { ...s.avatars[who], pos: [x, y] as [number, number] };
      get().log(`${who.toUpperCase()} moves Avatar to #${cellNo}`);
      return { avatars: { ...s.avatars, [who]: next } } as Partial<GameState> as GameState;
    }),

  toggleTapAvatar: (who) =>
    set((s) => {
      get().pushHistory();
      const cur = s.avatars[who];
      const next = { ...cur, tapped: !cur.tapped };
      get().log(`${who.toUpperCase()} ${next.tapped ? "taps" : "untaps"} Avatar`);
      return { avatars: { ...s.avatars, [who]: next } } as Partial<GameState> as GameState;
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
        if (isSite) at.push(c); else sb.push(c);
      }
      // shuffle both piles
      for (let i = sb.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [sb[i], sb[j]] = [sb[j], sb[i]]; }
      for (let i = at.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [at[i], at[j]] = [at[j], at[i]]; }
      // draw new opening hand (default counts)
      const newHand: CardRef[] = [];
      const drawN = (pile: CardRef[], n: number) => { for (let i = 0; i < n; i++) { const c = pile.shift(); if (!c) break; newHand.push(c); } };
      const isSpellslinger = ((s.avatars[who]?.card?.name || "").toLowerCase() === "spellslinger");
      const sbCount = isSpellslinger ? 4 : 3;
      const atCount = 3;
      drawN(sb, sbCount);
      drawN(at, atCount);
      const m = { ...s.mulligans, [who]: s.mulligans[who] - 1 };
      get().log(`${who.toUpperCase()} mulligans (draws ${sbCount} SB + ${atCount} AT)`);
      return { zones: { ...s.zones, [who]: { ...s.zones[who], spellbook: sb, atlas: at, hand: newHand } }, mulligans: m, mulliganDrawn: { ...s.mulliganDrawn, [who]: newHand } } as Partial<GameState> as GameState;
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
        if (idxSet.has(i)) toReturn.push(c); else kept.push(c);
      });

      const sb = [...s.zones[who].spellbook];
      const at = [...s.zones[who].atlas];
      let backSpell = 0;
      let backAtlas = 0;
      for (const c of toReturn) {
        const isSite = (c.type || "").toLowerCase().includes("site");
        if (isSite) { at.push(c); backAtlas++; } else { sb.push(c); backSpell++; }
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
      get().log(`${who.toUpperCase()} mulligans ${toReturn.length} card(s) (${backAtlas} site(s), ${backSpell} other)`);
      if (drawn.length) get().log(`${who.toUpperCase()} draws ${drawn.length} replacement card(s)`);
      return {
        zones: { ...s.zones, [who]: { ...s.zones[who], spellbook: sb, atlas: at, hand: kept } },
        mulligans: m,
        mulliganDrawn: { ...s.mulliganDrawn, [who]: drawn },
      } as Partial<GameState> as GameState;
    }),
}));
