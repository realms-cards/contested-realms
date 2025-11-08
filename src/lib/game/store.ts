import { create, type StateCreator } from "zustand";
import type {
  InteractionEnvelope,
  InteractionGrant,
  InteractionGrantRequest,
  InteractionDecision,
  InteractionMessage,
  InteractionRequestMessage,
  InteractionResponseMessage,
  InteractionRequestKind,
  InteractionResultMessage,
} from "@/lib/net/interactions";
import {
  wrapInteractionMessage,
  grantFromRequest,
  generateInteractionRequestId,
  createInteractionRequest,
  createInteractionResponse,
} from "@/lib/net/interactions";
import type { GameTransport, CustomMessage } from "@/lib/net/transport";
import type {
  AvatarState,
  BoardPingEvent,
  BoardSize,
  BoardState,
  CardRef,
  CellKey,
  GameEvent,
  GameState,
  InteractionRecordStatus,
  InteractionRequestEntry,
  InteractionResponseOptions,
  InteractionStateMap,
  Permanents,
  PermanentItem,
  Phase,
  PlayerKey,
  PlayerState,
  RemoteCursorState,
  ServerPatchT,
  SendInteractionRequestInput,
  SerializedGame,
  SiteTile,
  Thresholds,
  Zones,
} from "./store/types";
import {
  BOARD_PING_LIFETIME_MS,
  BOARD_PING_MAX_HISTORY,
} from "./store/types";
import type { PlayerPositionReference } from "./types";
import {
  createEmptyZonesRecord,
  normalizeZones,
} from "./store/utils/zoneHelpers";
import {
  bumpPermanentVersion,
  ensurePermanentVersion,
  normalizePermanentsRecord,
} from "./store/utils/permanentHelpers";
import {
  cloneCardForPatch,
  clonePatchForQueue,
  deepMergeReplaceArrays,
  mergePermanentsMap,
  type PermanentDeltaUpdate,
} from "./store/utils/patchHelpers";
import {
  createDefaultPlayerPositions,
  normalizePlayerPositions,
} from "./store/utils/positionHelpers";
import {
  createDefaultAvatars,
  normalizeAvatars,
} from "./store/utils/avatarHelpers";
import { mergeEvents } from "./store/utils/eventHelpers";
import { computeAvailableMana, computeThresholdTotals } from "./store/utils/resourceHelpers";
import {
  clearSnapshotsStorageFor,
  loadSnapshotsFromStorageFor,
  saveSnapshotsToStorageFor,
} from "./store/utils/snapshotHelpers";
import { createEventSlice } from "./store/eventState";
import { createDialogSlice } from "./store/dialogState";
import { createUiSlice } from "./store/uiState";
import { createBoardUiSlice } from "./store/boardUiState";
import { createBoardSlice } from "./store/boardState";
import { createHistorySlice } from "./store/historyState";
import { createCoreSlice } from "./store/coreState";
import { createResourceSlice } from "./store/resourceState";
import { createPermanentSlice } from "./store/permanentState";
import { createPositionSlice } from "./store/positionState";
import { createAvatarSlice } from "./store/avatarState";
import { createZoneSlice } from "./store/zoneState";
import { createPreferenceSlice } from "./store/preferenceState";
import { createCardMetaSlice } from "./store/cardMetaState";
import { createSessionSlice } from "./store/sessionState";
import { createRemoteCursorSlice } from "./store/remoteCursorState";
import {
  createTransportSlice,
  filterEchoPatchIfAny,
  setTransportStateAccessor,
} from "./store/transportState";
import { handleCustomMessage } from "./store/customMessageHandlers";
import { createInteractionSlice } from "./store/interactionState";
import { createGameActionsSlice } from "./store/gameActions";
import { createCombatSlice } from "./store/combatState";

function normalizeGrantRequest(
  candidate: unknown
): InteractionGrantRequest | null {
  if (!candidate || typeof candidate !== "object") return null;
  const src = candidate as Record<string, unknown>;
  const normalized: InteractionGrantRequest = {};
  if ("targetSeat" in src) {
    const seat = src.targetSeat;
    if (seat === "p1" || seat === "p2" || seat === null) {
      normalized.targetSeat = seat;
    }
  }
  if (typeof src.expiresAt === "number" && Number.isFinite(src.expiresAt)) {
    normalized.expiresAt = src.expiresAt;
  }
  if (typeof src.singleUse === "boolean") {
    normalized.singleUse = src.singleUse;
  }
  if (typeof src.allowOpponentZoneWrite === "boolean") {
    normalized.allowOpponentZoneWrite = src.allowOpponentZoneWrite;
  }
  if (typeof src.allowRevealOpponentHand === "boolean") {
    normalized.allowRevealOpponentHand = src.allowRevealOpponentHand;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function pickNextPendingInteraction(
  log: InteractionStateMap
): InteractionRequestEntry | null {
  let selected: InteractionRequestEntry | null = null;
  for (const entry of Object.values(log)) {
    if (!entry || entry.status !== "pending") continue;
    if (!selected) {
      selected = entry;
      continue;
    }
    if (selected.direction === "outbound" && entry.direction === "inbound") {
      selected = entry;
      continue;
    }
    if (
      entry.direction === selected.direction &&
      entry.receivedAt < selected.receivedAt
    ) {
      selected = entry;
    }
  }
  return selected;
}

function computeInteractionFocus(log: InteractionStateMap): {
  active: InteractionRequestEntry | null;
  pendingId: string | null;
} {
  const next = pickNextPendingInteraction(log);
  return {
    active: next,
    pendingId: next ? next.request.requestId : null,
  };
}

export {
  BOARD_PING_LIFETIME_MS,
  BOARD_PING_MAX_HISTORY,
  MAX_EVENTS,
  REMOTE_CURSOR_TTL_MS,
} from "./store/types";
export type {
  AvatarState,
  BoardPingEvent,
  BoardSize,
  BoardState,
  CardRef,
  CellKey,
  GameEvent,
  GameState,
  InteractionRecordStatus,
  InteractionRequestEntry,
  InteractionResponseOptions,
  InteractionStateMap,
  LifeState,
  Permanents,
  PermanentItem,
  Phase,
  PlayerKey,
  PlayerState,
  RemoteCursorState,
  ServerPatchT,
  SendInteractionRequestInput,
  SerializedGame,
  SiteTile,
  Thresholds,
  Zones,
} from "./store/types";

// Small random visual tilt for permanents to reduce overlap uniformity (radians ~ -0.05..+0.05)
// ---- Shared helpers (pure) -------------------------------------------------

// Build an updated avatars record with a new position/offset for a player.
function buildAvatarUpdate(
  s: GameState,
  who: PlayerKey,
  pos: [number, number],
  offset: [number, number] | null
): Record<PlayerKey, AvatarState> {
  const next = { ...s.avatars[who], pos, offset } as AvatarState;
  return { ...s.avatars, [who]: next } as Record<PlayerKey, AvatarState>;
}

const createGameStoreState: StateCreator<GameState> = (set, get, storeApi) => ({
  ...createEventSlice(set, get, storeApi),
  ...createDialogSlice(set, get, storeApi),
  ...createUiSlice(set, get, storeApi),
  ...createBoardSlice(set, get, storeApi),
  ...createBoardUiSlice(set, get, storeApi),
  ...createHistorySlice(set, get, storeApi),
  ...createCoreSlice(set, get, storeApi),
  ...createResourceSlice(set, get, storeApi),
  ...createPermanentSlice(set, get, storeApi),
  ...createPositionSlice(set, get, storeApi),
  ...createAvatarSlice(set, get, storeApi),
  ...createZoneSlice(set, get, storeApi),
  ...createGameActionsSlice(set, get, storeApi),
  ...createCombatSlice(set, get, storeApi),
  ...createPreferenceSlice(set, get, storeApi),
  ...createCardMetaSlice(set, get, storeApi),
  ...createSessionSlice(set, get, storeApi),
  ...createRemoteCursorSlice(set, get, storeApi),
  ...createInteractionSlice(set, get, storeApi),
  ...createTransportSlice(set, get, storeApi),

  // Track last applied server timestamp to drop stale patches
  lastServerTs: 0,
  // Track last local action send time to coordinate undo ordering in online play
  lastLocalActionTs: 0,
  // Multiplayer transport (injected by online play UI)
  receiveCustomMessage: (msg) => handleCustomMessage(msg, set, get),

  board: { size: { w: 5, h: 4 }, sites: {} },
  // Apply an incremental server patch into the store.
  // - Only whitelisted game-state fields are updated
  // - Arrays are replaced; objects are deep-merged
  // - UI/transient fields (drag, dialogs, selection, overlays, camera, history) are untouched
  applyServerPatch: (patch, t) =>
    set((s) => {
      if (!patch || typeof patch !== "object") return s as GameState;
      if (typeof t === "number" && t < (s.lastServerTs ?? 0))
        return s as GameState;

      let incoming = patch as ServerPatchT;
      const replaceKeysCandidateInitial = Array.isArray(incoming.__replaceKeys)
        ? incoming.__replaceKeys
        : null;
      if (!replaceKeysCandidateInitial || replaceKeysCandidateInitial.length === 0) {
        const echoResult = filterEchoPatchIfAny(incoming);
        if (echoResult.matched) {
          if (!echoResult.patch) {
            if (typeof t === "number") {
              const lastTsEcho = Math.max(s.lastServerTs ?? 0, t);
              if (lastTsEcho !== (s.lastServerTs ?? 0)) {
                return { ...s, lastServerTs: lastTsEcho } as GameState;
              }
            }
            return s as GameState;
          }
          incoming = echoResult.patch;
        }
      }

      const p = incoming as ServerPatchT;
      const next: Partial<GameState> = {};
      const replaceKeys = new Set<string>(
        Array.isArray(p.__replaceKeys) ? p.__replaceKeys : []
      );
      if (replaceKeys.size > 0) {
        try {
          console.debug("[net] applyServerPatch: authoritative snapshot", {
            keys: Array.from(replaceKeys),
            t: typeof t === "number" ? t : null,
            prevTs: s.lastServerTs ?? 0,
          });
          // Compact diagnostics when board/zones/permanents are involved
          if (
            replaceKeys.has("permanents") ||
            replaceKeys.has("zones") ||
            replaceKeys.has("board")
          ) {
            const prevPerCount = Object.values(s.permanents || {}).reduce(
              (a, v) => a + (Array.isArray(v) ? v.length : 0),
              0
            );
            const prevSiteCount =
              s.board && s.board.sites ? Object.keys(s.board.sites).length : 0;
            const prevHandP1 = s.zones?.p1?.hand?.length ?? 0;
            const prevHandP2 = s.zones?.p2?.hand?.length ?? 0;
            console.debug("[net] snapshot(prev)", {
              per: prevPerCount,
              sites: prevSiteCount,
              handP1: prevHandP1,
              handP2: prevHandP2,
            });
            const pPer = p.permanents
              ? Object.values(p.permanents as Record<string, unknown[]>).reduce(
                  (a, v) => a + (Array.isArray(v) ? v.length : 0),
                  0
                )
              : undefined;
            const pBoard = p.board as GameState["board"] | undefined;
            const pZones = p.zones as GameState["zones"] | undefined;
            const pSites = pBoard?.sites
              ? Object.keys(pBoard.sites).length
              : undefined;
            const pHandP1 = pZones?.p1?.hand?.length;
            const pHandP2 = pZones?.p2?.hand?.length;
            console.debug("[net] snapshot(patch)", {
              per: pPer,
              sites: pSites,
              handP1: pHandP1,
              handP2: pHandP2,
            });
          }
        } catch {}
      }

      if (p.players !== undefined) {
        next.players = replaceKeys.has("players")
          ? p.players
          : deepMergeReplaceArrays(s.players, p.players);
      }
      if (p.currentPlayer !== undefined) {
        next.currentPlayer = p.currentPlayer;
      }
      if (p.turn !== undefined) {
        next.turn = p.turn;
      }
      if (p.phase !== undefined) {
        next.phase = p.phase;
      }
      if (p.d20Rolls !== undefined) {
        next.d20Rolls = replaceKeys.has("d20Rolls")
          ? p.d20Rolls
          : deepMergeReplaceArrays(s.d20Rolls, p.d20Rolls);
        console.log("[applyServerPatch] Applied d20Rolls:", { prev: s.d20Rolls, new: next.d20Rolls, isReplace: replaceKeys.has("d20Rolls") });
      }
      const patchHasSetupWinner =
        p.setupWinner !== undefined ||
        Object.prototype.hasOwnProperty.call(p, "setupWinner");
      if (p.setupWinner !== undefined) next.setupWinner = p.setupWinner;
      if (!patchHasSetupWinner) {
        const derivedFromD20 = (() => {
          const source = (next.d20Rolls ?? s.d20Rolls) as
            | Record<PlayerKey, number | null>
            | undefined;
          if (!source) return null;
          const r1 = source.p1;
          const r2 = source.p2;
          if (r1 == null || r2 == null) return null;
          if (Number(r1) === Number(r2)) return null;
          return Number(r1) > Number(r2) ? "p1" : "p2";
        })();
        if (derivedFromD20 && next.setupWinner === undefined) {
          next.setupWinner = derivedFromD20;
        }
      }

      // Apply match end result from server so all clients reflect the outcome
      let shouldClearSnapshots = false;
      if (p.matchEnded !== undefined) {
        next.matchEnded = !!p.matchEnded;
        if (p.matchEnded === true) {
          shouldClearSnapshots = true;
        }
      }
      if (p.winner !== undefined) {
        next.winner = p.winner as PlayerKey | null;
      }

      if (p.board !== undefined) {
        next.board = replaceKeys.has("board")
          ? p.board
          : deepMergeReplaceArrays(s.board, p.board);
      }
      if (p.zones !== undefined) {
        const candidate = replaceKeys.has("zones")
          ? (p.zones as Partial<Record<PlayerKey, Partial<Zones>>>)
          : (deepMergeReplaceArrays(s.zones, p.zones) as Partial<
              Record<PlayerKey, Partial<Zones>>
            >);
        next.zones = normalizeZones(
          candidate,
          replaceKeys.has("zones") ? undefined : s.zones
        );
      }
      if (p.avatars !== undefined) {
        const candidate = replaceKeys.has("avatars")
          ? (p.avatars as Partial<Record<PlayerKey, Partial<AvatarState>>>)
          : (deepMergeReplaceArrays(s.avatars, p.avatars) as Partial<
              Record<PlayerKey, Partial<AvatarState>>
            >);
        next.avatars = normalizeAvatars(
          candidate,
          replaceKeys.has("avatars") ? undefined : s.avatars
        );
      }
      if (p.permanents !== undefined) {
        const source = replaceKeys.has("permanents")
          ? (p.permanents as Permanents)
          : mergePermanentsMap(s.permanents, p.permanents);
        next.permanents = normalizePermanentsRecord(
          source as Permanents
        ) as GameState["permanents"];
      }
      if (p.mulligans !== undefined) {
        next.mulligans = replaceKeys.has("mulligans")
          ? p.mulligans
          : deepMergeReplaceArrays(s.mulligans, p.mulligans);
      } else if (replaceKeys.has("mulligans")) {
        next.mulligans = { p1: 0, p2: 0 } as GameState["mulligans"];
      }
      if (p.mulliganDrawn !== undefined) {
        next.mulliganDrawn = replaceKeys.has("mulliganDrawn")
          ? p.mulliganDrawn
          : deepMergeReplaceArrays(s.mulliganDrawn, p.mulliganDrawn);
      } else if (replaceKeys.has("mulliganDrawn")) {
        next.mulliganDrawn = { p1: [], p2: [] } as GameState["mulliganDrawn"];
      }
      if (p.permanentPositions !== undefined) {
        next.permanentPositions = replaceKeys.has("permanentPositions")
          ? (p.permanentPositions as GameState["permanentPositions"])
          : deepMergeReplaceArrays(s.permanentPositions, p.permanentPositions);
      } else if (replaceKeys.has("permanentPositions")) {
        next.permanentPositions = {} as GameState["permanentPositions"];
      }
      if (p.permanentAbilities !== undefined) {
        next.permanentAbilities = replaceKeys.has("permanentAbilities")
          ? (p.permanentAbilities as GameState["permanentAbilities"])
          : deepMergeReplaceArrays(s.permanentAbilities, p.permanentAbilities);
      } else if (replaceKeys.has("permanentAbilities")) {
        next.permanentAbilities = {} as GameState["permanentAbilities"];
      }
      if (p.sitePositions !== undefined) {
        next.sitePositions = replaceKeys.has("sitePositions")
          ? (p.sitePositions as GameState["sitePositions"])
          : deepMergeReplaceArrays(s.sitePositions, p.sitePositions);
      } else if (replaceKeys.has("sitePositions")) {
        next.sitePositions = {} as GameState["sitePositions"];
      }
      if (p.playerPositions !== undefined) {
        const candidate = replaceKeys.has("playerPositions")
          ? (p.playerPositions as Partial<
              Record<PlayerKey, Partial<PlayerPositionReference>>
            >)
          : (deepMergeReplaceArrays(
              s.playerPositions,
              p.playerPositions
            ) as Partial<Record<PlayerKey, Partial<PlayerPositionReference>>>);
        next.playerPositions = normalizePlayerPositions(
          candidate,
          replaceKeys.has("playerPositions") ? undefined : s.playerPositions
        );
      } else if (replaceKeys.has("playerPositions")) {
        next.playerPositions = createDefaultPlayerPositions();
      }
      if (p.events !== undefined) {
        // Merge events deterministically
        next.events = replaceKeys.has("events")
          ? Array.isArray(p.events)
            ? p.events
            : []
          : mergeEvents(s.events, Array.isArray(p.events) ? p.events : []);
        next.eventSeq = Math.max(s.eventSeq, Number(p.eventSeq) || 0);
      }

      // Guarded auto-snapshot on Start phase or when new turn/seat is observed via server patches
      try {
        const candidatePhase = (p.phase as GameState["phase"]) ?? s.phase;
        const candidateTurn = (p.turn as GameState["turn"]) ?? s.turn;
        const candidateCP = (p.currentPlayer as GameState["currentPlayer"]) ?? s.currentPlayer;
        const newTurn = candidateTurn !== s.turn;
        const seatChanged = candidateCP !== s.currentPlayer;
        const enteringStart = candidatePhase === "Start" && s.phase !== "Start";
        if ((enteringStart || newTurn || seatChanged) && candidatePhase !== "Setup") {
          const prevSnaps = Array.isArray(s.snapshots) ? s.snapshots : [];
          const hasForTurn = prevSnaps.some((ss) => ss.kind === "auto" && ss.turn === candidateTurn);
          if (!hasForTurn) {
            setTimeout(() => {
              try {
                get().createSnapshot(`Turn ${candidateTurn} start (P${candidateCP})`, "auto");
              } catch {}
            }, 0);
          }
        }
      } catch {}

      const lastTs =
        typeof t === "number" ? Math.max(s.lastServerTs ?? 0, t) : Date.now();
      const extra: Partial<GameState> = {};
      if (replaceKeys.size > 0) {
        const pending = s.pendingPatches ?? [];
        const remainingPending: ServerPatchT[] = [];
        if (pending.length > 0) {
          try {
            console.debug("[net] applyServerPatch: reconciling pending patches");
          } catch {}
          for (const queued of pending) {
            if (!queued || typeof queued !== "object") continue;
            const queuedPatch = queued as ServerPatchT;
            const touchesCritical =
              "permanents" in queuedPatch ||
              "zones" in queuedPatch ||
              "board" in queuedPatch;
            if (!touchesCritical) {
              remainingPending.push(queuedPatch);
              continue;
            }
            const merged = deepMergeReplaceArrays(
              next,
              queuedPatch
            ) as Partial<GameState>;
            Object.assign(next, merged);
            try {
              console.debug("[net] applyServerPatch: applied pending after snapshot");
            } catch {}
          }
        }
        extra.pendingPatches = remainingPending;
        extra.selectedCard = null;
        extra.selectedPermanent = null;
        extra.previewCard = null;
        try {
          const mergedPer = (next.permanents ?? s.permanents) || {};
          const mergedPerCount = Object.values(mergedPer).reduce(
            (a, v) => a + (Array.isArray(v) ? v.length : 0),
            0
          );
          const mergedZones = next.zones ?? s.zones;
          const mergedSummary = {
            p1: {
              hand: mergedZones?.p1?.hand?.length ?? 0,
              spellbook: mergedZones?.p1?.spellbook?.length ?? 0,
              atlas: mergedZones?.p1?.atlas?.length ?? 0,
              graveyard: mergedZones?.p1?.graveyard?.length ?? 0,
            },
            p2: {
              hand: mergedZones?.p2?.hand?.length ?? 0,
              spellbook: mergedZones?.p2?.spellbook?.length ?? 0,
              atlas: mergedZones?.p2?.atlas?.length ?? 0,
              graveyard: mergedZones?.p2?.graveyard?.length ?? 0,
            },
          };
          console.debug("[net] snapshot(next)", {
            permanentsCount: mergedPerCount,
            zones: mergedSummary,
            hasPermanentPositions: !!(
              next.permanentPositions ?? s.permanentPositions
            ),
          });
        } catch {}
      }
      const result = {
        ...s,
        ...next,
        ...extra,
        lastServerTs: lastTs,
      } as Partial<GameState> as GameState;
      if (shouldClearSnapshots) {
        try { clearSnapshotsStorageFor(get().matchId ?? null); } catch {}
        (result as GameState).snapshots = [] as GameState["snapshots"];
      }
      return result;
    }),

  // Apply a replay patch (simplified version without server communication or timestamps)
  applyPatch: (patch) =>
    set((s) => {
      if (!patch || typeof patch !== "object") return s as GameState;

      const p = patch as ServerPatchT;
      const next: Partial<GameState> = {};
      const replaceKeys = new Set<string>(
        Array.isArray(p.__replaceKeys) ? p.__replaceKeys : []
      );

      if (p.players !== undefined) {
        next.players = replaceKeys.has("players")
          ? (p.players as GameState["players"])
          : deepMergeReplaceArrays(s.players, p.players);
      }
      if (p.currentPlayer !== undefined) {
        next.currentPlayer = p.currentPlayer;
      }
      if (p.turn !== undefined) {
        next.turn = p.turn;
      }
      if (p.phase !== undefined) {
        next.phase = p.phase;
      }
      if (p.d20Rolls !== undefined) {
        next.d20Rolls = p.d20Rolls;
      }
      if (p.setupWinner !== undefined) {
        next.setupWinner = p.setupWinner;
      }
      if (p.matchEnded !== undefined) {
        next.matchEnded = p.matchEnded;
      }
      if (p.winner !== undefined) {
        next.winner = p.winner;
      }
      if (p.board !== undefined) {
        next.board = replaceKeys.has("board")
          ? (p.board as GameState["board"])
          : deepMergeReplaceArrays(s.board, p.board);
      }
      if (p.zones !== undefined) {
        next.zones = replaceKeys.has("zones")
          ? (p.zones as GameState["zones"])
          : deepMergeReplaceArrays(s.zones, p.zones);
      }
      if (p.avatars !== undefined) {
        next.avatars = replaceKeys.has("avatars")
          ? (p.avatars as GameState["avatars"])
          : deepMergeReplaceArrays(s.avatars, p.avatars);
      }
      if (p.permanents !== undefined) {
        if (replaceKeys.has("permanents")) {
          next.permanents = normalizePermanentsRecord(
            (p.permanents as Permanents) || ({} as Permanents)
          ) as GameState["permanents"];
        } else {
          const merged = mergePermanentsMap(s.permanents, p.permanents);
          next.permanents = normalizePermanentsRecord(
            merged as Permanents
          ) as GameState["permanents"];
        }
      }
      if (p.mulligans !== undefined) {
        next.mulligans = replaceKeys.has("mulligans")
          ? (p.mulligans as GameState["mulligans"])
          : deepMergeReplaceArrays(s.mulligans, p.mulligans);
      }
      if (p.mulliganDrawn !== undefined) {
        next.mulliganDrawn = replaceKeys.has("mulliganDrawn")
          ? (p.mulliganDrawn as GameState["mulliganDrawn"])
          : deepMergeReplaceArrays(s.mulliganDrawn, p.mulliganDrawn);
      }
      if (p.permanentPositions !== undefined) {
        next.permanentPositions = replaceKeys.has("permanentPositions")
          ? (p.permanentPositions as GameState["permanentPositions"])
          : deepMergeReplaceArrays(
              s.permanentPositions,
              p.permanentPositions
            );
      }
      if (p.permanentAbilities !== undefined) {
        next.permanentAbilities = replaceKeys.has("permanentAbilities")
          ? (p.permanentAbilities as GameState["permanentAbilities"])
          : deepMergeReplaceArrays(
              s.permanentAbilities,
              p.permanentAbilities
            );
      }
      if (p.sitePositions !== undefined) {
        next.sitePositions = replaceKeys.has("sitePositions")
          ? (p.sitePositions as GameState["sitePositions"])
          : deepMergeReplaceArrays(s.sitePositions, p.sitePositions);
      }
      if (p.playerPositions !== undefined) {
        next.playerPositions = replaceKeys.has("playerPositions")
          ? (p.playerPositions as GameState["playerPositions"])
          : deepMergeReplaceArrays(s.playerPositions, p.playerPositions);
      }
      if (p.events !== undefined) {
        if (replaceKeys.has("events")) {
          const ev = (p.events as GameEvent[]) || [];
          next.events = ev;
          next.eventSeq =
            p.eventSeq !== undefined
              ? Math.max(Number(p.eventSeq) || 0, 0)
              : Math.max(ev.reduce((mx, e) => Math.max(mx, Number(e.id) || 0), 0), 0);
        } else {
          const merged = mergeEvents(s.events, (p.events as GameEvent[]) || []);
          next.events = merged;
          const mergedMaxId = merged.reduce(
            (mx, e) => Math.max(mx, Number(e.id) || 0),
            0
          );
          const candidateSeq = Math.max(s.eventSeq, mergedMaxId);
          next.eventSeq =
            p.eventSeq !== undefined
              ? Math.max(candidateSeq, Number(p.eventSeq) || 0)
              : candidateSeq;
        }
      } else if (p.eventSeq !== undefined) {
        next.eventSeq = replaceKeys.has("eventSeq")
          ? Math.max(Number(p.eventSeq) || 0, 0)
          : Math.max(s.eventSeq, Number(p.eventSeq) || 0);
      }

      return next as Partial<GameState> as GameState;
    }),

  // Derived selectors (no state mutation)
  toggleGridOverlay: () =>
    set((s) => ({ showGridOverlay: !s.showGridOverlay })),
  togglePlaymat: () => set((s) => ({ showPlaymat: !s.showPlaymat })),


  selectPermanent: (at, index) =>
    set((s) => {
      const arr = s.permanents[at] || [];
      if (!arr[index]) return s;
      return {
        selectedPermanent: { at, index },
        selectedCard: null,
        selectedAvatar: null,
        previewCard: null,
      };
    }),

  // Reset all game state to initial values (for new matches)
  resetGameState: () =>
    set((state) => {
      console.log("[game] Resetting game state for new match");
      try { clearSnapshotsStorageFor(get().matchId ?? null); } catch {}
      const reset: Partial<GameState> = {
        players: {
          p1: {
            life: 20,
            lifeState: "alive",
            mana: 0,
            thresholds: { air: 0, water: 0, earth: 0, fire: 0 },
          },
          p2: {
            life: 20,
            lifeState: "alive",
            mana: 0,
            thresholds: { air: 0, water: 0, earth: 0, fire: 0 },
          },
        },
        currentPlayer: 1,
        turn: 1,
        phase: "Setup",
        lastServerTs: 0,
        lastLocalActionTs: 0,
        setupWinner: null,
        d20Rolls: { p1: null, p2: null },
        actorKey: state.actorKey, // Preserve actorKey during reset
        matchEnded: false,
        winner: null,
        board: { size: { w: 5, h: 4 }, sites: {} },
        zones: createEmptyZonesRecord(),
        selectedCard: null,
        selectedPermanent: null,
        selectedAvatar: null,
        mouseInHandZone: false,
        handHoverCount: 0,
        avatars: createDefaultAvatars(),
        permanents: {},
        permanentPositions: {},
        permanentAbilities: {},
        sitePositions: {},
        playerPositions: createDefaultPlayerPositions(),
        dragFromHand: false,
        dragFromPile: null,
        hoverCell: null,
        previewCard: null,
        contextMenu: null,
        boardPings: [],
        lastPointerWorldPos: null,
        history: [],
        historyByPlayer: { p1: [], p2: [] },
        mulligans: { p1: 1, p2: 1 },
        mulliganDrawn: { p1: [], p2: [] },
        events: [],
        eventSeq: 0,
        pendingPatches: [],
        interactionLog: {},
        pendingInteractionId: null,
        acknowledgedInteractionIds: {},
        activeInteraction: null,
        transportSubscriptions: [],
        snapshots: [],
      };
      return reset as GameState;
    })
});

export const createGameStore = () => create<GameState>(createGameStoreState);

export const useGameStore = createGameStore();
setTransportStateAccessor(useGameStore.getState);
