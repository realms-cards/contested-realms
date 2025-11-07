import type { StateCreator } from "zustand";
import type { BoardPingEvent, GameState } from "./types";
import {
  BOARD_PING_LIFETIME_MS,
  BOARD_PING_MAX_HISTORY,
} from "./types";

export type BoardUiSlice = Pick<
  GameState,
  | "showGridOverlay"
  | "showPlaymat"
  | "toggleGridOverlay"
  | "togglePlaymat"
  | "boardPings"
  | "pushBoardPing"
  | "removeBoardPing"
  | "lastPointerWorldPos"
  | "setLastPointerWorldPos"
>;

export const createBoardUiSlice: StateCreator<
  GameState,
  [],
  [],
  BoardUiSlice
> = (set, get) => ({
  showGridOverlay: false,
  showPlaymat: true,
  boardPings: [],
  lastPointerWorldPos: null,

  toggleGridOverlay: () =>
    set((state) => ({ showGridOverlay: !state.showGridOverlay })),
  togglePlaymat: () =>
    set((state) => ({ showPlaymat: !state.showPlaymat })),

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
});
