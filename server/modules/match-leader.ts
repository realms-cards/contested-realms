"use strict";

import type { PrismaClient } from "@prisma/client";
import type Redis from "ioredis";
import type { Server as SocketIOServer } from "socket.io";
import type {
  MatchConsoleEvent,
  MatchPermanents,
} from "./shared/match-helpers";

type Seat = "p1" | "p2";

interface PlayerState {
  id: string;
  displayName: string;
  socketId: string | null;
  lobbyId?: string | null;
  matchId?: string | null;
}

interface D20Rolls {
  p1: number | null;
  p2: number | null;
}

interface PlayerZones {
  spellbook: unknown[];
  atlas: unknown[];
  hand: unknown[];
  graveyard: unknown[];
  battlefield: unknown[];
  banished: unknown[];
}

interface ZonesState {
  p1?: PlayerZones;
  p2?: PlayerZones;
}

interface AvatarState {
  card: unknown;
  pos: [number, number] | null;
  tapped: boolean;
  offset?: unknown;
}

interface AvatarsState {
  p1?: AvatarState;
  p2?: AvatarState;
}

interface PlayerPosition {
  playerId: number;
  position: { x: number; z: number };
}

interface PlayerPositionsState {
  p1: PlayerPosition;
  p2: PlayerPosition;
}

type MatchEvent = MatchConsoleEvent;

interface MatchGameState extends Record<string, unknown> {
  matchEnded?: boolean;
  d20Rolls?: D20Rolls;
  permanents?: MatchPermanents | null;
  zones?: ZonesState;
  avatars?: AvatarsState;
  playerPositions?: Partial<PlayerPositionsState>;
  events?: MatchEvent[];
  board?: { sites?: Record<string, unknown> };
  phase?: string;
  currentPlayer?: number;
}

interface InteractionRequestMessage extends Record<string, unknown> {
  type: "interaction:request";
  requestId: string;
  matchId: string;
  from: string;
  to: string;
  kind: string;
  createdAt: number;
  expiresAt?: number;
  note?: string;
  payload?: Record<string, unknown>;
}

interface InteractionResponseMessage extends Record<string, unknown> {
  type: "interaction:response";
  requestId: string;
  matchId: string;
  from: string;
  to: string;
  kind?: string;
  decision: string;
  payload?: Record<string, unknown>;
  reason?: string;
  createdAt: number;
  expiresAt?: number;
  respondedAt: number;
}

interface InteractionRequestEntry {
  request: InteractionRequestMessage | null;
  response: InteractionResponseMessage | null;
  status?: string;
  proposedGrant?: Record<string, unknown> | null;
  grant?: GrantRecord | null;
  pendingAction?: MatchPatch | null;
  result?: MatchPatch | null;
  createdAt?: number;
  updatedAt?: number;
}

interface MatchState {
  id: string;
  matchType: string;
  status: string;
  playerIds: string[];
  playerDecks?: Map<string, unknown> | null;
  tournamentId?: string | null;
  lastTs?: number;
  game?: MatchGameState;
  draftState?: Record<string, unknown>;
  draftConfig?: Record<string, unknown> | null;
  playerReady?: { p1?: boolean; p2?: boolean };
  interactionGrants: Map<string, GrantRecord[]>;
  interactionRequests: Map<string, InteractionRequestEntry>;
  mulliganDone?: Set<string>;
  _autoSeatTimer?: NodeJS.Timeout | null;
  _autoSeatApplied?: boolean;
  _cleanupTimer?: NodeJS.Timeout | null;
}

type GrantRecord = Record<string, unknown> & { grantedTo: string };

interface InteractionRequirements {
  needsOpponentZoneWrite: boolean;
}

interface MatchPatch extends Record<string, unknown> {
  d20Rolls?: Partial<D20Rolls>;
  events?: MatchEvent[];
  __replaceKeys?: string[];
  avatars?: Partial<AvatarsState>;
  zones?: Partial<ZonesState>;
  playerPositions?: Partial<PlayerPositionsState>;
  winner?: Seat;
  setupWinner?: Seat | null;
  phase?: string;
  currentPlayer?: number;
}

interface LeaderResult {
  ok: boolean;
  error?: string;
  code?: string;
}

interface MatchLeaderDeps {
  io: SocketIOServer;
  storeRedis: Redis | null;
  prisma: PrismaClient;
  players: Map<string, PlayerState>;
  getOrLoadMatch: (matchId: string) => Promise<MatchState | null>;
  ensurePlayerCached: (playerId: string) => Promise<PlayerState>;
  getMatchInfo: (match: MatchState) => unknown;
  rid: (prefix: string) => string;
  getSeatForPlayer: (match: MatchState, playerId: string) => Seat | null;
  getOpponentSeat: (seat: Seat) => Seat;
  ensureInteractionState: (match: MatchState) => void;
  purgeExpiredGrants: (match: MatchState, now: number) => void;
  collectInteractionRequirements: (patch: MatchPatch, actorSeat: Seat) => InteractionRequirements;
  usePermitForRequirement: (
    match: MatchState,
    playerId: string,
    actorSeat: Seat,
    requirement: string,
    now: number
  ) => unknown;
  mergeEvents: (
    prev: ReadonlyArray<MatchEvent> | undefined,
    additions: ReadonlyArray<MatchEvent> | undefined
  ) => MatchEvent[];
  dedupePermanents: (per: unknown) => MatchPermanents | null | undefined;
  deepMergeReplaceArrays: <T>(base: T, patch: unknown) => T;
  applyMovementAndCombat: (
    baseState: MatchGameState | undefined,
    patch: MatchPatch,
    playerId: string,
    ctx: { match: MatchState }
  ) => MatchPatch | null | undefined;
  applyTurnStart: (state: MatchGameState | undefined) => MatchPatch | null | undefined;
  applyGenesis: (
    state: MatchGameState | undefined,
    patch: MatchPatch,
    playerId: string,
    ctx: { match: MatchState }
  ) => MatchPatch | null | undefined;
  applyKeywordAnnotations: (
    state: MatchGameState | undefined,
    patch: MatchPatch,
    playerId: string,
    ctx: { match: MatchState }
  ) => MatchPatch | null | undefined;
  enrichPatchWithCosts: (patch: MatchPatch | null, prisma: PrismaClient) => Promise<MatchPatch | null>;
  sanitizeGrantOptions: (
    grantValue: unknown,
    seat: Seat
  ) => Record<string, unknown> | null;
  sanitizePendingAction: (
    kind: string,
    payload: Record<string, unknown>,
    actorSeat: Seat,
    playerId: string
  ) => MatchPatch | null;
  recordInteractionRequest: (
    match: MatchState,
    message: InteractionRequestMessage,
    grant: Record<string, unknown> | null,
    pendingAction: MatchPatch | null
  ) => void;
  createGrantRecord: (
    entry: InteractionRequestEntry,
    response: InteractionResponseMessage,
    grantOptions: Record<string, unknown>,
    now: number
  ) => GrantRecord;
  recordInteractionResponse: (
    match: MatchState,
    response: InteractionResponseMessage,
    grantRecord: GrantRecord | null
  ) => void;
  applyPendingAction: (
    match: MatchState,
    entry: InteractionRequestEntry,
    now: number
  ) => Promise<MatchPatch | null>;
  emitInteraction: (matchId: string, message: InteractionRequestMessage | InteractionResponseMessage) => void;
  emitInteractionResult: (matchId: string, result: MatchPatch) => void;
  recordMatchAction: (matchId: string, patch: MatchPatch | null, playerId: string) => void;
  persistMatchUpdate: (
    match: MatchState,
    patch: MatchPatch | null,
    playerId: string,
    timestamp: number
  ) => Promise<void>;
  finalizeMatch: (match: MatchState, options: Record<string, unknown>) => Promise<void>;
  rulesEnforceMode: string;
  interactionEnforcementEnabled: boolean;
  interactionKinds: Set<string>;
  interactionDecisions: Set<string>;
  isCpuPlayerId: (playerId: string) => boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cloneZones(zones: PlayerZones): PlayerZones {
  return {
    spellbook: [...zones.spellbook],
    atlas: [...zones.atlas],
    hand: [...zones.hand],
    graveyard: [...zones.graveyard],
    battlefield: [...zones.battlefield],
    banished: [...zones.banished],
  };
}

function ensurePlayerZones(value: unknown): PlayerZones {
  if (!isRecord(value)) {
    return {
      spellbook: [],
      atlas: [],
      hand: [],
      graveyard: [],
      battlefield: [],
      banished: [],
    };
  }
  const arr = (prop: string): unknown[] =>
    Array.isArray(value[prop]) ? [...(value[prop] as unknown[])] : [];
  return {
    spellbook: arr("spellbook"),
    atlas: arr("atlas"),
    hand: arr("hand"),
    graveyard: arr("graveyard"),
    battlefield: arr("battlefield"),
    banished: arr("banished"),
  };
}

function ensureAvatar(value: unknown, fallback: AvatarState): AvatarState {
  if (!isRecord(value)) {
    return { ...fallback };
  }
  const posCandidate = isRecord(value.position)
    ? value.position
    : null;
  const pos: [number, number] | null =
    posCandidate && typeof posCandidate.x === "number" && typeof posCandidate.z === "number"
      ? [posCandidate.x, posCandidate.z]
      : fallback.pos;
  const tapped =
    typeof value.tapped === "boolean" ? value.tapped : fallback.tapped ?? false;
  const avatar: AvatarState = {
    card: Object.prototype.hasOwnProperty.call(value, "card") ? value.card ?? null : fallback.card ?? null,
    pos,
    tapped,
  };
  if (Object.prototype.hasOwnProperty.call(value, "offset")) {
    avatar.offset = value.offset ?? null;
  } else if (Object.prototype.hasOwnProperty.call(fallback, "offset")) {
    avatar.offset = fallback.offset ?? null;
  }
  return avatar;
}

function ensurePlayerPosition(seat: Seat, value: unknown, fallback: PlayerPosition): PlayerPosition {
  if (!isRecord(value)) {
    return { ...fallback };
  }
  const positionCandidate = isRecord(value.position) ? value.position : {};
  const x = typeof positionCandidate.x === "number" ? positionCandidate.x : fallback.position.x;
  const z = typeof positionCandidate.z === "number" ? positionCandidate.z : fallback.position.z;
  return {
    playerId:
      typeof value.playerId === "number"
        ? value.playerId
        : fallback.playerId ?? (seat === "p1" ? 1 : 2),
    position: { x, z },
  };
}

function sanitizeEvents(events: MatchEvent[] | undefined): MatchEvent[] {
  if (!Array.isArray(events)) return [];
  return events.map((event) => (isRecord(event) ? event : {}));
}

export function createMatchLeaderService(deps: MatchLeaderDeps) {
  const {
    io,
    storeRedis,
    prisma,
    players,
    getOrLoadMatch,
    ensurePlayerCached,
    getMatchInfo,
    rid,
    getSeatForPlayer,
    getOpponentSeat,
    ensureInteractionState,
    purgeExpiredGrants,
    collectInteractionRequirements,
    usePermitForRequirement,
    sanitizeGrantOptions,
    sanitizePendingAction,
    recordInteractionRequest,
    createGrantRecord,
    recordInteractionResponse,
    applyPendingAction,
    emitInteraction,
    emitInteractionResult,
    mergeEvents,
    dedupePermanents,
    deepMergeReplaceArrays,
    applyMovementAndCombat,
    applyTurnStart,
    applyGenesis,
    applyKeywordAnnotations,
    enrichPatchWithCosts,
    recordMatchAction,
    persistMatchUpdate,
    finalizeMatch,
    rulesEnforceMode,
    interactionEnforcementEnabled,
    interactionKinds,
    interactionDecisions,
    isCpuPlayerId,
  } = deps;

  async function applyAction(
    matchId: string,
    playerId: string,
    incomingPatch: unknown,
    actorSocketId: string | null | undefined
  ): Promise<void> {
    const match = await getOrLoadMatch(matchId);
    if (!match) return;
    if (!(match.interactionGrants instanceof Map)) {
      match.interactionGrants = new Map<string, GrantRecord[]>();
    }
    if (!(match.interactionRequests instanceof Map)) {
      match.interactionRequests = new Map<string, InteractionRequestEntry>();
    }
    const matchRoom = `match:${matchId}`;
    const now = Date.now();
    ensureInteractionState(match);
    purgeExpiredGrants(match, now);
    const actorSeat = getSeatForPlayer(match, playerId);
    if (!actorSeat) {
      if (actorSocketId) {
        io.to(actorSocketId).emit("error", {
          message: "Only seated players may take actions",
          code: "action_not_authorized",
        });
      }
      return;
    }

    const patchInput = isRecord(incomingPatch) ? (incomingPatch as MatchPatch) : null;

    try {
      const patch = patchInput;
      let shouldFinalizeMatch = false;
      let finalizeOptions: Record<string, unknown> | null = null;

      if (
        match &&
        match.status === "waiting" &&
        patch &&
        typeof patch.phase === "string" &&
        patch.phase === "Main"
      ) {
        match.status = "in_progress";
        io.to(matchRoom).emit("matchStarted", { match: { ...match, game: match.game } });
        if (match.tournamentId) {
          try {
            await prisma.match.updateMany({
              where: { id: match.id, status: { in: ["pending", "active"] } },
              data: { status: "active", startedAt: new Date() },
            });
          } catch {
            // ignore
          }
        }
      }

      if (match && patch) {
        const prevMatchEnded = Boolean(match.game && match.game.matchEnded);
        let patchToApply: MatchPatch = { ...patch };
        const enforce =
          rulesEnforceMode === "all" ||
          (rulesEnforceMode === "bot_only" && isCpuPlayerId(playerId));
        const replaceKeys = Array.isArray(patchToApply.__replaceKeys)
          ? [...patchToApply.__replaceKeys]
          : [];
        const isSnapshot = replaceKeys.length > 0;

        if (isSnapshot) {
          const replaceLog =
            Array.isArray(patchToApply.__replaceKeys) ? patchToApply.__replaceKeys : [];
          const keys =
            Array.isArray(replaceLog) && replaceLog.every((key) => typeof key === "string")
              ? replaceLog
              : [];
          try {
            console.debug("[match] apply snapshot", {
              matchId,
              playerId,
              keys,
              hasEvents: Array.isArray(patchToApply.events),
              phase: patchToApply.phase,
              eventSeq: (patchToApply as Record<string, unknown>).eventSeq,
              t: now,
            });
          } catch {
            // ignore
          }
        }

        if (patchToApply.d20Rolls && isRecord(patchToApply.d20Rolls)) {
          const prevRolls: D20Rolls =
            match.game && match.game.d20Rolls
              ? {
                  p1: match.game.d20Rolls.p1 ?? null,
                  p2: match.game.d20Rolls.p2 ?? null,
                }
              : { p1: null, p2: null };
          const incomingRolls = patchToApply.d20Rolls;
          const inc: Partial<D20Rolls> = {};
          if (actorSeat === "p1" && Object.prototype.hasOwnProperty.call(incomingRolls, "p1")) {
            if (prevRolls.p1 == null) {
              const value = incomingRolls.p1;
              const numeric = typeof value === "number" ? value : Number(value);
              if (Number.isFinite(numeric)) {
                inc.p1 = numeric;
              }
            } else {
              try {
                console.warn("[d20] ignoring extra roll from p1; already rolled", {
                  prev: prevRolls,
                  incRaw: incomingRolls,
                  matchId,
                  playerId,
                });
              } catch {
                // ignore
              }
            }
          } else if (
            actorSeat === "p2" &&
            Object.prototype.hasOwnProperty.call(incomingRolls, "p2")
          ) {
            if (prevRolls.p2 == null) {
              const value = incomingRolls.p2;
              const numeric = typeof value === "number" ? value : Number(value);
              if (Number.isFinite(numeric)) {
                inc.p2 = numeric;
              }
            } else {
              try {
                console.warn("[d20] ignoring extra roll from p2; already rolled", {
                  prev: prevRolls,
                  incRaw: incomingRolls,
                  matchId,
                  playerId,
                });
              } catch {
                // ignore
              }
            }
          } else if (actorSeat !== "p1" && actorSeat !== "p2") {
            try {
              console.warn("[d20] ignoring roll from non-seated actor", {
                incRaw: incomingRolls,
                matchId,
                playerId,
              });
            } catch {
              // ignore
            }
          }

          const merged: D20Rolls = {
            p1: inc.p1 ?? prevRolls.p1 ?? null,
            p2: inc.p2 ?? prevRolls.p2 ?? null,
          };
          try {
            console.log("[d20] merge", { prev: prevRolls, inc: incomingRolls, merged, matchId });
          } catch {
            // ignore
          }
          if (merged.p1 != null && merged.p2 != null) {
            if (Number(merged.p1) === Number(merged.p2)) {
              try {
                console.log("[d20] tie detected -> resetting for reroll", { merged, matchId });
              } catch {
                // ignore
              }
              patchToApply = {
                ...patchToApply,
                d20Rolls: { p1: null, p2: null },
                setupWinner: null,
              };
              if (match._autoSeatTimer) {
                try {
                  clearTimeout(match._autoSeatTimer);
                } catch {
                  // ignore
                }
                match._autoSeatTimer = null;
              }
              match._autoSeatApplied = false;
            } else {
              const winnerSeat: Seat = Number(merged.p1) > Number(merged.p2) ? "p1" : "p2";
              patchToApply = {
                ...patchToApply,
                d20Rolls: merged,
              };
              const currentSetupWinner = patchToApply.setupWinner;
              if (currentSetupWinner !== "p1" && currentSetupWinner !== "p2") {
                patchToApply = { ...patchToApply, setupWinner: winnerSeat };
              }
              try {
                console.log("[d20] winner decided", {
                  merged,
                  winner: winnerSeat,
                  matchId,
                });
              } catch {
                // ignore
              }
              if (match.game) {
                const existingPhase = match.game.phase;
                const allPlayersCpu =
                  Array.isArray(match.playerIds) &&
                  match.playerIds.length > 0 &&
                  match.playerIds.every((pid) => isCpuPlayerId(pid));
                const shouldAutoSeat =
                  allPlayersCpu &&
                  match.status === "waiting" &&
                  existingPhase !== "Start" &&
                  existingPhase !== "Main";

                if (shouldAutoSeat) {
                  match._autoSeatApplied = true;
                }
              }
            }
          } else {
            patchToApply = { ...patchToApply, d20Rolls: merged };
            try {
              console.log("[d20] partial roll - waiting for second player", { merged, matchId });
            } catch {
              // ignore
            }
          }
        }

        const eventsAdded = sanitizeEvents(patch.events);
        const appliedEvents = sanitizeEvents(patchToApply.events);
        const combinedEvents = [...eventsAdded, ...appliedEvents];
        if (combinedEvents.length > 0) {
          const previousEvents = Array.isArray(match.game?.events) ? match.game?.events : [];
          const mergedEvents = mergeEvents(previousEvents, combinedEvents);
          const mergedMaxId = mergedEvents.reduce<number>((max, event) => {
            const idValue = event.id;
            const numeric =
              typeof idValue === "number"
                ? idValue
                : typeof idValue === "string"
                ? Number(idValue)
                : NaN;
            return Number.isFinite(numeric) && numeric > max ? numeric : max;
          }, 0);
          const seqCandidate =
            typeof (patch as Record<string, unknown>).eventSeq === "number"
              ? (patch as Record<string, unknown>).eventSeq
              : Number((patch as Record<string, unknown>).eventSeq);
          const seq = Number.isFinite(seqCandidate) ? Number(seqCandidate) : 0;
          patchToApply = {
            ...patchToApply,
            events: mergedEvents,
            eventSeq: Math.max(mergedMaxId, seq),
          };
        }

        const baseForMerge: MatchGameState = match.game ? { ...match.game } : {};

        if (isSnapshot && replaceKeys.length > 0) {
          for (const key of replaceKeys) {
            if (Object.prototype.hasOwnProperty.call(patchToApply, key)) {
              baseForMerge[key] = patchToApply[key];
            }
          }
        }

        if (isSnapshot) {
          const prevZones = match.game?.zones;
          const defaultZones: PlayerZones = {
            spellbook: [],
            atlas: [],
            hand: [],
            graveyard: [],
            battlefield: [],
            banished: [],
          };

          const normalizedPrevZones: ZonesState = {
            p1: prevZones?.p1 ? cloneZones(ensurePlayerZones(prevZones.p1)) : { ...defaultZones },
            p2: prevZones?.p2 ? cloneZones(ensurePlayerZones(prevZones.p2)) : { ...defaultZones },
          };
          const incomingZones = patchToApply.zones ?? {};
          const nextZones: ZonesState = {
            p1: ensurePlayerZones(
              isRecord(incomingZones) && "p1" in incomingZones ? incomingZones.p1 : undefined
            ),
            p2: ensurePlayerZones(
              isRecord(incomingZones) && "p2" in incomingZones ? incomingZones.p2 : undefined
            ),
          };
          nextZones.p1 = nextZones.p1
            ? {
                ...normalizedPrevZones.p1,
                ...nextZones.p1,
              }
            : normalizedPrevZones.p1;
          nextZones.p2 = nextZones.p2
            ? {
                ...normalizedPrevZones.p2,
                ...nextZones.p2,
              }
            : normalizedPrevZones.p2;

          const prevAvatars = match.game?.avatars ?? { p1: undefined, p2: undefined };
          const defaultAvatar: AvatarState = { card: null, pos: null, tapped: false };
          const fallbackAvatars: AvatarsState = {
            p1: ensureAvatar(prevAvatars.p1, defaultAvatar),
            p2: ensureAvatar(prevAvatars.p2, defaultAvatar),
          };
          const incomingAvatars = patchToApply.avatars ?? {};
          const normalizedAvatars: AvatarsState = {
            p1: ensureAvatar(incomingAvatars?.p1, fallbackAvatars.p1 ?? defaultAvatar),
            p2: ensureAvatar(incomingAvatars?.p2, fallbackAvatars.p2 ?? defaultAvatar),
          };

          const prevPositions = match.game?.playerPositions ?? {
            p1: { playerId: 1, position: { x: 0, z: 0 } },
            p2: { playerId: 2, position: { x: 0, z: 0 } },
          };
          const incomingPositions = patchToApply.playerPositions ?? {};
          const normalizedPositions: PlayerPositionsState = {
            p1: ensurePlayerPosition(
              "p1",
              isRecord(incomingPositions) ? incomingPositions.p1 : undefined,
              {
                playerId: prevPositions?.p1?.playerId ?? 1,
                position: {
                  x: prevPositions?.p1?.position?.x ?? 0,
                  z: prevPositions?.p1?.position?.z ?? 0,
                },
              }
            ),
            p2: ensurePlayerPosition(
              "p2",
              isRecord(incomingPositions) ? incomingPositions.p2 : undefined,
              {
                playerId: prevPositions?.p2?.playerId ?? 2,
                position: {
                  x: prevPositions?.p2?.position?.x ?? 0,
                  z: prevPositions?.p2?.position?.z ?? 0,
                },
              }
            ),
          };

          patchToApply = {
            ...patchToApply,
            zones: nextZones,
            avatars: normalizedAvatars,
            playerPositions: normalizedPositions,
          };
        }

        const mergedGame = deepMergeReplaceArrays(
          baseForMerge as Record<string, unknown>,
          patchToApply as Record<string, unknown>
        );
        match.game = mergedGame as MatchGameState;

        const movementPatch = await Promise.resolve(
          applyMovementAndCombat(match.game, patchToApply, playerId, { match })
        );
        if (movementPatch && isRecord(movementPatch)) {
          match.game = deepMergeReplaceArrays(
            match.game as Record<string, unknown>,
            movementPatch as Record<string, unknown>
          ) as MatchGameState;
          patchToApply = deepMergeReplaceArrays(
            patchToApply as Record<string, unknown>,
            movementPatch as Record<string, unknown>
          ) as MatchPatch;
        }

        const turnStartPatch = applyTurnStart(match.game);
        if (turnStartPatch && isRecord(turnStartPatch)) {
          match.game = deepMergeReplaceArrays(
            match.game as Record<string, unknown>,
            turnStartPatch as Record<string, unknown>
          ) as MatchGameState;
          patchToApply = deepMergeReplaceArrays(
            patchToApply as Record<string, unknown>,
            turnStartPatch as Record<string, unknown>
          ) as MatchPatch;
        }

        const genesisPatch = applyGenesis(match.game, patchToApply, playerId, { match });
        if (genesisPatch && isRecord(genesisPatch)) {
          match.game = deepMergeReplaceArrays(
            match.game as Record<string, unknown>,
            genesisPatch as Record<string, unknown>
          ) as MatchGameState;
          patchToApply = deepMergeReplaceArrays(
            patchToApply as Record<string, unknown>,
            genesisPatch as Record<string, unknown>
          ) as MatchPatch;
        }

        const keywordPatch = applyKeywordAnnotations(match.game, patchToApply, playerId, { match });
        if (keywordPatch && isRecord(keywordPatch)) {
          match.game = deepMergeReplaceArrays(
            match.game as Record<string, unknown>,
            keywordPatch as Record<string, unknown>
          ) as MatchGameState;
          patchToApply = deepMergeReplaceArrays(
            patchToApply as Record<string, unknown>,
            keywordPatch as Record<string, unknown>
          ) as MatchPatch;
        }

        const requirements = collectInteractionRequirements(patchToApply, actorSeat);
        const shouldEnforceInteraction =
          interactionEnforcementEnabled && match.status === "in_progress" && !isSnapshot;
        if (shouldEnforceInteraction && requirements.needsOpponentZoneWrite) {
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const grant = usePermitForRequirement(
            match,
            playerId,
            actorSeat,
            "allowOpponentZoneWrite",
            now
          );
          if (!grant) {
            try {
              console.warn("[interaction] opponent zone write allowed without permit", {
                matchId,
                playerId,
                actorSeat,
              });
            } catch {
              // ignore logging failure
            }
          }
        }

        if (match.game?.permanents) {
          const normalized = dedupePermanents(match.game.permanents);
          if (normalized) {
            match.game.permanents = normalized;
          }
        }

        const nextMatchEnded = Boolean(match.game && match.game.matchEnded);
        if (!prevMatchEnded && nextMatchEnded) {
          const winnerSeat =
            patchToApply.winner === "p1" || patchToApply.winner === "p2"
              ? patchToApply.winner
              : null;
          const loserSeat = winnerSeat ? getOpponentSeat(winnerSeat) : null;
          finalizeOptions = {};
          if (winnerSeat) finalizeOptions.winnerSeat = winnerSeat;
          if (loserSeat) finalizeOptions.loserSeat = loserSeat;
          shouldFinalizeMatch = true;
        }

        match.lastTs = now;
        recordMatchAction(matchId, patchToApply, playerId);

        if (patchToApply.d20Rolls) {
          try {
            io.in(matchRoom)
              .fetchSockets()
              .then((sockets) => {
                console.log("[d20] broadcasting patch to room", {
                  matchId,
                  room: matchRoom,
                  socketsInRoom: sockets.length,
                  socketIds: sockets.map((socket) => socket.id).join(", "),
                  d20Rolls: patchToApply.d20Rolls,
                  setupWinner: patchToApply.setupWinner ?? null,
                });
              })
              .catch(() => {
                console.log("[d20] broadcasting patch", {
                  matchId,
                  d20Rolls: patchToApply.d20Rolls,
                  setupWinner: patchToApply.setupWinner ?? null,
                });
              });
          } catch {
            console.log("[d20] broadcasting patch", {
              matchId,
              d20Rolls: patchToApply.d20Rolls,
              setupWinner: patchToApply.setupWinner ?? null,
            });
          }
        }

        const enrichedPatchToApply =
          (await enrichPatchWithCosts(patchToApply, prisma)) ?? patchToApply;
        io.to(matchRoom).emit("statePatch", { patch: enrichedPatchToApply, t: now });

        await persistMatchUpdate(match, patchToApply, playerId, now);

        if (shouldFinalizeMatch) {
          try {
            await finalizeMatch(match, finalizeOptions ?? {});
          } catch (err) {
            try {
              console.warn("[match] finalize failed", err instanceof Error ? err.message : err);
            } catch {
              // ignore
            }
          }
        }
      } else {
        const enrichedPatch = await enrichPatchWithCosts(patch, prisma);
        io.to(matchRoom).emit("statePatch", { patch: enrichedPatch, t: now });
        await persistMatchUpdate(match, patch ?? null, playerId, now);
      }
    } catch (error) {
      const enrichedIncoming = await enrichPatchWithCosts(
        patchInput ?? null,
        prisma
      );
      io.to(matchRoom).emit("statePatch", { patch: enrichedIncoming, t: Date.now() });
      if (error instanceof Error) {
        console.warn("[match] leaderApplyAction error", error.message);
      }
    }

    try {
      if (storeRedis) {
        await storeRedis.expire(`match:leader:${matchId}`, 60);
      }
    } catch {
      // ignore
    }
  }

  async function detachPlayerFromMatch(
    match: MatchState,
    playerId: string,
    socketId: string | null
  ): Promise<void> {
    if (!Array.isArray(match.playerIds)) return;
    if (!match.playerIds.includes(playerId)) return;

    match.playerIds = match.playerIds.filter((id) => id !== playerId);
    const room = `match:${match.id}`;

    if (socketId) {
      try {
        await io.in(socketId).socketsLeave(room);
      } catch (err) {
        console.warn("[joinMatch] Failed to leave previous match room", {
          socketId,
          room,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    try {
      io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
    } catch {
      // ignore broadcast failures
    }

    try {
      await persistMatchUpdate(match, null, playerId, Date.now());
    } catch (err) {
      console.warn("[joinMatch] Failed to persist previous match update", {
        matchId: match.id,
        playerId,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  async function joinMatch(matchId: string, playerId: string, socketId: string): Promise<void> {
    const playerState = await ensurePlayerCached(playerId);
    const previousSocketId = playerState.socketId || socketId;

    if (playerState.matchId && playerState.matchId !== matchId) {
      const previousMatch = await getOrLoadMatch(playerState.matchId);
      if (previousMatch) {
        await detachPlayerFromMatch(previousMatch, playerId, previousSocketId);
      }
    }

    const match = await getOrLoadMatch(matchId);
    if (!match) return;
    if (!Array.isArray(match.playerIds)) {
      match.playerIds = [];
    }
    if (!match.playerIds.includes(playerId)) {
      match.playerIds.push(playerId);
    }
    playerState.matchId = matchId;
    playerState.socketId = socketId;

    const room = `match:${matchId}`;
    try {
      await io.in(socketId).socketsJoin(room);
      console.log("[joinMatch] Socket joined room", { socketId, room, playerId });
    } catch (err) {
      console.error("[joinMatch] Failed to join room", {
        socketId,
        room,
        playerId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      io.to(socketId).emit("matchStarted", { match: getMatchInfo(match) });
    } catch {
      // ignore
    }
    try {
      io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
    } catch {
      // ignore
    }

    try {
      if (
        match.matchType === "draft" &&
        match.draftState &&
        match.draftState.phase &&
        match.draftState.phase !== "waiting"
      ) {
        io.to(socketId).emit("draftUpdate", match.draftState);
      }
    } catch {
      // ignore
    }

    try {
      await persistMatchUpdate(match, null, playerId, Date.now());
    } catch {
      // ignore
    }
  }

  async function handleMulliganDone(matchId: string, playerId: string): Promise<void> {
    const match = await getOrLoadMatch(matchId);
    if (!match) return;
    // Allow sealed tournament matches to proceed from deck_construction if both decks are present
    const decks = match.playerDecks instanceof Map ? match.playerDecks : null;
    const allDecksSubmitted = !!(
      decks && Array.isArray(match.playerIds) && match.playerIds.every((pid) => decks.has(pid))
    );
    const canProceedStatus =
      match.status === "waiting" ||
      match.status === "in_progress" ||
      (match.status === "deck_construction" && match.matchType === "sealed" && allDecksSubmitted);
    if (!canProceedStatus) return;
    const game = match.game;
    if (!game) return;
    const currentPhase = game.phase;
    if (currentPhase !== "Setup" && currentPhase !== "Start") {
      return;
    }

    if (!(match.mulliganDone instanceof Set)) {
      match.mulliganDone = new Set<string>();
    }
    const wasAlreadyDone = match.mulliganDone.has(playerId);
    match.mulliganDone.add(playerId);

    try {
      const doneCount = match.mulliganDone.size;
      const total = Array.isArray(match.playerIds) ? match.playerIds.length : 0;
      const waitingFor = Array.isArray(match.playerIds)
        ? match.playerIds.filter((pid) => !match.mulliganDone!.has(pid))
        : [];
      const names = waitingFor.map((pid) => players.get(pid)?.displayName ?? pid);
      console.log(
        `[Setup] mulliganDone <= ${playerId}${wasAlreadyDone ? " (duplicate)" : ""}. ${doneCount}/${total} complete. Waiting for: ${
          names.length > 0 ? names.join(", ") : "none"
        }`
      );
    } catch {
      // ignore logging errors
    }

    const totalPlayers = Array.isArray(match.playerIds) ? match.playerIds.length : 0;
    if (match.mulliganDone.size < totalPlayers || totalPlayers === 0) {
      return;
    }

    const d20Rolls = game.d20Rolls
      ? {
          p1: typeof game.d20Rolls.p1 === "number" ? game.d20Rolls.p1 : null,
          p2: typeof game.d20Rolls.p2 === "number" ? game.d20Rolls.p2 : null,
        }
      : null;

    const patch: MatchPatch = {
      phase: "Main",
      status: "in_progress",
      currentPlayer: typeof game.currentPlayer === "number" ? game.currentPlayer : 1,
      interactionGrants: {},
      interactionRequests: {},
      ...(d20Rolls ? { d20Rolls } : {}),
      __replaceKeys: d20Rolls
        ? ["phase", "status", "currentPlayer", "interactionGrants", "interactionRequests", "d20Rolls"]
        : ["phase", "status", "currentPlayer", "interactionGrants", "interactionRequests"],
    };

    try {
      io.to(`match:${match.id}`).emit("statePatch", {
        patch,
        t: Date.now(),
      });
    } catch {
      // ignore broadcast error
    }

    game.phase = "Main";
    match.status = "in_progress";
    if (typeof patch.currentPlayer === "number") {
      game.currentPlayer = patch.currentPlayer;
    }

    try {
      await persistMatchUpdate(match, patch, playerId, Date.now());
    } catch (err) {
      console.warn("[Setup] Failed to persist mulligan completion advance", {
        matchId,
        error: err instanceof Error ? err.message : err,
      });
    }

    // Also emit updated match info so clients update match.status immediately
    try {
      io.to(`match:${match.id}`).emit("matchStarted", { match: getMatchInfo(match) });
    } catch {}
  }

  async function handleInteractionRequest(
    matchId: string,
    playerId: string,
    payload: Record<string, unknown> | null | undefined
  ): Promise<LeaderResult> {
    try {
      const match = await getOrLoadMatch(matchId);
      if (!match) return { ok: false, error: "Match not found", code: "interaction_internal" };
      if (!(match.interactionRequests instanceof Map)) {
        match.interactionRequests = new Map<string, InteractionRequestEntry>();
      }
      if (!(match.interactionGrants instanceof Map)) {
        match.interactionGrants = new Map<string, GrantRecord[]>();
      }

      const now = Date.now();
      const actorSeat = getSeatForPlayer(match, playerId);
      if (!actorSeat) {
        return {
          ok: false,
          error: "Interaction requests are only available to seated players",
          code: "interaction_invalid",
        };
      }

      const opponentSeat = getOpponentSeat(actorSeat);
      const opponentIndex = actorSeat === "p1" ? 1 : 0;
      const opponentId = Array.isArray(match.playerIds) ? match.playerIds[opponentIndex] : null;
      if (!opponentId) {
        return {
          ok: false,
          error: "Opponent unavailable for interaction",
          code: "interaction_invalid_opponent",
        };
      }

      const rawKind =
        payload && typeof payload.kind === "string" ? (payload.kind as string) : null;
      if (!rawKind || !interactionKinds.has(rawKind)) {
        return {
          ok: false,
          error: "Unsupported interaction kind",
          code: "interaction_invalid_kind",
        };
      }

      const requestId =
        payload && typeof payload.requestId === "string" && payload.requestId.length >= 6
          ? (payload.requestId as string)
          : rid("intl");
      const expiresAtRaw = Number(payload?.expiresAt);
      const expiresAt =
        Number.isFinite(expiresAtRaw) && expiresAtRaw > now ? expiresAtRaw : null;
      const note =
        payload && typeof payload.note === "string"
          ? (payload.note as string).slice(0, 280)
          : undefined;

      const rawPayload =
        payload && typeof payload.payload === "object" && payload.payload !== null
          ? (payload.payload as Record<string, unknown>)
          : {};
      const sanitizedPayload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rawPayload)) {
        if (key === "grant" || key === "proposedGrant") continue;
        sanitizedPayload[key] = value;
      }

      const proposedGrant = sanitizeGrantOptions(
        payload?.grant ?? rawPayload?.grant ?? rawPayload?.proposedGrant,
        opponentSeat
      );
      if (proposedGrant) {
        sanitizedPayload.proposedGrant = proposedGrant;
      }

      const message: InteractionRequestMessage = {
        type: "interaction:request",
        requestId,
        matchId: match.id,
        from: playerId,
        to: opponentId,
        kind: rawKind,
        createdAt: now,
      };
      if (expiresAt) message.expiresAt = expiresAt;
      if (note) message.note = note;
      if (Object.keys(sanitizedPayload).length > 0) {
        message.payload = sanitizedPayload;
      }

      const pendingAction = sanitizePendingAction(rawKind, sanitizedPayload, actorSeat, playerId);

      recordInteractionRequest(match, message, proposedGrant ?? null, pendingAction);
      match.lastTs = now;
      emitInteraction(matchId, message);
      try {
        await persistMatchUpdate(match, null, playerId, now);
      } catch {
        // ignore
      }

      return { ok: true };
    } catch (err) {
      try {
        console.warn(
          "[interaction] request failed",
          err instanceof Error ? err.message : String(err)
        );
      } catch {
        // ignore
      }
      return {
        ok: false,
        error: "Failed to process interaction request",
        code: "interaction_internal",
      };
    }
  }

  async function handleInteractionResponse(
    matchId: string,
    playerId: string,
    payload: Record<string, unknown> | null | undefined
  ): Promise<LeaderResult> {
    try {
      const match = await getOrLoadMatch(matchId);
      if (!match) return { ok: false, error: "Match not found", code: "interaction_internal" };
      ensureInteractionState(match);
      if (!(match.interactionRequests instanceof Map)) {
        match.interactionRequests = new Map<string, InteractionRequestEntry>();
      }
      if (!(match.interactionGrants instanceof Map)) {
        match.interactionGrants = new Map<string, GrantRecord[]>();
      }

      const now = Date.now();
      const actorSeat = getSeatForPlayer(match, playerId);

      const requestId =
        payload && typeof payload.requestId === "string" ? (payload.requestId as string) : null;
      if (!requestId) {
        return {
          ok: false,
          error: "Missing interaction request identifier",
          code: "interaction_invalid_request",
        };
      }

      const entry = match.interactionRequests.get(requestId);
      const request = entry?.request ?? null;
      if (!request) {
        return {
          ok: false,
          error: "Interaction request not found",
          code: "interaction_unknown_request",
        };
      }

      const rawDecision =
        payload && typeof payload.decision === "string"
          ? (payload.decision as string)
          : null;
      if (!rawDecision || !interactionDecisions.has(rawDecision)) {
        return {
          ok: false,
          error: "Invalid interaction decision",
          code: "interaction_invalid_decision",
        };
      }

      const responderTargetsOpponent = rawDecision !== "cancelled";
      if (responderTargetsOpponent && playerId !== request.to) {
        return {
          ok: false,
          error: "Only the targeted opponent may respond",
          code: "interaction_not_authorized",
        };
      }
      if (!responderTargetsOpponent && playerId !== request.from) {
        return {
          ok: false,
          error: "Only the requester may cancel",
          code: "interaction_not_authorized",
        };
      }

      const reason =
        payload && typeof payload.reason === "string"
          ? (payload.reason as string).slice(0, 280)
          : undefined;
      const rawPayload =
        payload && typeof payload.payload === "object" && payload.payload !== null
          ? (payload.payload as Record<string, unknown>)
          : {};
      const sanitizedPayload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rawPayload)) {
        if (key === "grant" || key === "proposedGrant") continue;
        sanitizedPayload[key] = value;
      }

      let grantOpts: Record<string, unknown> | null = null;
      if (rawDecision === "approved") {
        const grantSeat = actorSeat ?? getOpponentSeat(getSeatForPlayer(match, request.from)!);
        grantOpts = sanitizeGrantOptions(
          payload?.grant ?? rawPayload?.grant ?? rawPayload?.proposedGrant,
          grantSeat
        );
        if (grantOpts) {
          sanitizedPayload.grant = grantOpts;
        }
      }

      const recipientId = playerId === request.from ? request.to : request.from;
      const responseMessage: InteractionResponseMessage = {
        type: "interaction:response",
        requestId: request.requestId,
        matchId: match.id,
        from: playerId,
        to: recipientId,
        kind: request.kind,
        decision: rawDecision,
        createdAt: request.createdAt,
        expiresAt: request.expiresAt,
        respondedAt: now,
      };
      if (reason) responseMessage.reason = reason;
      if (Object.keys(sanitizedPayload).length > 0) {
        responseMessage.payload = sanitizedPayload;
      }

      if (rawDecision === "approved" && grantOpts) {
        const entryRecord = match.interactionRequests.get(request.requestId);
        if (entryRecord) {
          const grantRecord = createGrantRecord(entryRecord, responseMessage, grantOpts, now);
          match.interactionGrants.set(grantRecord.grantedTo, [
            ...(match.interactionGrants.get(grantRecord.grantedTo) ?? []),
            grantRecord,
          ]);
        }
      }

      recordInteractionResponse(match, responseMessage, null);

      if (rawDecision === "approved") {
        const storedEntry = match.interactionRequests.get(requestId);
        if (storedEntry) {
          try {
            const result = await applyPendingAction(match, storedEntry, now);
            if (result) {
              storedEntry.result = result;
              storedEntry.pendingAction = null;
              match.interactionRequests.set(requestId, storedEntry);
              emitInteractionResult(matchId, result);
            }
          } catch (err) {
            console.warn(
              "[interaction] failed to execute pending action",
              err instanceof Error ? err.message : err
            );
          }
        }
      }

      match.lastTs = now;
      emitInteraction(matchId, responseMessage);
      try {
        await persistMatchUpdate(match, null, playerId, now);
      } catch {
        // ignore
      }

      return { ok: true };
    } catch (err) {
      try {
        console.warn(
          "[interaction] response failed",
          err instanceof Error ? err.message : String(err)
        );
      } catch {
        // ignore
      }
      return {
        ok: false,
        error: "Failed to process interaction response",
        code: "interaction_internal",
      };
    }
  }

  return {
    applyAction,
    joinMatch,
    handleMulliganDone,
    handleInteractionRequest,
    handleInteractionResponse,
  };
}
