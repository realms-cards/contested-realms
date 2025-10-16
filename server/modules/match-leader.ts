"use strict";

import type { Server as SocketIOServer } from "socket.io";
import type Redis from "ioredis";
import type { PrismaClient } from "@prisma/client";

type Seat = "p1" | "p2";

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

interface MatchEvent extends Record<string, unknown> {
  id?: number | string;
}

interface MatchGameState extends Record<string, unknown> {
  matchEnded?: boolean;
  d20Rolls?: D20Rolls;
  permanents?: Record<string, unknown>;
  zones?: ZonesState;
  avatars?: AvatarsState;
  playerPositions?: Partial<PlayerPositionsState>;
  events?: MatchEvent[];
  board?: { sites?: Record<string, unknown> };
  phase?: string;
  currentPlayer?: number;
}

interface InteractionRequestEntry {
  requestId: string;
  from: string;
  to: string;
  kind?: string;
  createdAt: number;
  expiresAt?: number;
  pendingAction?: MatchPatch | null;
  result?: unknown;
}

interface MatchState {
  id: string;
  matchType: string;
  status: string;
  playerIds: string[];
  tournamentId?: string | null;
  lastTs?: number;
  game?: MatchGameState;
  draftState?: Record<string, unknown>;
  draftConfig?: Record<string, unknown> | null;
  playerReady?: { p1?: boolean; p2?: boolean };
  interactionGrants: Map<string, Record<string, unknown>[]>;
  interactionRequests: Map<string, InteractionRequestEntry>;
  mulliganDone?: Set<string>;
  _autoSeatTimer?: NodeJS.Timeout | null;
  _autoSeatApplied?: boolean;
  _cleanupTimer?: NodeJS.Timeout | null;
}

type GrantRecord = Record<string, unknown>;

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

interface MatchLeaderDeps {
  io: SocketIOServer;
  storeRedis: Redis | null;
  prisma: PrismaClient;
  getOrLoadMatch: (matchId: string) => Promise<MatchState | null>;
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
  mergeEvents: (prev: MatchEvent[], additions: MatchEvent[]) => MatchEvent[];
  dedupePermanents: (per: unknown) => unknown;
  deepMergeReplaceArrays: (
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ) => Record<string, unknown>;
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
    getOrLoadMatch,
    getSeatForPlayer,
    getOpponentSeat,
    ensureInteractionState,
    purgeExpiredGrants,
    collectInteractionRequirements,
    usePermitForRequirement,
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
      match.interactionGrants = new Map<string, Record<string, unknown>[]>();
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
              if (!Object.prototype.hasOwnProperty.call(patchToApply, "setupWinner")) {
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
                if (
                  match._autoSeatApplied !== true &&
                  match.status === "waiting" &&
                  existingPhase !== "Start" &&
                  existingPhase !== "Main"
                ) {
                  const firstPlayer = winnerSeat === "p1" ? 1 : 2;
                  patchToApply = { ...patchToApply, phase: "Start", currentPlayer: firstPlayer };
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

        let baseForMerge: MatchGameState = match.game ? { ...match.game } : {};

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
          const grant = usePermitForRequirement(
            match,
            playerId,
            actorSeat,
            "allowOpponentZoneWrite",
            now
          );
          if (!grant) {
            if (actorSocketId) {
              io.to(actorSocketId).emit("error", {
                message: "Interaction approval is required before modifying the opponent's zones.",
                code: "interaction_required",
              });
            }
            return;
          }
        }

        if (match.game?.permanents) {
          match.game.permanents = dedupePermanents(match.game.permanents) as Record<
            string,
            unknown
          >;
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

  return {
    applyAction,
  };
}
