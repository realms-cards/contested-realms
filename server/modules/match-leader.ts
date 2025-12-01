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
  collection: unknown[];
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
  champion?: { cardId: number; name: string; slug: string | null } | null;
  counters?: number;
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
  collectInteractionRequirements: (
    patch: MatchPatch,
    actorSeat: Seat
  ) => InteractionRequirements;
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
  applyTurnStart: (
    state: MatchGameState | undefined
  ) => MatchPatch | null | undefined;
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
  ensureCosts: (
    state: MatchGameState | undefined,
    patch: MatchPatch,
    playerId: string,
    ctx: { match: MatchState }
  ) => { ok: boolean; error?: string; autoPatch?: MatchPatch };
  validateAction: (
    state: MatchGameState | undefined,
    patch: MatchPatch,
    playerId: string,
    ctx: { match: MatchState }
  ) => { ok: boolean; error?: string };
  enrichPatchWithCosts: (
    patch: MatchPatch | null,
    prisma: PrismaClient
  ) => Promise<MatchPatch | null>;
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
  emitInteraction: (
    matchId: string,
    message: InteractionRequestMessage | InteractionResponseMessage
  ) => void;
  emitInteractionResult: (matchId: string, result: MatchPatch) => void;
  recordMatchAction: (
    matchId: string,
    patch: MatchPatch | null,
    playerId: string
  ) => void;
  persistMatchUpdate: (
    match: MatchState,
    patch: MatchPatch | null,
    playerId: string,
    timestamp: number
  ) => Promise<void>;
  finalizeMatch: (
    match: MatchState,
    options: Record<string, unknown>
  ) => Promise<void>;
  rulesEnforceMode: string;
  rulesHelpersEnabled: boolean;
  interactionEnforcementEnabled: boolean;
  interactionKinds: Set<string>;
  interactionDecisions: Set<string>;
  isCpuPlayerId: (playerId: string) => boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const newZoneCardInstanceId = () =>
  `card_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;

function normalizeZoneCard(
  entry: unknown,
  seat?: Seat
): Record<string, unknown> | null {
  if (!entry || typeof entry !== "object") return null;
  const src = entry as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...src };
  const rawCardId = src.cardId;
  if (typeof rawCardId === "number") {
    normalized.cardId = rawCardId;
  } else if (typeof rawCardId === "string") {
    const cardIdNum = Number(rawCardId);
    if (Number.isFinite(cardIdNum)) normalized.cardId = cardIdNum;
    else return null;
  } else {
    return null;
  }
  if (src.variantId !== undefined && src.variantId !== null) {
    const rawVariant = src.variantId;
    const variant =
      typeof rawVariant === "number" ? rawVariant : Number(rawVariant);
    if (Number.isFinite(variant)) normalized.variantId = variant;
    else delete normalized.variantId;
  }
  if (
    normalized.thresholds &&
    typeof normalized.thresholds === "object" &&
    normalized.thresholds !== null
  ) {
    normalized.thresholds = {
      ...(normalized.thresholds as Record<string, unknown>),
    };
  }
  if (
    typeof normalized.instanceId !== "string" ||
    normalized.instanceId.length === 0
  ) {
    normalized.instanceId = newZoneCardInstanceId();
  }
  if (seat) {
    const incomingOwner = normalized.owner;
    if (incomingOwner === "p1" || incomingOwner === "p2") {
      if (incomingOwner !== seat) {
        return null;
      }
    }
    normalized.owner = seat;
  } else if (normalized.owner === "p1" || normalized.owner === "p2") {
    // keep provided owner
  } else if ("owner" in normalized) {
    delete normalized.owner;
  }
  return normalized;
}

function normalizeZoneList(values: unknown[], seat?: Seat): unknown[] {
  if (!Array.isArray(values)) return [];
  const result: unknown[] = [];
  for (const entry of values) {
    const normalized = normalizeZoneCard(entry, seat);
    if (normalized) result.push(normalized);
  }
  return result;
}

function cloneZones(zones: PlayerZones, seat: Seat): PlayerZones {
  return {
    spellbook: normalizeZoneList(zones.spellbook, seat),
    atlas: normalizeZoneList(zones.atlas, seat),
    hand: normalizeZoneList(zones.hand, seat),
    graveyard: normalizeZoneList(zones.graveyard, seat),
    battlefield: normalizeZoneList(zones.battlefield, seat),
    collection: normalizeZoneList(zones.collection ?? [], seat),
    banished: normalizeZoneList(zones.banished, seat),
  };
}

function ensurePlayerZones(value: unknown, seat: Seat): PlayerZones {
  if (!isRecord(value)) {
    return {
      spellbook: [],
      atlas: [],
      hand: [],
      graveyard: [],
      battlefield: [],
      collection: [],
      banished: [],
    };
  }
  const arr = (prop: string): unknown[] =>
    Array.isArray(value[prop])
      ? normalizeZoneList(value[prop] as unknown[], seat)
      : [];
  return {
    spellbook: arr("spellbook"),
    atlas: arr("atlas"),
    hand: arr("hand"),
    graveyard: arr("graveyard"),
    battlefield: arr("battlefield"),
    collection: arr("collection"),
    banished: arr("banished"),
  };
}

function buildBattlefieldFromPermanents(
  permanents: MatchPermanents | null | undefined
): Record<Seat, unknown[]> {
  const result: Record<Seat, unknown[]> = { p1: [], p2: [] };
  if (!permanents) return result;
  for (const entries of Object.values(permanents)) {
    if (!Array.isArray(entries)) continue;
    for (const item of entries) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const ownerValue = record.owner;
      const seat: Seat = ownerValue === 2 ? "p2" : "p1";
      const card = record.card;
      const normalized = normalizeZoneCard(card, seat);
      if (normalized) {
        normalized.owner = seat;
        result[seat].push(normalized);
      }
    }
  }
  return result;
}

function zoneCardsEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false;
  }
  return true;
}

function syncBattlefieldZones(
  match: MatchState,
  patch: MatchPatch
): MatchPatch {
  if (!match.game) return patch;
  const battlefield = buildBattlefieldFromPermanents(match.game.permanents);
  const baseZones = match.game.zones ?? {};
  const nextZones: ZonesState = {
    p1: ensurePlayerZones(baseZones?.p1, "p1"),
    p2: ensurePlayerZones(baseZones?.p2, "p2"),
  };
  const dirtySeats: Seat[] = [];
  for (const seat of ["p1", "p2"] as Seat[]) {
    const updated = ensurePlayerZones(nextZones[seat], seat);
    if (!zoneCardsEqual(updated.battlefield, battlefield[seat])) {
      updated.battlefield = battlefield[seat];
      nextZones[seat] = updated;
      dirtySeats.push(seat);
    }
  }
  if (dirtySeats.length === 0 && !patch.permanents) {
    return patch;
  }
  if (dirtySeats.length === 0) {
    dirtySeats.push("p1", "p2");
  }
  match.game = {
    ...(match.game as Record<string, unknown>),
    zones: nextZones,
  } as MatchGameState;

  const existingPatchZones = isRecord(patch.zones) ? { ...patch.zones } : {};
  for (const seat of dirtySeats) {
    existingPatchZones[seat] = nextZones[seat];
  }
  return {
    ...patch,
    zones: existingPatchZones as ZonesState,
  };
}

function ensureAvatar(value: unknown, fallback: AvatarState): AvatarState {
  if (!isRecord(value)) {
    return { ...fallback };
  }
  const posCandidate = isRecord(value.position) ? value.position : null;
  const pos: [number, number] | null =
    posCandidate &&
    typeof posCandidate.x === "number" &&
    typeof posCandidate.z === "number"
      ? [posCandidate.x, posCandidate.z]
      : fallback.pos;
  const tapped =
    typeof value.tapped === "boolean" ? value.tapped : fallback.tapped ?? false;
  const avatar: AvatarState = {
    card: Object.prototype.hasOwnProperty.call(value, "card")
      ? value.card ?? null
      : fallback.card ?? null,
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

function ensurePlayerPosition(
  seat: Seat,
  value: unknown,
  fallback: PlayerPosition
): PlayerPosition {
  if (!isRecord(value)) {
    return { ...fallback };
  }
  const positionCandidate = isRecord(value.position) ? value.position : {};
  const x =
    typeof positionCandidate.x === "number"
      ? positionCandidate.x
      : fallback.position.x;
  const z =
    typeof positionCandidate.z === "number"
      ? positionCandidate.z
      : fallback.position.z;
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
    ensureCosts,
    validateAction,
    enrichPatchWithCosts,
    recordMatchAction,
    persistMatchUpdate,
    finalizeMatch,
    rulesEnforceMode,
    rulesHelpersEnabled,
    interactionEnforcementEnabled,
    interactionKinds,
    interactionDecisions,
    isCpuPlayerId,
  } = deps;

  /**
   * Emit an event to a player using their player room (cross-instance safe).
   * Falls back to socket ID if provided and valid on this instance.
   * Always prefers player room for horizontal scaling compatibility.
   */
  function emitToPlayer<T>(
    playerId: string,
    event: string,
    data: T,
    socketId?: string | null
  ): void {
    // Always use player room for cross-instance compatibility
    // The Socket.IO Redis adapter will propagate to the correct instance
    try {
      io.to(`player:${playerId}`).emit(event, data);
    } catch {
      // Fallback to socket ID if player room fails and we have a valid socket ID
      if (socketId) {
        try {
          io.to(socketId).emit(event, data);
        } catch {}
      }
    }
  }

  // --- Spectator patch broadcasting ---
  function sanitizePatchForSpectator(
    patch: MatchPatch | null | undefined
  ): MatchPatch | null {
    if (!patch || typeof patch !== "object") return patch ?? null;
    const out = { ...(patch as Record<string, unknown>) };
    if (out.zones && typeof out.zones === "object") {
      delete out.zones;
    }
    return out as MatchPatch;
  }

  function broadcastSpectatePatch(
    matchId: string,
    enrichedPatch: MatchPatch,
    now: number
  ): void {
    try {
      const sanitized = sanitizePatchForSpectator(enrichedPatch);
      if (sanitized) {
        try {
          io.to(`spectate:${matchId}`).emit("statePatch", {
            patch: sanitized,
            t: now,
          });
        } catch {}
      }
      try {
        io.to(`spectate:${matchId}:hands`).emit("statePatch", {
          patch: enrichedPatch,
          t: now,
        });
      } catch {}
    } catch {}
  }

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
      emitToPlayer(
        playerId,
        "error",
        {
          message: "Only seated players may take actions",
          code: "action_not_authorized",
        },
        actorSocketId
      );
      return;
    }

    const patchInput = isRecord(incomingPatch)
      ? (incomingPatch as MatchPatch)
      : null;

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
        io.to(matchRoom).emit("matchStarted", {
          match: { ...match, game: match.game },
        });
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
          const replaceLog = Array.isArray(patchToApply.__replaceKeys)
            ? patchToApply.__replaceKeys
            : [];
          const keys =
            Array.isArray(replaceLog) &&
            replaceLog.every((key) => typeof key === "string")
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
          if (
            actorSeat === "p1" &&
            Object.prototype.hasOwnProperty.call(incomingRolls, "p1")
          ) {
            if (prevRolls.p1 == null) {
              const value = incomingRolls.p1;
              const numeric = typeof value === "number" ? value : Number(value);
              if (Number.isFinite(numeric)) {
                inc.p1 = numeric;
              }
            } else {
              try {
                console.warn(
                  "[d20] ignoring extra roll from p1; already rolled",
                  {
                    prev: prevRolls,
                    incRaw: incomingRolls,
                    matchId,
                    playerId,
                  }
                );
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
                console.warn(
                  "[d20] ignoring extra roll from p2; already rolled",
                  {
                    prev: prevRolls,
                    incRaw: incomingRolls,
                    matchId,
                    playerId,
                  }
                );
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
            console.log("[d20] merge", {
              prev: prevRolls,
              inc: incomingRolls,
              merged,
              matchId,
            });
          } catch {
            // ignore
          }
          if (merged.p1 != null && merged.p2 != null) {
            if (Number(merged.p1) === Number(merged.p2)) {
              try {
                console.log("[d20] tie detected -> resetting for reroll", {
                  merged,
                  matchId,
                });
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
              const winnerSeat: Seat =
                Number(merged.p1) > Number(merged.p2) ? "p1" : "p2";
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
              console.log("[d20] partial roll - waiting for second player", {
                merged,
                matchId,
              });
            } catch {
              // ignore
            }
          }
        }

        if (!isSnapshot) {
          try {
            const costRes = ensureCosts(match.game, patchToApply, playerId, {
              match,
            });
            if (costRes && costRes.autoPatch && rulesHelpersEnabled) {
              patchToApply = deepMergeReplaceArrays(
                patchToApply as Record<string, unknown>,
                costRes.autoPatch as Record<string, unknown>
              ) as MatchPatch;
              try {
                console.debug("[rules] ensureCosts autoPatch applied", {
                  matchId,
                  playerId,
                  keys: Object.keys(costRes.autoPatch || {}),
                  isSnapshot,
                });
              } catch {
                // ignore debug logging failures
              }
            }
            if (costRes && costRes.ok === false) {
              if (enforce) {
                emitToPlayer(
                  playerId,
                  "error",
                  {
                    message: costRes.error || "Insufficient resources",
                    code: "cost_unpaid",
                  },
                  actorSocketId
                );
                try {
                  console.warn("[rules] ensureCosts rejected action", {
                    matchId,
                    playerId,
                    error: costRes.error,
                    isSnapshot,
                  });
                } catch {
                  // ignore logging failures
                }
                return;
              }
              const warn = [
                {
                  id: 0,
                  ts: Date.now(),
                  text: `[Warning] ${
                    costRes.error || "Insufficient resources"
                  }`,
                },
              ];
              const existingEvents = Array.isArray(patchToApply.events)
                ? patchToApply.events
                : [];
              patchToApply = {
                ...patchToApply,
                events: [...existingEvents, ...warn],
              };
            }
          } catch {
            // ignore cost helper failures
          }

          try {
            const validationResult = validateAction(
              match.game,
              patchToApply,
              playerId,
              { match }
            );
            if (!validationResult.ok) {
              const msg = validationResult.error
                ? String(validationResult.error)
                : "";
              try {
                console.warn("[rules] validateAction rejected action", {
                  matchId,
                  playerId,
                  error: msg,
                  isSnapshot,
                });
              } catch {
                // ignore logging failures
              }

              const mustReject = /Cannot tap or untap opponent/i.test(
                msg || ""
              );
              if (mustReject) {
                emitToPlayer(
                  playerId,
                  "error",
                  {
                    message: msg || "Illegal tap action",
                    code: "rules_violation",
                  },
                  actorSocketId
                );
                return;
              }

              if (enforce) {
                emitToPlayer(
                  playerId,
                  "error",
                  {
                    message: validationResult.error || "Rules violation",
                    code: "rules_violation",
                  },
                  actorSocketId
                );
                return;
              }

              const warnEvent = [
                {
                  id: 0,
                  ts: Date.now(),
                  text: `[Warning] ${
                    validationResult.error || "Potential rules issue"
                  }`,
                },
              ];
              const existingEvents = Array.isArray(patchToApply.events)
                ? patchToApply.events
                : [];
              patchToApply = {
                ...patchToApply,
                events: [...existingEvents, ...warnEvent],
              };
            }
          } catch {
            // ignore validation failures
          }
        }

        const eventsAdded = sanitizeEvents(patch.events);
        const appliedEvents = sanitizeEvents(patchToApply.events);
        const combinedEvents = [...eventsAdded, ...appliedEvents];
        if (combinedEvents.length > 0) {
          const previousEvents = Array.isArray(match.game?.events)
            ? match.game?.events
            : [];
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

        const baseForMerge: MatchGameState = match.game
          ? { ...match.game }
          : {};

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
            collection: [],
            banished: [],
          };

          const normalizedPrevZones: ZonesState = {
            p1: prevZones?.p1
              ? cloneZones(ensurePlayerZones(prevZones.p1, "p1"), "p1")
              : { ...defaultZones },
            p2: prevZones?.p2
              ? cloneZones(ensurePlayerZones(prevZones.p2, "p2"), "p2")
              : { ...defaultZones },
          };
          const incomingZones = patchToApply.zones ?? {};
          const hasP1 = isRecord(incomingZones) && "p1" in incomingZones;
          const hasP2 = isRecord(incomingZones) && "p2" in incomingZones;
          const incomingP1 = hasP1
            ? ensurePlayerZones(incomingZones.p1, "p1")
            : null;
          const incomingP2 = hasP2
            ? ensurePlayerZones(incomingZones.p2, "p2")
            : null;
          const nextZones: ZonesState = {
            p1: incomingP1
              ? {
                  ...normalizedPrevZones.p1,
                  ...incomingP1,
                }
              : normalizedPrevZones.p1,
            p2: incomingP2
              ? {
                  ...normalizedPrevZones.p2,
                  ...incomingP2,
                }
              : normalizedPrevZones.p2,
          };

          const prevAvatars = match.game?.avatars ?? {
            p1: undefined,
            p2: undefined,
          };
          const defaultAvatar: AvatarState = {
            card: null,
            pos: null,
            tapped: false,
          };
          const fallbackAvatars: AvatarsState = {
            p1: ensureAvatar(prevAvatars.p1, defaultAvatar),
            p2: ensureAvatar(prevAvatars.p2, defaultAvatar),
          };
          const incomingAvatars = patchToApply.avatars ?? {};

          // Ensure card property is preserved from previous state if not explicitly updated
          const normalizedAvatars: AvatarsState = {
            p1: ensureAvatar(
              incomingAvatars?.p1,
              fallbackAvatars.p1 ?? defaultAvatar
            ),
            p2: ensureAvatar(
              incomingAvatars?.p2,
              fallbackAvatars.p2 ?? defaultAvatar
            ),
          };

          // Preserve existing cards if not explicitly updated in the patch
          if (
            incomingAvatars?.p1 &&
            !Object.prototype.hasOwnProperty.call(incomingAvatars.p1, "card") &&
            prevAvatars.p1?.card &&
            normalizedAvatars.p1
          ) {
            normalizedAvatars.p1 = {
              card: prevAvatars.p1.card,
              pos: normalizedAvatars.p1.pos,
              tapped: normalizedAvatars.p1.tapped,
              offset: normalizedAvatars.p1.offset,
            };
          }
          if (
            incomingAvatars?.p2 &&
            !Object.prototype.hasOwnProperty.call(incomingAvatars.p2, "card") &&
            prevAvatars.p2?.card &&
            normalizedAvatars.p2
          ) {
            normalizedAvatars.p2 = {
              card: prevAvatars.p2.card,
              pos: normalizedAvatars.p2.pos,
              tapped: normalizedAvatars.p2.tapped,
              offset: normalizedAvatars.p2.offset,
            };
          }

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

        if (patchToApply.zones && isRecord(patchToApply.zones)) {
          const incomingZones = patchToApply.zones as ZonesState;
          const sanitizedZones: Partial<ZonesState> = {};
          if (
            isRecord(incomingZones) &&
            "p1" in incomingZones &&
            actorSeat === "p1"
          ) {
            sanitizedZones.p1 = ensurePlayerZones(incomingZones.p1, "p1");
          } else if (
            isRecord(incomingZones) &&
            "p1" in incomingZones &&
            actorSeat !== "p1"
          ) {
            try {
              console.warn("[match] dropped opponent zone update", {
                matchId,
                playerId,
                seat: "p1",
                actorSeat,
              });
            } catch {
              // ignore
            }
          }
          if (
            isRecord(incomingZones) &&
            "p2" in incomingZones &&
            actorSeat === "p2"
          ) {
            sanitizedZones.p2 = ensurePlayerZones(incomingZones.p2, "p2");
          } else if (
            isRecord(incomingZones) &&
            "p2" in incomingZones &&
            actorSeat !== "p2"
          ) {
            try {
              console.warn("[match] dropped opponent zone update", {
                matchId,
                playerId,
                seat: "p2",
                actorSeat,
              });
            } catch {
              // ignore logging failures
            }
          }
          const zoneKeys = Object.keys(sanitizedZones).filter(
            (key) => sanitizedZones[key as keyof ZonesState]
          );
          if (zoneKeys.length > 0) {
            patchToApply = {
              ...patchToApply,
              zones: sanitizedZones as ZonesState,
            };
          } else {
            const clone = { ...patchToApply } as Record<string, unknown>;
            delete clone.zones;
            patchToApply = clone as MatchPatch;
          }
        }

        // DEBUG: Log patch before deep merge
        if (patchToApply.zones) {
          const patchP1Hand = (patchToApply.zones as any)?.p1?.hand || [];
          const patchP2Hand = (patchToApply.zones as any)?.p2?.hand || [];
          const baseP1Hand = (baseForMerge as any)?.zones?.p1?.hand || [];
          const baseP2Hand = (baseForMerge as any)?.zones?.p2?.hand || [];
          console.log("[match-leader] Before deep merge:", {
            patchP1HandCount: patchP1Hand.length,
            patchP2HandCount: patchP2Hand.length,
            baseP1HandCount: baseP1Hand.length,
            baseP2HandCount: baseP2Hand.length,
            patchP1HandCards: patchP1Hand.map((c: any) => c.name || c.cardId),
            patchP2HandCards: patchP2Hand.map((c: any) => c.name || c.cardId),
            patchHasPermanents: !!patchToApply.permanents,
          });
        }

        const mergedGame = deepMergeReplaceArrays(
          baseForMerge as Record<string, unknown>,
          patchToApply as Record<string, unknown>
        );
        match.game = mergedGame as MatchGameState;

        // DEBUG: Log zones state after merge
        if (patchToApply.zones) {
          const p1Hand = match.game.zones?.p1?.hand || [];
          const p2Hand = match.game.zones?.p2?.hand || [];
          console.log("[match-leader] Zones after merge:", {
            patchHadZones: !!patchToApply.zones,
            p1HandCount: p1Hand.length,
            p2HandCount: p2Hand.length,
            p1HandCards: p1Hand.map((c: any) => c.name || c.cardId),
            p2HandCards: p2Hand.map((c: any) => c.name || c.cardId),
            patchKeys: Object.keys(patchToApply.zones),
          });
        }

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

        // Auto-increment turn counter when currentPlayer changes
        // This ensures applyTurnStart can detect actual turn changes
        const prevCurrentPlayer = baseForMerge.currentPlayer;
        const nextCurrentPlayer = match.game?.currentPlayer;
        if (
          prevCurrentPlayer &&
          nextCurrentPlayer &&
          prevCurrentPlayer !== nextCurrentPlayer
        ) {
          const currentTurn = Number(match.game?.turn || 1);
          match.game = {
            ...match.game,
            turn: currentTurn + 1,
          } as MatchGameState;
          patchToApply = {
            ...patchToApply,
            turn: currentTurn + 1,
          };
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

        const genesisPatch = applyGenesis(match.game, patchToApply, playerId, {
          match,
        });
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

        const keywordPatch = applyKeywordAnnotations(
          match.game,
          patchToApply,
          playerId,
          { match }
        );
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

        const requirements = collectInteractionRequirements(
          patchToApply,
          actorSeat
        );
        const shouldEnforceInteraction =
          interactionEnforcementEnabled &&
          match.status === "in_progress" &&
          !isSnapshot;
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
              console.warn(
                "[interaction] opponent zone write allowed without permit",
                {
                  matchId,
                  playerId,
                  actorSeat,
                }
              );
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

        // Skip syncBattlefieldZones for simple permanent movements to preserve echo filter
        // Only sync zones when explicitly needed (zone changes, game state changes, etc.)
        const isPurePermMovement =
          patchToApply.permanents &&
          !patchToApply.zones &&
          !patchToApply.matchEnded &&
          !patchToApply.phase &&
          !patchToApply.turn;

        if (!isPurePermMovement) {
          patchToApply = syncBattlefieldZones(match, patchToApply);
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

        const patchKeys = Object.keys(
          (enrichedPatchToApply as unknown as Record<string, unknown>) || {}
        );
        const nonMetaKeys = patchKeys.filter(
          (key) =>
            key !== "__replaceKeys" && key !== "events" && key !== "eventSeq"
        );
        const hasD20RollsPatch = nonMetaKeys.includes("d20Rolls");
        const d20OnlyPatch =
          hasD20RollsPatch &&
          nonMetaKeys.every(
            (key) => key === "d20Rolls" || key === "setupWinner"
          );

        // Build an events-only patch for the acting player so they still see
        // rule warnings and other log entries without receiving a full echo.
        let eventsForSender: MatchPatch | null = null;
        if (
          enrichedPatchToApply.events &&
          Array.isArray(enrichedPatchToApply.events)
        ) {
          const base: Record<string, unknown> = {
            events: enrichedPatchToApply.events,
          };
          if (
            Object.prototype.hasOwnProperty.call(
              enrichedPatchToApply as Record<string, unknown>,
              "eventSeq"
            )
          ) {
            base.eventSeq = (
              enrichedPatchToApply as Record<string, unknown>
            ).eventSeq;
          }
          eventsForSender = base as MatchPatch;
        }

        const sender = players.get(playerId);
        const senderSocketId = sender?.socketId;
        if (senderSocketId) {
          if (d20OnlyPatch) {
            io.to(matchRoom).emit("statePatch", {
              patch: enrichedPatchToApply,
              t: now,
            });
          } else {
            // Exclude sender from full statePatch broadcast to prevent echo overwrites,
            // but send an events-only patch to the acting player so they still see logs.
            io.to(matchRoom)
              .except(senderSocketId)
              .emit("statePatch", { patch: enrichedPatchToApply, t: now });
            if (eventsForSender) {
              io.to(senderSocketId).emit("statePatch", {
                patch: eventsForSender,
                t: now,
              });
            }
          }
        } else {
          io.to(matchRoom).emit("statePatch", {
            patch: enrichedPatchToApply,
            t: now,
          });
        }
        // Also broadcast to spectators (sanitized unless commentator)
        try {
          const patchForSpectators = (enrichedPatchToApply ??
            patchToApply) as MatchPatch;
          broadcastSpectatePatch(matchId, patchForSpectators, now);
        } catch {}

        await persistMatchUpdate(match, patchToApply, playerId, now);

        if (shouldFinalizeMatch) {
          try {
            await finalizeMatch(match, finalizeOptions ?? {});
          } catch (err) {
            try {
              console.warn(
                "[match] finalize failed",
                err instanceof Error ? err.message : err
              );
            } catch {
              // ignore
            }
          }
        }
      } else {
        const enrichedPatch = await enrichPatchWithCosts(patch, prisma);

        // Build an events-only patch for the acting player (if any events exist)
        let eventsForSender: MatchPatch | null = null;
        if (enrichedPatch?.events && Array.isArray(enrichedPatch.events)) {
          const base: Record<string, unknown> = {
            events: enrichedPatch.events,
          };
          if (
            Object.prototype.hasOwnProperty.call(
              enrichedPatch as Record<string, unknown>,
              "eventSeq"
            )
          ) {
            base.eventSeq = (enrichedPatch as Record<string, unknown>).eventSeq;
          }
          eventsForSender = base as MatchPatch;
        }

        // Exclude sender from full statePatch broadcast to prevent echo overwrites,
        // but send an events-only patch so they still see logs.
        const sender = players.get(playerId);
        const senderSocketId = sender?.socketId;
        if (senderSocketId) {
          io.to(matchRoom)
            .except(senderSocketId)
            .emit("statePatch", { patch: enrichedPatch, t: now });
          if (eventsForSender) {
            io.to(senderSocketId).emit("statePatch", {
              patch: eventsForSender,
              t: now,
            });
          }
        } else {
          io.to(matchRoom).emit("statePatch", { patch: enrichedPatch, t: now });
        }
        // Also broadcast to spectators (sanitized unless commentator)
        try {
          const patchForSpectators = (enrichedPatch ?? patch ?? undefined) as
            | MatchPatch
            | undefined;
          if (patchForSpectators)
            broadcastSpectatePatch(matchId, patchForSpectators, now);
        } catch {}

        await persistMatchUpdate(match, patch ?? null, playerId, now);
      }
    } catch (error) {
      const enrichedIncoming = await enrichPatchWithCosts(
        patchInput ?? null,
        prisma
      );

      // Build an events-only patch for the acting player (if any events exist)
      let eventsForSender: MatchPatch | null = null;
      if (enrichedIncoming?.events && Array.isArray(enrichedIncoming.events)) {
        const base: Record<string, unknown> = {
          events: enrichedIncoming.events,
        };
        if (
          Object.prototype.hasOwnProperty.call(
            enrichedIncoming as Record<string, unknown>,
            "eventSeq"
          )
        ) {
          base.eventSeq = (
            enrichedIncoming as Record<string, unknown>
          ).eventSeq;
        }
        eventsForSender = base as MatchPatch;
      }

      // Exclude sender from full statePatch broadcast to prevent echo overwrites,
      // but send an events-only patch so they still see logs.
      const sender = players.get(playerId);
      const senderSocketId = sender?.socketId;
      const tNow = Date.now();
      if (senderSocketId) {
        io.to(matchRoom)
          .except(senderSocketId)
          .emit("statePatch", { patch: enrichedIncoming, t: tNow });
        if (eventsForSender) {
          io.to(senderSocketId).emit("statePatch", {
            patch: eventsForSender,
            t: tNow,
          });
        }
      } else {
        io.to(matchRoom).emit("statePatch", {
          patch: enrichedIncoming,
          t: tNow,
        });
      }
      // Also broadcast to spectators (sanitized unless commentator)
      try {
        const patchForSpectators = (enrichedIncoming ??
          (patchInput as MatchPatch | null) ??
          undefined) as MatchPatch | undefined;
        if (patchForSpectators)
          broadcastSpectatePatch(matchId, patchForSpectators, tNow);
      } catch {}

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

  async function joinMatch(
    matchId: string,
    playerId: string,
    socketId: string
  ): Promise<void> {
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

    // Join socket to match room (local instance only)
    try {
      await io.in(socketId).socketsJoin(room);
      console.log("[joinMatch] Socket joined room", {
        socketId,
        room,
        playerId,
      });
    } catch (err) {
      // Socket may not exist on this instance (cross-instance forwarding)
      // This is expected when the leader is not the player's connected instance
      console.debug("[joinMatch] Socket not on this instance", {
        socketId,
        room,
        playerId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Emit to player via their player room (cross-instance safe)
    try {
      emitToPlayer(
        playerId,
        "matchStarted",
        { match: getMatchInfo(match) },
        socketId
      );
    } catch {
      // ignore
    }
    // Also broadcast to match room for any other connected players/spectators
    try {
      io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
    } catch {
      // ignore
    }

    // Send draft state if in progress
    try {
      if (
        match.matchType === "draft" &&
        match.draftState &&
        match.draftState.phase &&
        match.draftState.phase !== "waiting"
      ) {
        emitToPlayer(playerId, "draftUpdate", match.draftState, socketId);
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

  async function handleMulliganDone(
    matchId: string,
    playerId: string
  ): Promise<void> {
    const match = await getOrLoadMatch(matchId);
    if (!match) return;
    // Allow sealed tournament matches to proceed from deck_construction if both decks are present
    const decks = match.playerDecks instanceof Map ? match.playerDecks : null;
    const allDecksSubmitted = !!(
      decks &&
      Array.isArray(match.playerIds) &&
      match.playerIds.every((pid) => decks.has(pid))
    );
    const canProceedStatus =
      match.status === "waiting" ||
      match.status === "in_progress" ||
      (match.status === "deck_construction" &&
        match.matchType === "sealed" &&
        allDecksSubmitted);
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
      const names = waitingFor.map(
        (pid) => players.get(pid)?.displayName ?? pid
      );
      console.log(
        `[Setup] mulliganDone <= ${playerId}${
          wasAlreadyDone ? " (duplicate)" : ""
        }. ${doneCount}/${total} complete. Waiting for: ${
          names.length > 0 ? names.join(", ") : "none"
        }`
      );
    } catch {
      // ignore logging errors
    }

    const totalPlayers = Array.isArray(match.playerIds)
      ? match.playerIds.length
      : 0;
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
      currentPlayer:
        typeof game.currentPlayer === "number" ? game.currentPlayer : 1,
      interactionGrants: {},
      interactionRequests: {},
      ...(d20Rolls ? { d20Rolls } : {}),
      __replaceKeys: d20Rolls
        ? [
            "phase",
            "status",
            "currentPlayer",
            "interactionGrants",
            "interactionRequests",
            "d20Rolls",
          ]
        : [
            "phase",
            "status",
            "currentPlayer",
            "interactionGrants",
            "interactionRequests",
          ],
    };

    try {
      // Broadcast to the entire room, including the sender, so both clients
      // advance phase locally without relying on a resync.
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
      io.to(`match:${match.id}`).emit("matchStarted", {
        match: getMatchInfo(match),
      });
    } catch {}
  }

  async function handleInteractionRequest(
    matchId: string,
    playerId: string,
    payload: Record<string, unknown> | null | undefined
  ): Promise<LeaderResult> {
    try {
      const match = await getOrLoadMatch(matchId);
      if (!match)
        return {
          ok: false,
          error: "Match not found",
          code: "interaction_internal",
        };
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
      const opponentId = Array.isArray(match.playerIds)
        ? match.playerIds[opponentIndex]
        : null;
      if (!opponentId) {
        return {
          ok: false,
          error: "Opponent unavailable for interaction",
          code: "interaction_invalid_opponent",
        };
      }

      const rawKind =
        payload && typeof payload.kind === "string"
          ? (payload.kind as string)
          : null;
      if (!rawKind || !interactionKinds.has(rawKind)) {
        return {
          ok: false,
          error: "Unsupported interaction kind",
          code: "interaction_invalid_kind",
        };
      }

      const requestId =
        payload &&
        typeof payload.requestId === "string" &&
        payload.requestId.length >= 6
          ? (payload.requestId as string)
          : rid("intl");
      const expiresAtRaw = Number(payload?.expiresAt);
      const expiresAt =
        Number.isFinite(expiresAtRaw) && expiresAtRaw > now
          ? expiresAtRaw
          : null;
      const note =
        payload && typeof payload.note === "string"
          ? (payload.note as string).slice(0, 280)
          : undefined;

      const rawPayload =
        payload &&
        typeof payload.payload === "object" &&
        payload.payload !== null
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

      const pendingAction = sanitizePendingAction(
        rawKind,
        sanitizedPayload,
        actorSeat,
        playerId
      );

      recordInteractionRequest(
        match,
        message,
        proposedGrant ?? null,
        pendingAction
      );
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
      if (!match)
        return {
          ok: false,
          error: "Match not found",
          code: "interaction_internal",
        };
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
        payload && typeof payload.requestId === "string"
          ? (payload.requestId as string)
          : null;
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
        payload &&
        typeof payload.payload === "object" &&
        payload.payload !== null
          ? (payload.payload as Record<string, unknown>)
          : {};
      const sanitizedPayload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rawPayload)) {
        if (key === "grant" || key === "proposedGrant") continue;
        sanitizedPayload[key] = value;
      }

      let grantOpts: Record<string, unknown> | null = null;
      if (rawDecision === "approved") {
        const grantSeat =
          actorSeat ?? getOpponentSeat(getSeatForPlayer(match, request.from)!);
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
          const grantRecord = createGrantRecord(
            entryRecord,
            responseMessage,
            grantOpts,
            now
          );
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

export const __testZoneHelpers = {
  normalizeZoneCardForSeat: normalizeZoneCard,
  ensurePlayerZonesForSeat: ensurePlayerZones,
  buildBattlefieldFromPermanentsForTest: buildBattlefieldFromPermanents,
  syncBattlefieldZonesForTest: syncBattlefieldZones,
};
