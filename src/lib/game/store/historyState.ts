import type { StateCreator } from "zustand";
import type {
  GameState,
  PlayerKey,
  SerializedGame,
  ServerPatchT,
} from "./types";

const HISTORY_LIMIT = 10;
const UNDO_RETRY_LIMIT = 5;
let undoRetryCount = 0;

type HistorySlice = Pick<
  GameState,
  "history" | "historyByPlayer" | "pushHistory" | "undo"
>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const buildSnapshot = (state: GameState): SerializedGame => ({
  actorKey: state.actorKey ?? null,
  players: clone(state.players),
  currentPlayer: state.currentPlayer,
  turn: state.turn,
  phase: state.phase,
  d20Rolls: clone(state.d20Rolls),
  setupWinner: state.setupWinner,
  board: clone(state.board),
  showGridOverlay: state.showGridOverlay,
  showPlaymat: state.showPlaymat,
  cameraMode: state.cameraMode,
  zones: clone(state.zones),
  selectedCard: state.selectedCard ? clone(state.selectedCard) : null,
  selectedPermanent: state.selectedPermanent
    ? { ...state.selectedPermanent }
    : null,
  avatars: clone(state.avatars),
  permanents: clone(state.permanents),
  mulligans: clone(state.mulligans),
  mulliganDrawn: clone(state.mulliganDrawn),
  permanentPositions: clone(state.permanentPositions),
  permanentAbilities: clone(state.permanentAbilities),
  sitePositions: clone(state.sitePositions),
  playerPositions: clone(state.playerPositions),
  events: clone(state.events),
  eventSeq: state.eventSeq,
});

const sanitizeBoardSitesForUndo = (
  board: GameState["board"] | undefined
): GameState["board"] | undefined => {
  if (!board || typeof board !== "object") return board;
  const sitesPrev = board.sites;
  if (!sitesPrev || typeof sitesPrev !== "object") return board;
  let changed = false;
  const sitesNext: typeof sitesPrev = {};
  for (const key of Object.keys(sitesPrev)) {
    const tile = sitesPrev[key];
    if (
      tile &&
      typeof tile === "object" &&
      Object.prototype.hasOwnProperty.call(tile, "tapped")
    ) {
      const cleaned = { ...(tile as Record<string, unknown>) };
      delete cleaned.tapped;
      sitesNext[key] = cleaned as (typeof sitesPrev)[typeof key];
      changed = true;
    } else {
      sitesNext[key] = tile as (typeof sitesPrev)[typeof key];
    }
  }
  if (!changed) return board;
  return {
    ...board,
    sites: sitesNext,
  };
};

type HistoryDefaults = Pick<GameState, "history" | "historyByPlayer">;

export const createInitialHistoryState = (): HistoryDefaults => ({
  history: [],
  historyByPlayer: { p1: [], p2: [] },
});

export const createHistorySlice: StateCreator<
  GameState,
  [],
  [],
  HistorySlice
> = (set, get, store) => ({
  ...createInitialHistoryState(),

  pushHistory: () =>
    set((state) => {
      const snap = buildSnapshot(state);
      const nextHist = [...state.history, snap];
      if (nextHist.length > HISTORY_LIMIT) nextHist.shift();

      const hb = { ...state.historyByPlayer } as Record<
        PlayerKey,
        SerializedGame[]
      >;
      if (state.actorKey) {
        const me = state.actorKey as PlayerKey;
        const nextPlayerHist = [...(hb[me] || []), snap];
        if (nextPlayerHist.length > HISTORY_LIMIT) nextPlayerHist.shift();
        hb[me] = nextPlayerHist;
      }
      return {
        history: nextHist,
        historyByPlayer: hb,
      } as Partial<GameState> as GameState;
    }),

  undo: () =>
    set((state) => {
      const hb = { ...state.historyByPlayer } as Record<
        PlayerKey,
        SerializedGame[]
      >;
      let prev: SerializedGame | null = null;
      let historyNext: SerializedGame[] | null = null;

      if (state.actorKey && hb[state.actorKey]?.length) {
        const me = state.actorKey as PlayerKey;
        const arr = [...hb[me]];
        prev = arr.pop() || null;
        hb[me] = arr;
      }

      if (!prev) {
        if (!state.history.length) {
          if (state.transport) {
            try {
              get().log("Nothing to undo for your seat yet");
            } catch {}
          }
          return state as GameState;
        }
        const nextHist = [...state.history];
        let candidate: SerializedGame | null = null;
        while (nextHist.length) {
          const maybe = nextHist.pop() || null;
          if (!maybe) continue;
          const snapshotActor = maybe.actorKey ?? null;
          const isOnline = !!state.transport;
          if (
            !isOnline ||
            snapshotActor === null ||
            snapshotActor === state.actorKey
          ) {
            candidate = maybe;
            break;
          }
        }
        if (!candidate) {
          if (state.transport) {
            try {
              get().log("Nothing to undo for your seat yet");
            } catch {}
          }
          return state as GameState;
        }
        prev = candidate;
        historyNext = nextHist;
      }

      if (!prev) return state as GameState;

      const tr = state.transport;
      const isOnlineWithSeat = tr && state.actorKey;

      // For offline/hotseat play (no actorKey), use direct state restoration
      // Only use the patch-based approach when we have an actorKey (online play)
      if (isOnlineWithSeat) {
        if ((state.lastServerTs ?? 0) < (state.lastLocalActionTs ?? 0)) {
          undoRetryCount++;
          if (undoRetryCount >= UNDO_RETRY_LIMIT) {
            try {
              console.warn(
                "[undo] Max retry limit reached, proceeding with undo anyway",
                {
                  lastServerTs: state.lastServerTs,
                  lastLocalActionTs: state.lastLocalActionTs,
                  retries: undoRetryCount,
                }
              );
            } catch {}
            undoRetryCount = 0;
            // Fall through to proceed with undo
          } else {
            try {
              console.debug(
                "[undo] Delaying undo until server ack catches up",
                {
                  lastServerTs: state.lastServerTs,
                  lastLocalActionTs: state.lastLocalActionTs,
                  retryCount: undoRetryCount,
                }
              );
            } catch {}
            setTimeout(() => {
              try {
                store?.getState().undo();
              } catch {}
            }, 120);
            return state as GameState;
          }
        } else {
          // Reset retry counter on successful ack catch-up
          undoRetryCount = 0;
        }

        try {
          const perCount = Object.values(prev.permanents || {}).reduce(
            (a, v) => a + (Array.isArray(v) ? v.length : 0),
            0
          );

          const boardForUndo = sanitizeBoardSitesForUndo(prev.board);

          // Only restore our own zones, preserve opponent's current zones
          // to avoid undoing their draws/actions
          const me = state.actorKey as PlayerKey;
          const opponent: PlayerKey = me === "p1" ? "p2" : "p1";
          const zonesForUndo = {
            [me]: prev.zones[me],
            [opponent]: state.zones[opponent],
          } as Record<PlayerKey, typeof prev.zones.p1>;

          // Similarly, only restore our own mulligan state
          const mulligansForUndo = {
            [me]: prev.mulligans[me],
            [opponent]: state.mulligans[opponent],
          } as Record<PlayerKey, number>;
          const mulliganDrawnForUndo = {
            [me]: prev.mulliganDrawn[me],
            [opponent]: state.mulliganDrawn[opponent],
          } as Record<PlayerKey, typeof prev.mulliganDrawn.p1>;

          const patch: ServerPatchT = {
            players: prev.players,
            currentPlayer: prev.currentPlayer,
            turn: prev.turn,
            phase: prev.phase,
            d20Rolls: prev.d20Rolls,
            setupWinner: prev.setupWinner,
            board: boardForUndo,
            zones: zonesForUndo,
            avatars: prev.avatars,
            permanents: prev.permanents,
            mulligans: mulligansForUndo,
            mulliganDrawn: mulliganDrawnForUndo,
            permanentPositions: prev.permanentPositions,
            permanentAbilities: prev.permanentAbilities,
            sitePositions: prev.sitePositions,
            playerPositions: prev.playerPositions,
            events: prev.events,
            eventSeq: prev.eventSeq,
            __replaceKeys: [
              "players",
              "currentPlayer",
              "turn",
              "phase",
              "d20Rolls",
              "setupWinner",
              "board",
              "zones",
              "avatars",
              "permanents",
              "mulligans",
              "mulliganDrawn",
              "permanentPositions",
              "permanentAbilities",
              "sitePositions",
              "playerPositions",
              "events",
              "eventSeq",
            ],
          } as ServerPatchT;
          try {
            console.debug(
              "[undo] Broadcasting authoritative snapshot to server",
              {
                keys: patch.__replaceKeys,
                eventSeq: patch.eventSeq,
                permanentsCount: perCount,
              }
            );
          } catch {}
          get().trySendPatch(patch);
        } catch {}

        return {
          history: historyNext ?? state.history,
          historyByPlayer: hb as GameState["historyByPlayer"],
        } as Partial<GameState> as GameState;
      }

      return {
        history: historyNext ?? state.history,
        historyByPlayer: hb as GameState["historyByPlayer"],
        players: prev.players,
        currentPlayer: prev.currentPlayer,
        turn: prev.turn,
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
        permanentPositions: prev.permanentPositions,
        permanentAbilities: prev.permanentAbilities,
        sitePositions: prev.sitePositions,
        playerPositions: prev.playerPositions,
        events: prev.events,
        eventSeq: prev.eventSeq,
      } as Partial<GameState> as GameState;
    }),
});
