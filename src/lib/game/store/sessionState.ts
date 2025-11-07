import type { StateCreator } from "zustand";
import type {
  GameState,
  PlayerKey,
  SerializedGame,
  ServerPatchT,
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
  | "snapshots"
  | "createSnapshot"
  | "hydrateSnapshotsFromStorage"
>;

const initialSnapshots = (): GameState["snapshots"] =>
  (typeof window !== "undefined"
    ? loadSnapshotsFromStorageFor(null)
    : []) as unknown as GameState["snapshots"];

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

  snapshots: initialSnapshots(),
  createSnapshot: (title: string, kind: "auto" | "manual" = "manual") =>
    set((state) => {
      const id = `ss_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const payload: ServerPatchT = JSON.parse(
        JSON.stringify({
          players: state.players,
          currentPlayer: state.currentPlayer,
          turn: state.turn,
          phase: state.phase,
          board: state.board,
          zones: state.zones,
          avatars: state.avatars,
          permanents: state.permanents,
          permanentPositions: state.permanentPositions,
          permanentAbilities: state.permanentAbilities,
          sitePositions: state.sitePositions,
          playerPositions: state.playerPositions,
          events: state.events,
          eventSeq: state.eventSeq,
        })
      ) as ServerPatchT;
      const item = {
        id,
        title:
          title && title.length > 0
            ? title
            : kind === "auto"
            ? `Turn ${state.turn} start (P${state.currentPlayer})`
            : "Realm Archive",
        ts: Date.now(),
        includePrivate: true,
        kind,
        turn: state.turn,
        actor: state.actorKey ?? null,
        payload,
      };
      const prev = Array.isArray(state.snapshots) ? state.snapshots : [];
      let list: typeof prev;
      if (kind === "manual") {
        const withoutManual = prev.filter((x) => x.kind !== "manual");
        list = [...withoutManual, item];
      } else {
        const autos = prev.filter((x) => x.kind === "auto");
        const nonAutos = prev.filter((x) => x.kind !== "auto");
        const keep = autos.slice(Math.max(autos.length - 4, 0));
        list = [...nonAutos, ...keep, item];
      }
      try {
        get().log(`Saved snapshot '${item.title}'`);
      } catch {}
      try {
        saveSnapshotsToStorageFor(
          get().matchId ?? null,
          list as GameState["snapshots"]
        );
      } catch {}
      return { snapshots: list } as Partial<GameState> as GameState;
    }),

  hydrateSnapshotsFromStorage: () =>
    set((state) => {
      const snaps = loadSnapshotsFromStorageFor(state.matchId ?? null);
      return { snapshots: snaps } as Partial<GameState> as GameState;
    }),
});
