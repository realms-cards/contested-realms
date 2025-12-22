import type { StateCreator } from "zustand";
import type { BoardPingEvent, CellKey, GameState, SiteTile } from "./types";
import { BOARD_PING_LIFETIME_MS, BOARD_PING_MAX_HISTORY } from "./types";

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
  | "showOwnershipOverlay"
  | "cardScale"
  | "boardPings"
  | "lastPointerWorldPos"
  | "draggingSite"
>;

export const createInitialBoardUiState = (): BoardUiDefaults => ({
  showGridOverlay: false,
  showPlaymat: true,
  showPlaymatOverlay: false, // Default: show playmat, hide grid overlay
  playmatUrl: null, // null until user's preference is loaded
  playmatUrls: { p1: null, p2: null }, // Per-player custom playmat URLs
  activePlaymatOwner: null, // null = use own playmat, "p1"/"p2" = show that player's playmat
  cardbackUrls: {
    p1: {
      spellbook: null,
      atlas: null,
      preset: null,
    },
    p2: {
      spellbook: null,
      atlas: null,
      preset: null,
    },
  },
  gridColor: "white",
  gridBlend: "normal",
  allowSiteDrag: false, // Default: sites cannot be freely dragged on board
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
  | "showOwnershipOverlay"
  | "toggleGridOverlay"
  | "togglePlaymat"
  | "togglePlaymatOverlay"
  | "toggleAllowSiteDrag"
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
  togglePlaymat: () => set((state) => ({ showPlaymat: !state.showPlaymat })),
  togglePlaymatOverlay: () =>
    set((state) => ({ showPlaymatOverlay: !state.showPlaymatOverlay })),
  toggleAllowSiteDrag: () =>
    set((state) => ({ allowSiteDrag: !state.allowSiteDrag })),
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
  setCardbackUrls: (who, spellbook, atlas, preset) =>
    set((state) => ({
      cardbackUrls: {
        ...state.cardbackUrls,
        [who]: {
          spellbook,
          atlas,
          preset: preset ?? null,
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
