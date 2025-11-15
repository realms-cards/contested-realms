import type { StateCreator } from "zustand";
import type {
  GameState,
  PlayerKey,
  SerializedGame,
} from "./types";
import {
  loadSnapshotsFromStorageFor,
  saveSnapshotsToStorageFor,
} from "./utils/snapshotHelpers";

type SessionSlice = Pick<
  GameState,
  | "matchId"
  | "setMatchId"
  | "actorKey"
  | "setActorKey"
  | "localPlayerId"
  | "setLocalPlayerId"
>;

export const createSessionSlice: StateCreator<
  GameState,
  [],
  [],
  SessionSlice
> = (set, get) => ({
  matchId: null,
  setMatchId: (id) =>
    set((state) => {
      const prevId = state.matchId ?? null;
      const nextId = id ?? null;
      if (prevId === nextId) return state as GameState;
      const currentSnaps = Array.isArray(state.snapshots)
        ? (state.snapshots as GameState["snapshots"])
        : ([] as unknown as GameState["snapshots"]);
      try {
        saveSnapshotsToStorageFor(prevId, currentSnaps);
      } catch {}
      const loaded = loadSnapshotsFromStorageFor(nextId);
      return {
        matchId: nextId,
        snapshots: loaded,
      } as Partial<GameState> as GameState;
    }),

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

  localPlayerId: null,
  setLocalPlayerId: (id: string | null) =>
    set({ localPlayerId: id ?? null }),
});
