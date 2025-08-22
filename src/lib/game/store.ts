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
export type SiteTile = { owner: 1 | 2; tapped?: boolean };
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
};

export type GameState = {
  players: Record<PlayerKey, PlayerState>;
  currentPlayer: 1 | 2;
  phase: Phase;
  addLife: (who: PlayerKey, delta: number) => void;
  addMana: (who: PlayerKey, delta: number) => void;
  addThreshold: (who: PlayerKey, element: keyof Thresholds, delta: number) => void;
  nextPhase: () => void;
  // Board
  board: BoardState;
  sitePlacementMode: boolean;
  showGridOverlay: boolean;
  toggleSitePlacement: () => void;
  toggleGridOverlay: () => void;
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
  selectHandCard: (who: PlayerKey, index: number) => void;
  clearSelection: () => void;
  playSelectedSiteTo: (x: number, y: number) => void;
};

const phases: Phase[] = ["Start", "Draw", "Main", "Combat", "End"];

export const useGameStore = create<GameState>((set, get) => ({
  players: {
    p1: { life: 20, mana: 0, thresholds: { air: 0, water: 0, earth: 0, fire: 0 } },
    p2: { life: 20, mana: 0, thresholds: { air: 0, water: 0, earth: 0, fire: 0 } },
  },
  currentPlayer: 1,
  phase: "Start",
  board: { size: { w: 7, h: 5 }, sites: {} },
  sitePlacementMode: false,
  showGridOverlay: false,
  zones: {
    p1: { spellbook: [], atlas: [], hand: [], graveyard: [], battlefield: [] },
    p2: { spellbook: [], atlas: [], hand: [], graveyard: [], battlefield: [] },
  },
  selectedCard: null,

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
    } else {
      set({ phase: nextPhase });
    }
  },

  toggleSitePlacement: () => set((s) => ({ sitePlacementMode: !s.sitePlacementMode })),
  toggleGridOverlay: () => set((s) => ({ showGridOverlay: !s.showGridOverlay })),

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
      const key: CellKey = `${x},${y}`;
      const site = s.board.sites[key];
      if (!site) return s;
      return { board: { ...s.board, sites: { ...s.board.sites, [key]: { ...site, tapped: !site.tapped } } } } as GameState;
    }),

  initLibraries: (who, spellbook, atlas) =>
    set((s) => ({ zones: { ...s.zones, [who]: { ...s.zones[who], spellbook: [...spellbook], atlas: [...atlas], hand: [], graveyard: [], battlefield: [] } } })),

  shuffleSpellbook: (who) =>
    set((s) => {
      const pile = [...s.zones[who].spellbook];
      for (let i = pile.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pile[i], pile[j]] = [pile[j], pile[i]];
      }
      return { zones: { ...s.zones, [who]: { ...s.zones[who], spellbook: pile } } };
    }),

  shuffleAtlas: (who) =>
    set((s) => {
      const pile = [...s.zones[who].atlas];
      for (let i = pile.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pile[i], pile[j]] = [pile[j], pile[i]];
      }
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
      return { zones: { ...s.zones, [who]: { ...s.zones[who], ...updated, hand } } };
    }),

  drawOpening: (who, spellbookCount = 5, atlasCount = 2) =>
    set((s) => {
      const sb = [...s.zones[who].spellbook];
      const at = [...s.zones[who].atlas];
      const hand = [...s.zones[who].hand];
      for (let i = 0; i < spellbookCount; i++) {
        const c = sb.shift();
        if (!c) break;
        hand.push(c);
      }
      for (let i = 0; i < atlasCount; i++) {
        const c = at.shift();
        if (!c) break;
        hand.push(c);
      }
      return { zones: { ...s.zones, [who]: { ...s.zones[who], spellbook: sb, atlas: at, hand } } };
    }),

  selectHandCard: (who, index) =>
    set((s) => {
      const card = s.zones[who].hand[index];
      if (!card) return s;
      return { selectedCard: { who, index, card } };
    }),

  clearSelection: () => set({ selectedCard: null, sitePlacementMode: false }),

  playSelectedSiteTo: (x, y) =>
    set((s) => {
      const sel = s.selectedCard;
      if (!sel) return s;
      const { who, index, card } = sel;
      const isCurrent = (who === "p1" ? 1 : 2) === s.currentPlayer;
      if (!isCurrent || s.phase !== "Main") return s;
      const type = (card.type || "").toLowerCase();
      if (!type.includes("site")) return s; // only allow sites for now

      const key: CellKey = `${x},${y}`;
      if (s.board.sites[key]) return s; // occupied

      // Check thresholds (simple consumption model)
      const req = (card.thresholds ?? {}) as Partial<Thresholds>;
      const ps = who === "p1" ? s.players.p1 : s.players.p2;
      const canPay = (Object.keys(req) as (keyof Thresholds)[]).every((el) =>
        (ps.thresholds[el] ?? 0) >= (req[el] ?? 0)
      );
      if (!canPay) return s;

      // Pay thresholds
      const newThr: Thresholds = { ...ps.thresholds } as Thresholds;
      for (const el of Object.keys(req) as (keyof Thresholds)[]) {
        newThr[el] = Math.max(0, newThr[el] - (req[el] ?? 0));
      }

      // Remove from hand
      const hand = [...s.zones[who].hand];
      hand.splice(index, 1);

      // Place site
      const sites = { ...s.board.sites, [key]: { owner: s.currentPlayer as 1 | 2, tapped: false } };

      return {
        players: {
          ...s.players,
          [who]: { ...ps, thresholds: newThr },
        },
        zones: { ...s.zones, [who]: { ...s.zones[who], hand } },
        board: { ...s.board, sites },
        selectedCard: null,
        sitePlacementMode: false,
      } as Partial<GameState> as GameState;
    }),
}));
