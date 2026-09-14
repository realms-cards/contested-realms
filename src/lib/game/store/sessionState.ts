import type { StateCreator } from "zustand";
import { guidesForcedOn } from "./preferenceState";
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
    const prevKey = get().actorKey;
    if (prevKey === key) return;
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
      // A new seat was assigned: the opponent's guide prefs are unknown until
      // they sync, so reset them and announce ours. The opponent answers a
      // fresh announcement with its own pref (see the guidePref handler), so
      // both sides converge regardless of join order or reloads.
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
        const forced = guidesForcedOn({
          actorKey: key,
          opponentPlayerId: state.opponentPlayerId,
        });
        return {
          combatGuideSeatPrefs: combatPrefs,
          combatGuidesActive: forced || (combatPrefs.p1 && combatPrefs.p2),
          magicGuideSeatPrefs: magicPrefs,
          magicGuidesActive: forced || (magicPrefs.p1 && magicPrefs.p2),
        } as Partial<GameState> as GameState;
      });
      try {
        get().announceGuidePrefs(false);
      } catch {}

      try {
        get().flushPendingPatches();
      } catch {}
    } else {
      // Leaving the online session: guided flows need a seat.
      set({
        combatGuidesActive: false,
        magicGuidesActive: false,
      } as Partial<GameState> as GameState);
    }
  },

  localPlayerId: null,
  setLocalPlayerId: (id: string | null) => set({ localPlayerId: id ?? null }),

  opponentPlayerId: null,
  setOpponentPlayerId: (id: string | null) =>
    set((state) => {
      const next = { actorKey: state.actorKey, opponentPlayerId: id ?? null };
      const forced = guidesForcedOn(next);
      if (forced === guidesForcedOn(state)) {
        return { opponentPlayerId: next.opponentPlayerId } as Partial<GameState> as GameState;
      }
      // Entering or leaving a vs-CPU match: always-on guides, else the handshake result.
      return {
        opponentPlayerId: next.opponentPlayerId,
        combatGuidesActive:
          forced ||
          (!!state.combatGuideSeatPrefs?.p1 && !!state.combatGuideSeatPrefs?.p2),
        magicGuidesActive:
          forced ||
          (!!state.magicGuideSeatPrefs?.p1 && !!state.magicGuideSeatPrefs?.p2),
      } as Partial<GameState> as GameState;
    }),
});
