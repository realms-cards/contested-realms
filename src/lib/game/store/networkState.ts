import type { StateCreator } from "zustand";
import type {
  AvatarState,
  GameState,
  Permanents,
  PlayerKey,
  ServerPatchT,
} from "./types";
import type { PlayerPositionReference } from "../types";
import { filterEchoPatchIfAny } from "./transportState";
import {
  normalizeAvatars,
} from "./utils/avatarHelpers";
import { mergeEvents } from "./utils/eventHelpers";
import { deepMergeReplaceArrays, mergePermanentsMap } from "./utils/patchHelpers";
import { normalizePermanentsRecord } from "./utils/permanentHelpers";
import {
  createDefaultPlayerPositions,
  normalizePlayerPositions,
} from "./utils/positionHelpers";
import {
  clearSnapshotsStorageFor,
} from "./utils/snapshotHelpers";
import {
  normalizeZones,
} from "./utils/zoneHelpers";

type NetworkSlice = Pick<
  GameState,
  "lastServerTs" | "lastLocalActionTs" | "applyServerPatch" | "applyPatch"
>;

export const createNetworkSlice: StateCreator<
  GameState,
  [],
  [],
  NetworkSlice
> = (set, get) => ({
  lastServerTs: 0,
  lastLocalActionTs: 0,

  applyServerPatch: (patch, t) =>
    set((state) => {
      if (!patch || typeof patch !== "object") return state as GameState;
      if (typeof t === "number" && t < (state.lastServerTs ?? 0)) {
        return state as GameState;
      }

      let incoming = patch as ServerPatchT;
      const replaceKeysCandidateInitial = Array.isArray(incoming.__replaceKeys)
        ? incoming.__replaceKeys
        : null;
      if (
        !replaceKeysCandidateInitial ||
        replaceKeysCandidateInitial.length === 0
      ) {
        const echoResult = filterEchoPatchIfAny(incoming);
        if (echoResult.matched) {
          if (!echoResult.patch) {
            if (typeof t === "number") {
              const lastTsEcho = Math.max(state.lastServerTs ?? 0, t);
              if (lastTsEcho !== (state.lastServerTs ?? 0)) {
                return {
                  ...state,
                  lastServerTs: lastTsEcho,
                } as GameState;
              }
            }
            return state as GameState;
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
            prevTs: state.lastServerTs ?? 0,
          });
          if (
            replaceKeys.has("permanents") ||
            replaceKeys.has("zones") ||
            replaceKeys.has("board")
          ) {
            const prevPerCount = Object.values(state.permanents || {}).reduce(
              (a, v) => a + (Array.isArray(v) ? v.length : 0),
              0
            );
            const prevSiteCount =
              state.board && state.board.sites
                ? Object.keys(state.board.sites).length
                : 0;
            const prevHandP1 = state.zones?.p1?.hand?.length ?? 0;
            const prevHandP2 = state.zones?.p2?.hand?.length ?? 0;
            console.debug("[net] snapshot(prev)", {
              per: prevPerCount,
              sites: prevSiteCount,
              handP1: prevHandP1,
              handP2: prevHandP2,
            });
            const pPer = p.permanents
              ? Object.values(
                  p.permanents as Record<string, unknown[]>
                ).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0)
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
      const shouldClearSnapshots =
        replaceKeys.has("players") ||
        replaceKeys.has("board") ||
        replaceKeys.has("zones") ||
        replaceKeys.has("avatars") ||
        replaceKeys.has("permanents");

      if (p.players !== undefined) {
        next.players = replaceKeys.has("players")
          ? (p.players as GameState["players"])
          : (deepMergeReplaceArrays(state.players, p.players) as GameState["players"]);
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
          : (deepMergeReplaceArrays(state.d20Rolls, p.d20Rolls) as GameState["d20Rolls"]);
        try {
          console.log("[applyServerPatch] Applied d20Rolls:", {
            prev: state.d20Rolls,
            new: next.d20Rolls,
            isReplace: replaceKeys.has("d20Rolls"),
          });
        } catch {}
      }
      const patchHasSetupWinner =
        p.setupWinner !== undefined ||
        Object.prototype.hasOwnProperty.call(p, "setupWinner");
      if (p.setupWinner !== undefined) {
        next.setupWinner = p.setupWinner;
      }
      if (!patchHasSetupWinner) {
        const derivedFromD20 = (() => {
          const source = (next.d20Rolls ?? state.d20Rolls) as
            | Record<PlayerKey, number | null>
            | undefined;
          if (!source) return null;
          const p1 = Number(source.p1 ?? 0);
          const p2 = Number(source.p2 ?? 0);
          if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
          if (p1 === p2) return null;
          return p1 > p2 ? ("p1" as PlayerKey) : ("p2" as PlayerKey);
        })();
        if (derivedFromD20) {
          next.setupWinner = derivedFromD20;
        }
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
          : (deepMergeReplaceArrays(state.board, p.board) as GameState["board"]);
      }
      if (p.zones !== undefined) {
        next.zones = normalizeZones(
          replaceKeys.has("zones")
            ? (p.zones as GameState["zones"])
            : (deepMergeReplaceArrays(state.zones, p.zones) as Partial<
                Record<PlayerKey, GameState["zones"][PlayerKey]>
              >),
          replaceKeys.has("zones") ? undefined : state.zones
        );
      }
      if (p.avatars !== undefined) {
        const candidate = replaceKeys.has("avatars")
          ? (p.avatars as Partial<Record<PlayerKey, Partial<AvatarState>>>)
          : (deepMergeReplaceArrays(state.avatars, p.avatars) as Partial<
              Record<PlayerKey, Partial<AvatarState>>
            >);
        next.avatars = normalizeAvatars(
          candidate,
          replaceKeys.has("avatars") ? undefined : state.avatars
        );

        // Preserve existing avatar cards if not explicitly updated in the patch
        // This prevents avatars from disappearing on reload/reconnect
        if (replaceKeys.has("avatars")) {
          const p1Candidate = (p.avatars as Partial<Record<PlayerKey, Partial<AvatarState>>>)?.p1;
          const p2Candidate = (p.avatars as Partial<Record<PlayerKey, Partial<AvatarState>>>)?.p2;

          if (
            p1Candidate &&
            !("card" in p1Candidate) &&
            state.avatars?.p1?.card
          ) {
            next.avatars = {
              ...next.avatars,
              p1: { ...next.avatars.p1, card: state.avatars.p1.card },
            } as GameState["avatars"];
          }
          if (
            p2Candidate &&
            !("card" in p2Candidate) &&
            state.avatars?.p2?.card
          ) {
            next.avatars = {
              ...next.avatars,
              p2: { ...next.avatars.p2, card: state.avatars.p2.card },
            } as GameState["avatars"];
          }
        }
      }
      if (p.permanents !== undefined) {
        const source = replaceKeys.has("permanents")
          ? (p.permanents as Permanents)
          : mergePermanentsMap(state.permanents, p.permanents);
        next.permanents = normalizePermanentsRecord(
          source as Permanents
        ) as GameState["permanents"];
      }
      if (p.mulligans !== undefined) {
        next.mulligans = replaceKeys.has("mulligans")
          ? p.mulligans
          : (deepMergeReplaceArrays(state.mulligans, p.mulligans) as GameState["mulligans"]);
      } else if (replaceKeys.has("mulligans")) {
        next.mulligans = { p1: 0, p2: 0 } as GameState["mulligans"];
      }
      if (p.mulliganDrawn !== undefined) {
        next.mulliganDrawn = replaceKeys.has("mulliganDrawn")
          ? p.mulliganDrawn
          : (deepMergeReplaceArrays(state.mulliganDrawn, p.mulliganDrawn) as GameState["mulliganDrawn"]);
      } else if (replaceKeys.has("mulliganDrawn")) {
        next.mulliganDrawn = { p1: [], p2: [] } as GameState["mulliganDrawn"];
      }
      if (p.permanentPositions !== undefined) {
        next.permanentPositions = replaceKeys.has("permanentPositions")
          ? (p.permanentPositions as GameState["permanentPositions"])
          : (deepMergeReplaceArrays(
              state.permanentPositions,
              p.permanentPositions
            ) as GameState["permanentPositions"]);
      } else if (replaceKeys.has("permanentPositions")) {
        next.permanentPositions = {} as GameState["permanentPositions"];
      }
      if (p.permanentAbilities !== undefined) {
        next.permanentAbilities = replaceKeys.has("permanentAbilities")
          ? (p.permanentAbilities as GameState["permanentAbilities"])
          : (deepMergeReplaceArrays(
              state.permanentAbilities,
              p.permanentAbilities
            ) as GameState["permanentAbilities"]);
      } else if (replaceKeys.has("permanentAbilities")) {
        next.permanentAbilities = {} as GameState["permanentAbilities"];
      }
      if (p.sitePositions !== undefined) {
        next.sitePositions = replaceKeys.has("sitePositions")
          ? (p.sitePositions as GameState["sitePositions"])
          : (deepMergeReplaceArrays(state.sitePositions, p.sitePositions) as GameState["sitePositions"]);
      } else if (replaceKeys.has("sitePositions")) {
        next.sitePositions = {} as GameState["sitePositions"];
      }
      if (p.playerPositions !== undefined) {
        const candidate = replaceKeys.has("playerPositions")
          ? (p.playerPositions as Partial<
              Record<PlayerKey, Partial<PlayerPositionReference>>
            >)
          : (deepMergeReplaceArrays(
              state.playerPositions,
              p.playerPositions
            ) as Partial<Record<PlayerKey, Partial<PlayerPositionReference>>>);
        next.playerPositions = normalizePlayerPositions(
          candidate,
          replaceKeys.has("playerPositions") ? undefined : state.playerPositions
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
          : mergeEvents(
              state.events,
              Array.isArray(p.events) ? p.events : []
            );
        next.eventSeq = Math.max(state.eventSeq, Number(p.eventSeq) || 0);
      }

      try {
        const candidatePhase =
          (p.phase as GameState["phase"]) ?? state.phase;
        const candidateTurn = (p.turn as GameState["turn"]) ?? state.turn;
        const candidateCP =
          (p.currentPlayer as GameState["currentPlayer"]) ??
          state.currentPlayer;
        const newTurn = candidateTurn !== state.turn;
        const seatChanged = candidateCP !== state.currentPlayer;
        const enteringStart =
          candidatePhase === "Start" && state.phase !== "Start";
        if (
          (enteringStart || newTurn || seatChanged) &&
          candidatePhase !== "Setup"
        ) {
          const prevSnaps = Array.isArray(state.snapshots)
            ? state.snapshots
            : [];
          const hasForTurn = prevSnaps.some(
            (ss) => ss.kind === "auto" && ss.turn === candidateTurn
          );
          if (!hasForTurn) {
            setTimeout(() => {
              try {
                get().createSnapshot(
                  `Turn ${candidateTurn} start (P${candidateCP})`,
                  "auto"
                );
              } catch {}
            }, 0);
          }
        }
      } catch {}

      const lastTs =
        typeof t === "number"
          ? Math.max(state.lastServerTs ?? 0, t)
          : Date.now();
      const extra: Partial<GameState> = {};
      if (replaceKeys.size > 0) {
        const pending = state.pendingPatches ?? [];
        const remainingPending: ServerPatchT[] = [];
        if (pending.length > 0) {
          for (const candidate of pending) {
            if (
              !candidate ||
              typeof candidate !== "object" ||
              !candidate.__replaceKeys ||
              !Array.isArray(candidate.__replaceKeys)
            ) {
              continue;
            }
            const overlap = candidate.__replaceKeys.some((key) =>
              replaceKeys.has(key)
            );
            if (!overlap) {
              remainingPending.push(candidate);
            }
          }
          if (remainingPending.length !== pending.length) {
            extra.pendingPatches = remainingPending;
            try {
              console.debug("[net] Pending patches trimmed after snapshot", {
                before: pending.length,
                after: remainingPending.length,
                replaceKeys: Array.from(replaceKeys),
              });
            } catch {}
          }
        }
      }

      if (p.board !== undefined || p.zones !== undefined || p.permanents !== undefined) {
        try {
          const mergedPerCount = Object.values(
            (next.permanents ?? state.permanents) || {}
          ).reduce(
            (a, v) => a + (Array.isArray(v) ? v.length : 0),
            0
          );
          const mergedSummary = {
            p1: {
              hand: (next.zones ?? state.zones)?.p1?.hand?.length ?? 0,
              spellbook:
                (next.zones ?? state.zones)?.p1?.spellbook?.length ?? 0,
              graveyard:
                (next.zones ?? state.zones)?.p1?.graveyard?.length ?? 0,
            },
            p2: {
              hand: (next.zones ?? state.zones)?.p2?.hand?.length ?? 0,
              spellbook:
                (next.zones ?? state.zones)?.p2?.spellbook?.length ?? 0,
              graveyard:
                (next.zones ?? state.zones)?.p2?.graveyard?.length ?? 0,
            },
          };
          console.debug("[net] snapshot(next)", {
            permanentsCount: mergedPerCount,
            zones: mergedSummary,
            hasPermanentPositions: !!(
              next.permanentPositions ?? state.permanentPositions
            ),
          });
        } catch {}
      }

      const result = {
        ...state,
        ...next,
        ...extra,
        lastServerTs: lastTs,
      } as Partial<GameState> as GameState;
      if (shouldClearSnapshots) {
        try {
          clearSnapshotsStorageFor(get().matchId ?? null);
        } catch {}
        (result as GameState).snapshots = [] as GameState["snapshots"];
      }
      return result;
    }),

  applyPatch: (patch) =>
    set((state) => {
      if (!patch || typeof patch !== "object") return state as GameState;

      const p = patch as ServerPatchT;
      const next: Partial<GameState> = {};
      const replaceKeys = new Set<string>(
        Array.isArray(p.__replaceKeys) ? p.__replaceKeys : []
      );

      if (p.players !== undefined) {
        next.players = replaceKeys.has("players")
          ? (p.players as GameState["players"])
          : (deepMergeReplaceArrays(state.players, p.players) as GameState["players"]);
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
          : (deepMergeReplaceArrays(state.board, p.board) as GameState["board"]);
      }
      if (p.zones !== undefined) {
        next.zones = replaceKeys.has("zones")
          ? (p.zones as GameState["zones"])
          : (deepMergeReplaceArrays(state.zones, p.zones) as GameState["zones"]);
      }
      if (p.avatars !== undefined) {
        next.avatars = replaceKeys.has("avatars")
          ? (p.avatars as GameState["avatars"])
          : (deepMergeReplaceArrays(state.avatars, p.avatars) as GameState["avatars"]);
      }
      if (p.permanents !== undefined) {
        if (replaceKeys.has("permanents")) {
          next.permanents = normalizePermanentsRecord(
            (p.permanents as Permanents) || ({} as Permanents)
          ) as GameState["permanents"];
        } else {
          const merged = mergePermanentsMap(state.permanents, p.permanents);
          next.permanents = normalizePermanentsRecord(
            merged as Permanents
          ) as GameState["permanents"];
        }
      }
      if (p.mulligans !== undefined) {
        next.mulligans = replaceKeys.has("mulligans")
          ? (p.mulligans as GameState["mulligans"])
          : (deepMergeReplaceArrays(state.mulligans, p.mulligans) as GameState["mulligans"]);
      }
      if (p.mulliganDrawn !== undefined) {
        next.mulliganDrawn = replaceKeys.has("mulliganDrawn")
          ? (p.mulliganDrawn as GameState["mulliganDrawn"])
          : (deepMergeReplaceArrays(state.mulliganDrawn, p.mulliganDrawn) as GameState["mulliganDrawn"]);
      }
      if (p.permanentPositions !== undefined) {
        next.permanentPositions = replaceKeys.has("permanentPositions")
          ? (p.permanentPositions as GameState["permanentPositions"])
          : (deepMergeReplaceArrays(
              state.permanentPositions,
              p.permanentPositions
            ) as GameState["permanentPositions"]);
      }
      if (p.permanentAbilities !== undefined) {
        next.permanentAbilities = replaceKeys.has("permanentAbilities")
          ? (p.permanentAbilities as GameState["permanentAbilities"])
          : (deepMergeReplaceArrays(
              state.permanentAbilities,
              p.permanentAbilities
            ) as GameState["permanentAbilities"]);
      }
      if (p.sitePositions !== undefined) {
        next.sitePositions = replaceKeys.has("sitePositions")
          ? (p.sitePositions as GameState["sitePositions"])
          : (deepMergeReplaceArrays(state.sitePositions, p.sitePositions) as GameState["sitePositions"]);
      }
      if (p.playerPositions !== undefined) {
        next.playerPositions = replaceKeys.has("playerPositions")
          ? (p.playerPositions as GameState["playerPositions"])
          : (deepMergeReplaceArrays(state.playerPositions, p.playerPositions) as GameState["playerPositions"]);
      }
      if (p.events !== undefined) {
        if (replaceKeys.has("events")) {
          const ev = (p.events as GameState["events"]) || [];
          next.events = ev;
          next.eventSeq =
            p.eventSeq !== undefined
              ? Math.max(Number(p.eventSeq) || 0, 0)
              : Math.max(
                  ev.reduce(
                    (mx, e) => Math.max(mx, Number(e.id) || 0),
                    0
                  ),
                  0
                );
        } else {
          const merged = mergeEvents(state.events, (p.events as GameState["events"]) || []);
          next.events = merged;
          const mergedMaxId = merged.reduce(
            (mx, e) => Math.max(mx, Number(e.id) || 0),
            0
          );
          const candidateSeq = Math.max(state.eventSeq, mergedMaxId);
          next.eventSeq =
            p.eventSeq !== undefined
              ? Math.max(candidateSeq, Number(p.eventSeq) || 0)
              : candidateSeq;
        }
      } else if (p.eventSeq !== undefined) {
        next.eventSeq = replaceKeys.has("eventSeq")
          ? Math.max(Number(p.eventSeq) || 0, 0)
          : Math.max(state.eventSeq, Number(p.eventSeq) || 0);
      }

      return next as Partial<GameState> as GameState;
    }),
});
