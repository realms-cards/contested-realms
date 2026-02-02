import type { StateCreator } from "zustand";
import type {
  GameState,
  PlayerKey,
  SerializedGame,
  ServerPatchT,
} from "./types";

const HISTORY_LIMIT = 3;
const UNDO_RETRY_LIMIT = 5;
let undoRetryCount = 0;

type HistorySlice = Pick<
  GameState,
  "history" | "historyByPlayer" | "pushHistory" | "undo"
>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const buildSnapshot = (state: GameState): SerializedGame => ({
  snapshotTs: Date.now(),
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
  portalState: state.portalState ? clone(state.portalState) : null,
});

// Build permanents patch for undo: restores only OWN permanents.
// IMPORTANT: Opponent CAN act during our turn (move/tap cards, response cards),
// so their permanents in our snapshot may be stale. We only restore our own
// permanents to avoid overwriting opponent's valid actions.
// Trade-off: Effects we had on opponent's permanents won't be undone,
// but at least we won't corrupt their state.
const buildPermanentsPatchForUndo = (
  snapshotPermanents: GameState["permanents"],
  currentPermanents: GameState["permanents"],
  ownerNum: 1 | 2,
): GameState["permanents"] => {
  // Map instanceId -> cellKey from snapshot for OUR permanents only
  const snapshotIdToCell = new Map<string, string>();
  for (const [cellKey, items] of Object.entries(snapshotPermanents)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item.instanceId && item.owner === ownerNum) {
        snapshotIdToCell.set(item.instanceId, cellKey);
      }
    }
  }

  // Start with OUR permanents from snapshot only
  const result: GameState["permanents"] = {};
  for (const [cellKey, items] of Object.entries(snapshotPermanents)) {
    if (!Array.isArray(items)) continue;
    const ours = items.filter((item) => item.owner === ownerNum);
    if (ours.length > 0) {
      result[cellKey] = clone(ours);
    }
  }

  // Find OUR current permanents that need removal:
  // 1. Our permanents not in snapshot (played after snapshot)
  // 2. Our permanents that MOVED to a different cell (e.g., artifact dropped then attached)
  for (const [cellKey, items] of Object.entries(currentPermanents)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item.instanceId || item.owner !== ownerNum) continue;
      const snapshotCell = snapshotIdToCell.get(item.instanceId);
      // Mark for removal if: not in snapshot OR in a different cell than snapshot
      if (!snapshotCell || snapshotCell !== cellKey) {
        if (!result[cellKey]) result[cellKey] = [];
        result[cellKey].push({
          ...item,
          __remove: true,
        } as typeof item);
      }
    }
  }

  return result;
};

const sanitizeBoardSitesForUndo = (
  board: GameState["board"] | undefined,
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
      // PRODUCTION HARDENING: Block undo during critical game phases
      // to prevent state corruption or desync issues

      // Block during active combat
      if (state.pendingCombat) {
        try {
          get().log("Cannot undo during active combat");
        } catch {}
        return state as GameState;
      }

      // Block during mulligan phase (before mulligan decision made)
      const me = state.actorKey as PlayerKey | null;
      if (me && state.phase === "Setup" && state.mulligans[me] === 0) {
        try {
          get().log("Cannot undo during mulligan phase");
        } catch {}
        return state as GameState;
      }

      // Block during active spell/ability resolution phases
      // Check for any pending resolution that could cause issues if undone mid-resolution
      const hasPendingResolution =
        state.pendingMagic ||
        state.pendingChaosTwister?.phase === "minigame" ||
        state.pendingBrowse?.phase === "viewing" ||
        state.pendingBrowse?.phase === "ordering" ||
        state.pendingSearingTruth?.phase === "revealing" ||
        state.pendingAccusation?.phase === "selecting" ||
        state.pendingInterrogatorChoice?.phase === "pending" ||
        state.pendingAnimistCast ||
        state.pendingHeadlessHauntMove?.phase === "choosing";

      if (hasPendingResolution) {
        try {
          get().log("Cannot undo while resolving a card effect");
        } catch {}
        return state as GameState;
      }

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
                },
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
                },
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

        const perCount = Object.values(prev.permanents || {}).reduce(
          (a, v) => a + (Array.isArray(v) ? v.length : 0),
          0,
        );

        const boardForUndo = sanitizeBoardSitesForUndo(prev.board);

        // CRITICAL FIX: Only restore our own seat's data in the patch.
        // We do NOT include opponent data and do NOT use __replaceKeys for
        // player-specific fields. This ensures opponent's state is preserved
        // via merge logic rather than being replaced with our stale view.
        const me = state.actorKey as PlayerKey;

        // For player-specific data, we only send OUR seat's snapshot data.
        // The applyServerPatch merge logic will only update our seat.
        const zonesForUndo = {
          [me]: prev.zones[me],
        } as Partial<Record<PlayerKey, typeof prev.zones.p1>>;

        const mulligansForUndo = {
          [me]: prev.mulligans[me],
        } as Partial<Record<PlayerKey, number>>;
        const mulliganDrawnForUndo = {
          [me]: prev.mulliganDrawn[me],
        } as Partial<Record<PlayerKey, typeof prev.mulliganDrawn.p1>>;

        const avatarsForUndo = {
          [me]: prev.avatars[me],
        } as Partial<Record<PlayerKey, typeof prev.avatars.p1>>;

        // CRITICAL FIX: Build permanents patch with proper removal markers.
        // Only restore OWN permanents - opponent can act during our turn
        // (move/tap cards, response cards), so their state may have changed.
        const myOwnerNum = me === "p1" ? 1 : 2;
        const permanentsForUndo = buildPermanentsPatchForUndo(
          prev.permanents,
          state.permanents,
          myOwnerNum as 1 | 2,
        );

        // CRITICAL: Do NOT include zones, avatars, mulligans, mulliganDrawn,
        // permanents, permanentPositions, permanentAbilities in __replaceKeys!
        // These contain player-specific data and should be MERGED,
        // not replaced. This prevents wiping opponent's state with our stale view.
        const patch: ServerPatchT = {
          players: prev.players,
          currentPlayer: prev.currentPlayer,
          turn: prev.turn,
          phase: prev.phase,
          d20Rolls: prev.d20Rolls,
          setupWinner: prev.setupWinner,
          board: boardForUndo,
          zones: zonesForUndo,
          avatars: avatarsForUndo,
          permanents: permanentsForUndo,
          mulligans: mulligansForUndo,
          mulliganDrawn: mulliganDrawnForUndo,
          permanentPositions: prev.permanentPositions,
          permanentAbilities: prev.permanentAbilities,
          sitePositions: prev.sitePositions,
          playerPositions: prev.playerPositions,
          events: prev.events,
          eventSeq: prev.eventSeq,
          portalState: prev.portalState,
          // REPLAY TRUNCATION: Tell server to remove actions after this timestamp
          // This ensures replays don't include the undone actions
          __snapshotTs: prev.snapshotTs,
          __replaceKeys: [
            // Shared game state - safe to replace
            "players",
            "currentPlayer",
            "turn",
            "phase",
            "d20Rolls",
            "setupWinner",
            "board",
            "sitePositions",
            "playerPositions",
            "events",
            "eventSeq",
            "portalState",
            // NOTE: zones, avatars, mulligans, mulliganDrawn, permanents,
            // permanentPositions, permanentAbilities are NOT here!
            // They contain player-specific data and will be MERGED to preserve opponent state.
          ],
        } as ServerPatchT;
        try {
          console.debug(
            "[undo] Broadcasting authoritative snapshot to server",
            {
              keys: patch.__replaceKeys,
              eventSeq: patch.eventSeq,
              permanentsCount: perCount,
            },
          );
        } catch {}
        get().trySendPatch(patch);

        // Also apply state locally (don't just wait for server echo)
        // For local application, we DO want full zones (preserving opponent)
        const opponent: PlayerKey = me === "p1" ? "p2" : "p1";
        const localZones = {
          [me]: prev.zones[me],
          [opponent]: state.zones[opponent],
        } as Record<PlayerKey, typeof prev.zones.p1>;
        const localAvatars = {
          [me]: prev.avatars[me],
          [opponent]: state.avatars[opponent],
        } as Record<PlayerKey, typeof prev.avatars.p1>;
        const localMulligans = {
          [me]: prev.mulligans[me],
          [opponent]: state.mulligans[opponent],
        } as Record<PlayerKey, number>;
        const localMulliganDrawn = {
          [me]: prev.mulliganDrawn[me],
          [opponent]: state.mulliganDrawn[opponent],
        } as Record<PlayerKey, typeof prev.mulliganDrawn.p1>;

        // Merge permanents: our snapshot permanents + opponent's current permanents.
        // Opponent can act during our turn, so we preserve their current state.
        const opponentOwnerNum = me === "p1" ? 2 : 1;
        const localPermanents: GameState["permanents"] = {};
        // Add our permanents from snapshot
        for (const [cellKey, items] of Object.entries(prev.permanents)) {
          if (!Array.isArray(items)) continue;
          const ours = items.filter((item) => item.owner === myOwnerNum);
          if (ours.length > 0) {
            localPermanents[cellKey] = [
              ...(localPermanents[cellKey] || []),
              ...ours,
            ];
          }
        }
        // Add opponent's permanents from current state
        for (const [cellKey, items] of Object.entries(state.permanents)) {
          if (!Array.isArray(items)) continue;
          const theirs = items.filter(
            (item) => item.owner === opponentOwnerNum,
          );
          if (theirs.length > 0) {
            localPermanents[cellKey] = [
              ...(localPermanents[cellKey] || []),
              ...theirs,
            ];
          }
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
          board: boardForUndo,
          zones: localZones,
          avatars: localAvatars,
          permanents: localPermanents,
          mulligans: localMulligans,
          mulliganDrawn: localMulliganDrawn,
          permanentPositions: prev.permanentPositions,
          permanentAbilities: prev.permanentAbilities,
          sitePositions: prev.sitePositions,
          playerPositions: prev.playerPositions,
          events: prev.events,
          eventSeq: prev.eventSeq,
          portalState: prev.portalState,
          // CRITICAL: Clear pending resolver states to prevent card duplication bugs
          pendingSearingTruth: null,
          pendingBrowse: null,
          pendingAccusation: null,
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
        portalState: prev.portalState,
        // CRITICAL: Clear pending resolver states to prevent card duplication bugs
        pendingSearingTruth: null,
        pendingBrowse: null,
        pendingAccusation: null,
      } as Partial<GameState> as GameState;
    }),
});
