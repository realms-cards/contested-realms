import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { GameState, PlayerKey, SerializedGame } from "./types";
import {
  loadHistoryFromStorage,
  saveHistoryToStorage,
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
  | "opponentPlayerId"
  | "setOpponentPlayerId"
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
      // Persist current snapshots for the old match
      const currentSnaps = Array.isArray(state.snapshots)
        ? (state.snapshots as GameState["snapshots"])
        : ([] as unknown as GameState["snapshots"]);
      try {
        saveSnapshotsToStorageFor(prevId, currentSnaps);
      } catch {}
      // Persist current history for the old match
      try {
        saveHistoryToStorage(prevId, {
          history: state.history,
          historyByPlayer: state.historyByPlayer as Record<
            PlayerKey,
            SerializedGame[]
          >,
        });
      } catch {}
      // Load snapshots and history for the new match
      const loaded = loadSnapshotsFromStorageFor(nextId);
      const persisted = loadHistoryFromStorage(nextId);
      return {
        matchId: nextId,
        snapshots: loaded,
        history: persisted?.history ?? [],
        historyByPlayer: persisted?.historyByPlayer ?? { p1: [], p2: [] },
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
        snap.actorKey ? snap : { ...snap, actorKey: key },
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
      // Online mode: reset opponent's guide prefs to false (unknown until they sync)
      // and send our own guide preferences so the opponent knows our state.
      const opponentSeat: PlayerKey = key === "p1" ? "p2" : "p1";
      const localCombat = !!get().interactionGuides;
      const localMagic = !!get().magicGuides;
      set((state) => {
        const combatPrefs = {
          ...state.combatGuideSeatPrefs,
          [key]: localCombat,
          [opponentSeat]: false,
        } as Record<PlayerKey, boolean>;
        const magicPrefs = {
          ...state.magicGuideSeatPrefs,
          [key]: localMagic,
          [opponentSeat]: false,
        } as Record<PlayerKey, boolean>;
        return {
          combatGuideSeatPrefs: combatPrefs,
          combatGuidesActive: combatPrefs.p1 && combatPrefs.p2,
          magicGuideSeatPrefs: magicPrefs,
          magicGuidesActive: magicPrefs.p1 && magicPrefs.p2,
        } as Partial<GameState> as GameState;
      });
      // Send initial guide preferences so the opponent can update their state
      try {
        const transport = get().transport;
        transport?.sendMessage?.({
          type: "guidePref",
          seat: key,
          combatGuides: localCombat,
          magicGuides: localMagic,
        } as unknown as CustomMessage);
      } catch {}

      try {
        get().flushPendingPatches();
      } catch {}
    }
  },

  localPlayerId: null,
  setLocalPlayerId: (id: string | null) => set({ localPlayerId: id ?? null }),

  opponentPlayerId: null,
  setOpponentPlayerId: (id: string | null) =>
    set({ opponentPlayerId: id ?? null }),
});
