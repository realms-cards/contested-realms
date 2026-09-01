import type { StateCreator } from "zustand";
import type { BoardPingEvent, CellKey, GameState, SiteTile } from "./types";
import { BOARD_PING_LIFETIME_MS, BOARD_PING_MAX_HISTORY } from "./types";

// Default look: grid lines on the bare wooden table (playmat hidden) — it
// reads nicer than the playmat art. The playmat comes back as the default only
// when the 3D table is disabled in graphics settings (grid floating over a
// black void looks broken); see applyLocalPlaymatPrefs.
const DEFAULT_SHOW_PLAYMAT = false;
const DEFAULT_SHOW_GRID = true;

// Storage keys shared with the toggles below and the play pages.
const STORAGE_KEY_SHOW_PLAYMAT = "sorcery:showPlaymat";
const STORAGE_KEY_SHOW_GRID = "sorcery:showGrid";

/**
 * Load playmat/grid settings from API (for authenticated users).
 * Returns null if not authenticated or on error.
 */
export async function loadPlaymatSettingsFromApi(): Promise<{
  showPlaymat: boolean;
  showGrid: boolean;
} | null> {
  try {
    const res = await fetch("/api/users/me/playmats/preferences", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      showPlaymat?: boolean;
      showGrid?: boolean;
    };
    return {
      showPlaymat:
        typeof data.showPlaymat === "boolean"
          ? data.showPlaymat
          : DEFAULT_SHOW_PLAYMAT,
      showGrid:
        typeof data.showGrid === "boolean" ? data.showGrid : DEFAULT_SHOW_GRID,
    };
  } catch {}
  return null;
}

type PlaymatPrefsStore = {
  getState: () => Pick<GameState, "showPlaymat" | "showPlaymatOverlay">;
  setState: (
    partial: Partial<Pick<GameState, "showPlaymat" | "showPlaymatOverlay">>,
  ) => void;
};

/**
 * Apply locally persisted playmat/grid preferences to the store — the fallback
 * for anonymous users (or when the preferences API is unavailable).
 *
 * With no stored choice, the default is grid-on-table (playmat hidden) unless
 * the 3D table itself is disabled in graphics settings, in which case the
 * playmat is shown so the grid isn't floating over a black void.
 */
export function applyLocalPlaymatPrefs(store: PlaymatPrefsStore): void {
  if (typeof window === "undefined") return;
  try {
    const storedMat = localStorage.getItem(STORAGE_KEY_SHOW_PLAYMAT);
    const storedGrid = localStorage.getItem(STORAGE_KEY_SHOW_GRID);

    let showPlaymat: boolean;
    if (storedMat !== null) {
      showPlaymat = storedMat === "true";
    } else {
      // No explicit choice: grid-on-table unless the table is turned off.
      let showTable = true;
      try {
        const graphics = JSON.parse(
          localStorage.getItem("sorcery-graphics-settings") ?? "{}",
        ) as { showTable?: unknown };
        if (typeof graphics.showTable === "boolean") {
          showTable = graphics.showTable;
        }
      } catch {}
      showPlaymat = !showTable;
    }
    const showGrid = storedGrid !== null ? storedGrid === "true" : !showPlaymat;

    const current = store.getState();
    const patch: Partial<
      Pick<GameState, "showPlaymat" | "showPlaymatOverlay">
    > = {};
    if (current.showPlaymat !== showPlaymat) patch.showPlaymat = showPlaymat;
    if (current.showPlaymatOverlay !== showGrid) {
      patch.showPlaymatOverlay = showGrid;
    }
    if (Object.keys(patch).length > 0) store.setState(patch);
  } catch {}
}

export type DraggingSite = {
  sourceKey: CellKey;
  site: SiteTile;
  worldPos: { x: number; z: number };
} | null;

export type GridColor = "white" | "black";
export type GridBlend = "normal" | "subtract";

type BoardUiDefaults = Pick<
  GameState,
  | "showGridOverlay"
  | "showPlaymat"
  | "showPlaymatOverlay"
  | "playmatUrl"
  | "playmatUrls"
  | "activePlaymatOwner"
  | "cardbackUrls"
  | "gridColor"
  | "gridBlend"
  | "allowSiteDrag"
  | "autoTapOnMove"
  | "showOwnershipOverlay"
  | "cardScale"
  | "boardPings"
  | "lastPointerWorldPos"
  | "draggingSite"
>;

export const createInitialBoardUiState = (): BoardUiDefaults => ({
  showGridOverlay: false,
  // Keep SSR/first-client-render deterministic; persisted preferences are
  // applied after hydration (API/localStorage sync effects on play pages).
  showPlaymat: DEFAULT_SHOW_PLAYMAT,
  showPlaymatOverlay: DEFAULT_SHOW_GRID, // Grid overlay state is persisted
  playmatUrl: null, // null until user's preference is loaded
  playmatUrls: { p1: null, p2: null }, // Per-player custom playmat URLs
  activePlaymatOwner: null, // null = use own playmat, "p1"/"p2" = show that player's playmat
  cardbackUrls: {
    p1: {
      spellbook: null,
      atlas: null,
      spellbookPreset: null,
      atlasPreset: null,
    },
    p2: {
      spellbook: null,
      atlas: null,
      spellbookPreset: null,
      atlasPreset: null,
    },
  },
  gridColor: "white",
  gridBlend: "normal",
  allowSiteDrag: false, // Default: sites cannot be freely dragged on board
  autoTapOnMove: false, // Default: do not auto-tap avatars/minions when moved across tiles
  showOwnershipOverlay: false, // Default: no ownership highlight on cards
  cardScale: 1, // Default: full size cards (range 0.25 to 1)
  boardPings: [],
  lastPointerWorldPos: null,
  draggingSite: null,
});

export type BoardUiSlice = Pick<
  GameState,
  | "showGridOverlay"
  | "showPlaymat"
  | "showPlaymatOverlay"
  | "playmatUrl"
  | "playmatUrls"
  | "activePlaymatOwner"
  | "cardbackUrls"
  | "gridColor"
  | "gridBlend"
  | "allowSiteDrag"
  | "autoTapOnMove"
  | "showOwnershipOverlay"
  | "toggleGridOverlay"
  | "togglePlaymat"
  | "togglePlaymatOverlay"
  | "toggleAllowSiteDrag"
  | "toggleAutoTapOnMove"
  | "toggleOwnershipOverlay"
  | "setCardScale"
  | "setPlaymatUrl"
  | "setPlaymatUrlFor"
  | "setActivePlaymatOwner"
  | "setCardbackUrls"
  | "setGridColor"
  | "setGridBlend"
  | "boardPings"
  | "pushBoardPing"
  | "removeBoardPing"
  | "lastPointerWorldPos"
  | "setLastPointerWorldPos"
  | "draggingSite"
  | "setDraggingSite"
  | "updateDraggingSitePos"
  | "dropDraggingSite"
>;

export const createBoardUiSlice: StateCreator<
  GameState,
  [],
  [],
  BoardUiSlice
> = (set, get) => ({
  ...createInitialBoardUiState(),

  toggleGridOverlay: () =>
    set((state) => ({ showGridOverlay: !state.showGridOverlay })),
  togglePlaymat: () =>
    set((state) => {
      const newValue = !state.showPlaymat;
      // Persist to localStorage
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY_SHOW_PLAYMAT, String(newValue));
        }
      } catch {}
      // Persist to API for authenticated users (fire and forget)
      try {
        void fetch("/api/users/me/playmats/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ showPlaymat: newValue }),
        });
      } catch {}
      return { showPlaymat: newValue };
    }),
  togglePlaymatOverlay: () =>
    set((state) => {
      const newValue = !state.showPlaymatOverlay;
      // Persist to localStorage
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY_SHOW_GRID, String(newValue));
        }
      } catch {}
      // Persist to API for authenticated users (fire and forget)
      try {
        void fetch("/api/users/me/playmats/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ showGrid: newValue }),
        });
      } catch {}
      return { showPlaymatOverlay: newValue };
    }),
  toggleAllowSiteDrag: () =>
    set((state) => ({ allowSiteDrag: !state.allowSiteDrag })),
  toggleAutoTapOnMove: () =>
    set((state) => ({ autoTapOnMove: !state.autoTapOnMove })),
  toggleOwnershipOverlay: () =>
    set((state) => ({ showOwnershipOverlay: !state.showOwnershipOverlay })),
  setCardScale: (scale: number) => {
    const clamped = Math.max(0.25, Math.min(1, scale));
    set({ cardScale: clamped });
    // Sync to other player via transport
    get().trySendPatch({ cardScale: clamped });
  },
  setPlaymatUrl: (url: string) => set({ playmatUrl: url }),
  setPlaymatUrlFor: (who, url) =>
    set((state) => ({
      playmatUrls: {
        ...state.playmatUrls,
        [who]: url,
      },
    })),
  setActivePlaymatOwner: (who) => set({ activePlaymatOwner: who }),
  setCardbackUrls: (who, spellbook, atlas, spellbookPreset, atlasPreset) =>
    set((state) => ({
      cardbackUrls: {
        ...state.cardbackUrls,
        [who]: {
          spellbook,
          atlas,
          spellbookPreset: spellbookPreset ?? null,
          atlasPreset: atlasPreset ?? null,
        },
      },
    })),
  setGridColor: (color: "white" | "black") => set({ gridColor: color }),
  setGridBlend: (blend: "normal" | "subtract") => set({ gridBlend: blend }),

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
    const scheduleRemoval = () => {
      try {
        get().removeBoardPing(id);
      } catch {}
    };
    if (typeof window !== "undefined") {
      window.setTimeout(scheduleRemoval, timeout);
    } else {
      setTimeout(scheduleRemoval, timeout);
    }
  },

  removeBoardPing: (id) =>
    set((state) => {
      const filtered = state.boardPings.filter((entry) => entry.id !== id);
      if (filtered.length === state.boardPings.length) {
        return state as GameState;
      }
      return { boardPings: filtered } as Partial<GameState> as GameState;
    }),

  setLastPointerWorldPos: (pos) => set({ lastPointerWorldPos: pos }),

  draggingSite: null,

  setDraggingSite: (dragging) => set({ draggingSite: dragging }),

  updateDraggingSitePos: (x, z) =>
    set((state) => {
      if (!state.draggingSite) return state;
      return {
        draggingSite: {
          ...state.draggingSite,
          worldPos: { x, z },
        },
      } as Partial<GameState> as GameState;
    }),

  dropDraggingSite: (targetX, targetY) => {
    const state = get();
    const dragging = state.draggingSite;
    if (!dragging) return;

    // Parse source coordinates from sourceKey
    const [srcXStr, srcYStr] = dragging.sourceKey.split(",");
    const srcX = parseInt(srcXStr, 10);
    const srcY = parseInt(srcYStr, 10);

    // Clear dragging state first
    set({ draggingSite: null });

    // If dropped on same tile, do nothing
    if (srcX === targetX && srcY === targetY) return;

    // Use switchSitePosition to move the site
    get().switchSitePosition(srcX, srcY, targetX, targetY);
  },
});
