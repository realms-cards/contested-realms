import type { PrismaClient } from "@prisma/client";
import {
  getSeatForPlayer as _getSeatForPlayer,
  getPlayerIdForSeat as _getPlayerIdForSeat,
  getOpponentSeat,
  inferLoserId as _inferLoserId,
} from "../match-utils";

export const INTERACTION_VERSION = 1;

export const INTERACTION_ENFORCEMENT_ENABLED = (() => {
  const raw = process.env.INTERACTION_ENFORCEMENT_ENABLED;
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "on" ||
    normalized === "yes"
  ) {
    return true;
  }
  if (
    normalized === "0" ||
    normalized === "false" ||
    normalized === "off" ||
    normalized === "no"
  ) {
    return false;
  }
  return false;
})();

export const INTERACTION_REQUEST_KINDS = new Set([
  "instantSpell",
  "defend",
  "forcedDraw",
  "inspectHand",
  "takeFromPile",
  "manipulatePermanent",
  "tieGame",
  "inspectBanished",
  "unbanishCard",
  "restoreSnapshot",
  // Site manipulation (Earthquake, Rift Valley)
  "switchSite",
  // Cemetery manipulation (recursion effects)
  "graveyardAction",
]);

export const INTERACTION_DECISIONS = new Set([
  "approved",
  "declined",
  "cancelled",
]);

interface InteractionModuleDeps {
  io: import("socket.io").Server;
  rid: (prefix: string) => string;
  enrichPatchWithCosts: (
    patch: MatchPatch | null,
    prismaClient: PrismaClient,
  ) => Promise<MatchPatch | null>;
  deepMergeReplaceArrays: (base: JsonRecord, patch: MatchPatch) => JsonRecord;
  finalizeMatch: (
    match: MatchState & { status: string; matchType: string },
    options?: JsonRecord,
  ) => Promise<void> | void;
  persistMatchUpdate: (
    match: MatchState,
    patch: MatchPatch,
    playerId: string,
    ts: number,
  ) => Promise<void>;
  prisma: PrismaClient;
  // Optional: functions to truncate replay data when snapshot is restored
  truncateRecordingAfter?: (matchId: string, afterTimestamp: number) => number;
  truncateActionsAfter?: (
    matchId: string,
    afterTimestamp: number,
  ) => Promise<number>;
}

type JsonRecord = Record<string, unknown>;
type MatchPatch = Record<string, unknown>;
type Seat = "p1" | "p2";
type GrantRequirement = "allowOpponentZoneWrite";

interface PlayerLifeState extends JsonRecord {
  life?: number;
  lifeState?: string;
}

interface CardSnapshot extends JsonRecord {
  name?: string;
  type?: string;
  slug?: string;
  instanceId?: string;
  cardId?: number;
  variantId?: number;
  owner?: string;
}

interface ZoneState extends JsonRecord {
  hand?: CardSnapshot[];
  spellbook?: CardSnapshot[];
  atlas?: CardSnapshot[];
  graveyard?: CardSnapshot[];
  banished?: CardSnapshot[];
}

type MatchZones = Partial<Record<Seat, ZoneState>>;

interface MatchGameState extends JsonRecord {
  zones?: MatchZones;
  players?: {
    p1?: PlayerLifeState;
    p2?: PlayerLifeState;
  };
  matchEnded?: boolean;
}

interface InteractionRequestMessage extends JsonRecord {
  type: "interaction:request";
  requestId: string;
  matchId: string;
  from: string;
  to: string;
  kind?: string;
  createdAt?: number;
  expiresAt?: number;
}

interface InteractionResponseMessage extends JsonRecord {
  requestId: string;
  matchId: string;
  from: string;
  to: string;
  kind?: string;
  decision?: string;
  createdAt?: number;
  respondedAt?: number;
  expiresAt?: number;
}

interface InteractionGrant extends JsonRecord {
  __grantId?: string;
  requestId?: string;
  kind?: string;
  grantedBy?: string;
  grantedTo?: string;
  targetSeat?: Seat | null;
  createdAt?: number;
  expiresAt?: number | null;
  singleUse?: boolean;
  allowOpponentZoneWrite?: boolean;
  allowRevealOpponentHand?: boolean;
  lastUsed?: number;
}

interface InteractionEntry extends JsonRecord {
  request: InteractionRequestMessage | null;
  response: InteractionResponseMessage | null;
  status: string;
  proposedGrant: JsonRecord | null;
  grant: InteractionGrant | null;
  pendingAction: JsonRecord | null;
  result: JsonRecord | null;
  createdAt: number;
  updatedAt: number;
}

interface MatchState extends JsonRecord {
  id: string;
  playerIds: string[];
  status: string;
  matchType: string;
  game: MatchGameState;
  lastTs?: number;
  tournamentId?: string | null;
  interactionRequests?: Map<string, InteractionEntry>;
  interactionGrants?: Map<string, InteractionGrant[]>;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function isSeat(value: unknown): value is Seat {
  return value === "p1" || value === "p2";
}

function getZoneState(zones: unknown, seat: Seat): ZoneState | null {
  if (!isRecord(zones)) return null;
  const seatZones = zones[seat];
  return isRecord(seatZones) ? (seatZones as ZoneState) : null;
}

function toCardSnapshot(card: unknown): CardSnapshot {
  if (!isRecord(card)) return {};
  const out: CardSnapshot = {};
  if (typeof card.name === "string") out.name = card.name;
  if (typeof card.type === "string") out.type = card.type;
  if (typeof card.slug === "string") out.slug = card.slug;
  if (typeof card.instanceId === "string") out.instanceId = card.instanceId;
  if (Number.isFinite(Number(card.cardId))) out.cardId = Number(card.cardId);
  if (Number.isFinite(Number(card.variantId))) {
    out.variantId = Number(card.variantId);
  }
  return out;
}

function getCardName(card: unknown): string {
  return isRecord(card) && typeof card.name === "string" ? card.name : "Card";
}

function findCardIndex(cards: unknown[], instanceId: string): number {
  return cards.findIndex(
    (card) =>
      isRecord(card) &&
      typeof card.instanceId === "string" &&
      card.instanceId === instanceId,
  );
}

function getInteractionRequests(match: MatchState): Map<string, InteractionEntry> {
  if (!(match.interactionRequests instanceof Map)) {
    match.interactionRequests = new Map();
  }
  return match.interactionRequests;
}

function getInteractionGrants(match: MatchState): Map<string, InteractionGrant[]> {
  if (!(match.interactionGrants instanceof Map)) {
    match.interactionGrants = new Map();
  }
  return match.interactionGrants;
}

export function createInteractionModule({
  io,
  rid,
  enrichPatchWithCosts,
  deepMergeReplaceArrays,
  finalizeMatch,
  persistMatchUpdate: _persistMatchUpdate,
  prisma,
  truncateRecordingAfter,
  truncateActionsAfter,
	}: InteractionModuleDeps) {
  function ensureInteractionState(match: MatchState): void {
    if (!match) return;
    if (!(match.interactionRequests instanceof Map)) {
      match.interactionRequests = new Map();
    }
    if (!(match.interactionGrants instanceof Map)) {
      match.interactionGrants = new Map();
    }
  }

  function sanitizeGrantOptions(
    raw: unknown,
    fallbackSeat: Seat | null,
  ): JsonRecord | null {
    if (!raw || typeof raw !== "object") {
      if (!fallbackSeat) return null;
      return {
        targetSeat: fallbackSeat,
      };
    }
    const json = raw as JsonRecord;
    const targetSeat =
      json.targetSeat === "p1" || json.targetSeat === "p2"
        ? json.targetSeat
        : fallbackSeat || null;
    const expiresAt = Number.isFinite(Number(json.expiresAt))
      ? Number(json.expiresAt)
      : null;
    const result: Record<string, unknown> = {
      targetSeat,
    };
    if (expiresAt !== null) result.expiresAt = expiresAt;
    if (json.singleUse === true) result.singleUse = true;
    if (json.allowOpponentZoneWrite === true)
      result.allowOpponentZoneWrite = true;
    if (json.allowRevealOpponentHand === true)
      result.allowRevealOpponentHand = true;
    return result as JsonRecord;
  }

  function purgeExpiredGrants(match: MatchState, now: number) {
    const interactionGrants = getInteractionGrants(match);
    for (const [playerId, grants] of interactionGrants.entries()) {
      const filtered = Array.isArray(grants)
        ? grants.filter(
            (grant) => !grant || !grant.expiresAt || grant.expiresAt > now,
          )
        : [];
      if (filtered.length > 0) {
        interactionGrants.set(playerId, filtered);
      } else {
        interactionGrants.delete(playerId);
      }
    }
  }

  function detectOpponentZoneMutation(
    patch: MatchPatch,
    actorSeat: Seat | null,
  ): boolean {
    if (!patch || typeof patch !== "object") return false;
    const opponentSeat = getOpponentSeat(actorSeat);
    if (!opponentSeat) return false;
    const zones = patch.zones;
    const zonePayload = getZoneState(zones, opponentSeat);
    if (zonePayload) {
      for (const key of Object.keys(zonePayload)) {
        if (zonePayload[key] !== undefined) {
          return true;
        }
      }
    }
    const avatars = patch.avatars;
    if (isRecord(avatars) && isRecord(avatars[opponentSeat])) {
      if (Object.keys(avatars[opponentSeat] as JsonRecord).length > 0) {
        return true;
      }
    }
    return false;
  }

  function collectInteractionRequirements(
    patch: MatchPatch,
    actorSeat: Seat | null,
  ): { needsOpponentZoneWrite: boolean } {
    return {
      needsOpponentZoneWrite: detectOpponentZoneMutation(patch, actorSeat),
    };
  }

  function usePermitForRequirement(
    match: MatchState,
    playerId: string,
    actorSeat: Seat | null,
    requirement: GrantRequirement,
    now: number,
  ): InteractionGrant | null {
    const interactionGrants = getInteractionGrants(match);
    const grants = interactionGrants.get(playerId);
    if (!Array.isArray(grants) || grants.length === 0) return null;
    const opponentSeat = getOpponentSeat(actorSeat);
    let consumedIndex = -1;
    const usableGrant = grants.find((grant, idx) => {
      if (!grant) return false;
      if (grant.expiresAt && grant.expiresAt <= now) return false;
      if (grant.targetSeat && grant.targetSeat !== opponentSeat) return false;
      if (
        requirement === "allowOpponentZoneWrite" &&
        grant.allowOpponentZoneWrite !== true
      )
        return false;
      consumedIndex = idx;
      return true;
    });
    if (!usableGrant) return null;
    if (usableGrant.singleUse === true && consumedIndex > -1) {
      grants.splice(consumedIndex, 1);
      if (grants.length > 0) {
        interactionGrants.set(playerId, grants);
      } else {
        interactionGrants.delete(playerId);
      }
    }
    usableGrant.lastUsed = now;
    return usableGrant;
  }

  function createGrantRecord(
    request: InteractionRequestMessage,
    response: InteractionResponseMessage,
    grantOpts: JsonRecord | null,
    now: number,
  ): InteractionGrant {
    const targetSeat =
      grantOpts && isSeat(grantOpts.targetSeat) ? grantOpts.targetSeat : null;
    const expiresAt =
      grantOpts && typeof grantOpts.expiresAt === "number"
        ? grantOpts.expiresAt
        : null;
    return {
      __grantId: rid("igr"),
      requestId: request.requestId,
      kind: request.kind,
      grantedBy: response.from,
      grantedTo: response.to,
      targetSeat,
      createdAt: now,
      expiresAt,
      singleUse: grantOpts?.singleUse === true,
      allowOpponentZoneWrite: grantOpts?.allowOpponentZoneWrite === true,
      allowRevealOpponentHand: grantOpts?.allowRevealOpponentHand === true,
    };
  }

  function recordInteractionRequest(
    match: MatchState,
    message: InteractionRequestMessage,
    proposedGrant: JsonRecord | null,
    pendingAction: JsonRecord | null,
  ): void {
    const interactionRequests = getInteractionRequests(match);
    const entry = interactionRequests.get(message.requestId);
    const now = message.createdAt || Date.now();
    interactionRequests.set(message.requestId, {
      request: message,
      response: entry?.response || null,
      status: "pending",
      proposedGrant: proposedGrant || entry?.proposedGrant || null,
      grant: entry?.grant || null,
      pendingAction: pendingAction || entry?.pendingAction || null,
      result: entry?.result || null,
      createdAt: entry?.createdAt || now,
      updatedAt: now,
    });
  }

  function recordInteractionResponse(
    match: MatchState,
    response: InteractionResponseMessage,
    grantRecord: InteractionGrant | null,
  ): void {
    const interactionRequests = getInteractionRequests(match);
    const entry = interactionRequests.get(response.requestId);
    const now = response.respondedAt || Date.now();
    const next: InteractionEntry = {
      request: entry?.request || null,
      response,
      status: response.decision ?? "cancelled",
      proposedGrant: entry?.proposedGrant || null,
      grant: grantRecord || entry?.grant || null,
      pendingAction: entry?.pendingAction || null,
      result: entry?.result || null,
      createdAt:
        entry?.createdAt || (entry?.request && entry.request.createdAt) || now,
      updatedAt: now,
    };
    if (!next.request) {
      next.request = {
        type: "interaction:request",
        requestId: response.requestId,
        matchId: response.matchId,
        from: response.to,
        to: response.from,
        kind: response.kind,
        createdAt: response.createdAt || now,
        expiresAt: response.expiresAt,
      };
    }
    interactionRequests.set(response.requestId, next);
  }

  function emitInteraction(matchId: string, message: JsonRecord) {
    const envelope = {
      type: "interaction",
      version: INTERACTION_VERSION,
      message,
    };
    const room = `match:${matchId}`;
    // Only emit the envelope - client handles unwrapping.
    // Previously we also emitted message.type directly, causing duplicate processing.
    io.to(room).emit("interaction", envelope);
  }

  function emitInteractionResult(matchId: string, result: JsonRecord) {
    const room = `match:${matchId}`;
    io.to(room).emit("interaction:result", result);
  }

  function sanitizePendingAction(
    kind: string,
    payload: unknown,
    actorSeat: Seat | null,
    requestingPlayerId: string,
  ): JsonRecord | null {
    if (!payload || typeof payload !== "object") return null;
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) continue;
      if (key === "grant" || key === "proposedGrant") continue;
      safe[key] = value;
    }
    safe.kind = kind;
    safe.actorSeat = actorSeat;
    safe.requestedBy = requestingPlayerId;
    return safe;
  }

  function getTopCards(
    match: MatchState,
    seat: Seat,
    pile: string,
    count: number,
    from: string,
  ): CardSnapshot[] {
    if (!match || !match.game || !match.game.zones) return [];
    const seatZones = getZoneState(match.game.zones, seat);
    if (!seatZones) return [];
    const zoneCards = seatZones[pile];
    const list = Array.isArray(zoneCards) ? [...zoneCards] : [];
    if (count <= 0) return [];
    if (from === "bottom") {
      return list.slice(Math.max(0, list.length - count)).map(toCardSnapshot);
    }
    return list.slice(0, count).map(toCardSnapshot);
  }

  async function applyPendingAction(
    match: MatchState,
    entry: InteractionEntry,
    now: number,
  ) {
    if (!match || !entry || !entry.pendingAction) return null;
    const { pendingAction, request } = entry;
    if (!pendingAction || typeof pendingAction !== "object") return null;
    const kind = pendingAction.kind;
    const _actorSeat = pendingAction.actorSeat;
    const resultBase = {
      requestId: request?.requestId ?? "",
      matchId: match.id,
      kind,
      success: false,
      t: now,
    };
    if (kind === "takeFromPile") {
      const seat = isSeat(pendingAction.seat) ? pendingAction.seat : null;
      const pile = pendingAction.pile === "atlas" ? "atlas" : "spellbook";
      const from = pendingAction.from === "bottom" ? "bottom" : "top";
      const rawCount = Number(pendingAction.count);
      const count =
        Number.isFinite(rawCount) && rawCount > 0 ? Math.min(rawCount, 20) : 3;
      if (!seat) {
        return {
          ...resultBase,
          success: false,
          message: "Invalid seat for pile peek",
        };
      }
      const cards = getTopCards(match, seat, pile, count, from);
      return {
        ...resultBase,
        success: true,
        payload: {
          seat,
          pile,
          from,
          count,
          cards,
          requestedBy: pendingAction.requestedBy || null,
        },
      };
    }
    if (kind === "inspectHand") {
      const seat = isSeat(pendingAction.seat) ? pendingAction.seat : null;
      if (!seat) {
        return {
          ...resultBase,
          success: false,
          message: "Invalid seat for hand inspect",
        };
      }
      const cards = getTopCards(match, seat, "hand", 99, "top");
      return {
        ...resultBase,
        success: true,
        payload: {
          seat,
          pile: "hand",
          from: "top",
          count: cards.length,
          cards,
          requestedBy: pendingAction.requestedBy || null,
        },
      };
    }
    if (kind === "inspectBanished") {
      const seat = isSeat(pendingAction.seat) ? pendingAction.seat : null;
      if (!seat) {
        return {
          ...resultBase,
          success: false,
          message: "Invalid seat for banished inspect",
        };
      }
      const cards = getTopCards(match, seat, "banished", 99, "top");
      return {
        ...resultBase,
        success: true,
        payload: {
          seat,
          pile: "banished",
          from: "top",
          count: cards.length,
          cards,
          requestedBy: pendingAction.requestedBy || null,
        },
      };
    }
    if (kind === "unbanishCard") {
      const seat = isSeat(pendingAction.seat) ? pendingAction.seat : null;
      const target = pendingAction.target === "hand" ? "hand" : "graveyard";
      const instanceId =
        typeof pendingAction.instanceId === "string"
          ? pendingAction.instanceId
          : null;
      if (!seat || !instanceId) {
        return {
          ...resultBase,
          success: false,
          message: "Invalid unbanish parameters",
        };
      }
      try {
        const zones = match.game?.zones || {};
        const seatZonesRaw = getZoneState(zones, seat);
        const banished = Array.isArray(seatZonesRaw?.banished)
          ? [...seatZonesRaw.banished]
          : [];
        const idx = findCardIndex(banished, instanceId);
        if (idx < 0) {
          return {
            ...resultBase,
            success: false,
            message: "Card not found in banished",
          };
        }
        const card = banished.splice(idx, 1)[0];
        const moved = { ...(card || {}) } as Record<string, unknown>;
        moved.owner = seat;
        const hand = Array.isArray(seatZonesRaw?.hand)
          ? [...seatZonesRaw.hand]
          : [];
        const graveyard = Array.isArray(seatZonesRaw?.graveyard)
          ? [...seatZonesRaw.graveyard]
          : [];
        if (target === "hand") hand.push(moved);
        else graveyard.unshift(moved);

        const patch = {
          zones: {
            [seat]: {
              banished,
              hand: target === "hand" ? hand : undefined,
              graveyard: target === "graveyard" ? graveyard : undefined,
            },
          },
        } as MatchPatch;
        match.game = deepMergeReplaceArrays(match.game || {}, patch);
        match.lastTs = now;
        const room = `match:${match.id}`;
        const enrichedPatch = await enrichPatchWithCosts(patch, prisma);
        io.to(room).emit("statePatch", { patch: enrichedPatch, t: now });
        const name = getCardName(card);
        return {
          ...resultBase,
          success: true,
          payload: {
            seat,
            target,
            requestedBy: pendingAction.requestedBy || null,
          },
          message: `Returned '${name}' from banished to ${target}.`,
        };
      } catch (_e) {
        return { ...resultBase, success: false, message: "Failed to unbanish" };
      }
    }
    if (kind === "graveyardAction") {
      const seat = isSeat(pendingAction.seat) ? pendingAction.seat : null;
      const action = pendingAction.action;
      const instanceId =
        typeof pendingAction.instanceId === "string"
          ? pendingAction.instanceId
          : null;
      if (!seat || !instanceId) {
        return {
          ...resultBase,
          success: false,
          message: "Invalid graveyard action parameters",
        };
      }
      try {
        const zones = match.game?.zones || {};
        const seatZonesRaw = getZoneState(zones, seat);
        const graveyard = Array.isArray(seatZonesRaw?.graveyard)
          ? [...seatZonesRaw.graveyard]
          : [];
        const idx = findCardIndex(graveyard, instanceId);
        if (idx < 0) {
          return {
            ...resultBase,
            success: false,
            message: "Card not found in graveyard",
          };
        }
        const card = graveyard.splice(idx, 1)[0];
        const moved = { ...(card || {}) } as Record<string, unknown>;

        // Determine target based on action
        let patch: MatchPatch;
        let message: string;
        const name = getCardName(card);

        if (action === "drawToHand") {
          // Move to requester's hand (the one who requested the action)
          // playerIds[0] = p1, playerIds[1] = p2
          const playerIds = Array.isArray(match.playerIds)
            ? match.playerIds
            : [];
          const requesterSeat =
            playerIds[0] === pendingAction.requestedBy ? "p1" : "p2";
          moved.owner = requesterSeat;
          const requesterZonesRaw = getZoneState(zones, requesterSeat);
          const hand = Array.isArray(requesterZonesRaw?.hand)
            ? [...requesterZonesRaw.hand]
            : [];
          hand.push(moved);

          patch = {
            zones: {
              [seat]: { graveyard },
              [requesterSeat]: { hand },
            },
          };
          message = `Drew '${name}' from opponent's cemetery to hand.`;
        } else if (action === "banish") {
          // Move to banished
          const banished = Array.isArray(seatZonesRaw?.banished)
            ? [...seatZonesRaw.banished]
            : [];
          banished.push(moved);
          patch = {
            zones: {
              [seat]: { graveyard, banished },
            },
          };
          message = `Banished '${name}' from cemetery.`;
        } else {
          return {
            ...resultBase,
            success: false,
            message: "Unknown graveyard action",
          };
        }

        match.game = deepMergeReplaceArrays(match.game || {}, patch);
        match.lastTs = now;
        const room = `match:${match.id}`;
        // NOTE: Do NOT use __replaceKeys here - the patch only contains partial zones
        // (just the affected seats), so using __replaceKeys would wipe the other player's zones.
        // The client's deepMergeReplaceArrays will correctly merge partial zone updates.
        const enrichedPatch = await enrichPatchWithCosts(patch, prisma);
        io.to(room).emit("statePatch", { patch: enrichedPatch, t: now });
        return {
          ...resultBase,
          success: true,
          payload: {
            seat,
            action,
            requestedBy: pendingAction.requestedBy || null,
          },
          message,
        };
      } catch (_e2) {
        return {
          ...resultBase,
          success: false,
          message: "Failed graveyard action",
        };
      }
    }
    if (kind === "restoreSnapshot") {
      const raw = pendingAction.snapshot;
      if (!raw || typeof raw !== "object") {
        return {
          ...resultBase,
          success: false,
          message: "Missing snapshot payload",
        };
      }
      const src = raw as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      if (src.players && typeof src.players === "object")
        patch.players = src.players;
      if (src.currentPlayer === 1 || src.currentPlayer === 2)
        patch.currentPlayer = src.currentPlayer as number;
      if (Number.isFinite(Number(src.turn))) patch.turn = Number(src.turn);
      if (typeof src.phase === "string") patch.phase = src.phase as string;
      if (src.board && typeof src.board === "object") patch.board = src.board;
      if (src.permanents && typeof src.permanents === "object")
        patch.permanents = src.permanents;
      if (src.avatars && typeof src.avatars === "object")
        patch.avatars = src.avatars;
      if (src.permanentPositions && typeof src.permanentPositions === "object")
        patch.permanentPositions = src.permanentPositions;
      if (src.permanentAbilities && typeof src.permanentAbilities === "object")
        patch.permanentAbilities = src.permanentAbilities;
      if (src.sitePositions && typeof src.sitePositions === "object")
        patch.sitePositions = src.sitePositions;
      if (src.playerPositions && typeof src.playerPositions === "object")
        patch.playerPositions = src.playerPositions;
      if (src.zones && typeof src.zones === "object") patch.zones = src.zones;

      // Get the snapshot timestamp - this is when the snapshot was taken
      // All actions after this timestamp should be invalidated
      const snapshotTimestamp = Number.isFinite(Number(src.__snapshotTs))
        ? Number(src.__snapshotTs)
        : null;

      const allowedKeys = new Set([
        "players",
        "currentPlayer",
        "turn",
        "phase",
        "board",
        "zones",
        "avatars",
        "permanents",
        "permanentPositions",
        "permanentAbilities",
        "sitePositions",
        "playerPositions",
      ]);
      let rk: string[] = [];
      if (Array.isArray(src.__replaceKeys)) {
        rk = (src.__replaceKeys as unknown[])
          .map((k) => (typeof k === "string" ? k : null))
          .filter((k): k is string => !!k && allowedKeys.has(k));
      }
      if (!rk || rk.length === 0) {
        rk = Object.keys(patch).filter((k) => allowedKeys.has(k));
      }
      patch.__replaceKeys = rk;
      try {
        // Truncate replay data BEFORE applying the snapshot
        // This removes all actions that happened after the snapshot point
        if (snapshotTimestamp !== null) {
          try {
            console.log(
              `[interactions] Truncating replay data after snapshot timestamp ${snapshotTimestamp} for match ${match.id}`,
            );
            // Truncate in-memory recording
            if (truncateRecordingAfter) {
              truncateRecordingAfter(match.id, snapshotTimestamp);
            }
            // Truncate persisted/buffered actions
            if (truncateActionsAfter) {
              await truncateActionsAfter(match.id, snapshotTimestamp);
            }
          } catch (truncateErr) {
            console.error(
              `[interactions] Failed to truncate replay data for match ${match.id}:`,
              truncateErr,
            );
            // Continue with snapshot restore even if truncation fails
          }
        }

        if (rk.length > 0) {
          const mergePatch: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(patch))
            if (!rk.includes(k)) mergePatch[k] = v;
          const nextGame = deepMergeReplaceArrays(match.game || {}, mergePatch);
          for (const key of rk) nextGame[key] = patch[key];
          match.game = nextGame as MatchGameState;
        } else {
          match.game = deepMergeReplaceArrays(
            match.game || {},
            patch,
          ) as MatchGameState;
        }
        match.lastTs = now;
        const room = `match:${match.id}`;
        const enrichedPatch = await enrichPatchWithCosts(patch, prisma);
        io.to(room).emit("statePatch", { patch: enrichedPatch, t: now });
        return {
          ...resultBase,
          success: true,
          payload: { requestedBy: pendingAction.requestedBy || null },
          message: "Snapshot restored",
        };
      } catch (_e) {
        return {
          ...resultBase,
          success: false,
          message: "Failed to restore snapshot",
        };
      }
    }
    if (kind === "tieGame") {
      try {
        // Block tie game in tournament matches - forced draws are not allowed
        if (match.tournamentId) {
          return {
            ...resultBase,
            success: false,
            message:
              "Tie games are not allowed in tournament matches. The game must continue until a winner is determined.",
          };
        }

        const g = match.game || {};
        const players =
          isRecord(g.players) ? g.players : {};
        const p1 = players.p1 || {};
        const p2 = players.p2 || {};
        const p1LS = typeof p1.lifeState === "string" ? p1.lifeState : null;
        const p2LS = typeof p2.lifeState === "string" ? p2.lifeState : null;
        const eligible = p1LS === "dd" && p2LS === "dd" && !(g && g.matchEnded);
        if (!eligible) {
          return {
            ...resultBase,
            success: false,
            message:
              "Tie not eligible: both players must be at Death's Door and match not ended",
          };
        }
        const patch = {
          players: {
            p1: { ...p1, life: 0, lifeState: "dead" },
            p2: { ...p2, life: 0, lifeState: "dead" },
          },
          matchEnded: true,
          winner: null,
        };
        match.game = deepMergeReplaceArrays(match.game || {}, patch);
        match.lastTs = now;
        const room = `match:${match.id}`;
        const enrichedPatch = await enrichPatchWithCosts(patch, prisma);
        io.to(room).emit("statePatch", { patch: enrichedPatch, t: now });
        try {
          finalizeMatch(match as MatchState & { status: string; matchType: string }, {
            isDraw: true,
          });
        } catch {}
        return {
          ...resultBase,
          success: true,
          payload: { requestedBy: pendingAction.requestedBy || null },
          message: "Tie declared: both players died simultaneously.",
        };
      } catch (_e) {
        return {
          ...resultBase,
          success: false,
          message: "Failed to apply tie",
        };
      }
    }
    return {
      ...resultBase,
      success: false,
      message: "Unsupported pending action kind",
    };
  }

  return {
    ensureInteractionState,
    sanitizeGrantOptions,
    purgeExpiredGrants,
    collectInteractionRequirements,
    usePermitForRequirement,
    createGrantRecord,
    recordInteractionRequest,
    recordInteractionResponse,
    emitInteraction,
    emitInteractionResult,
    applyPendingAction,
    sanitizePendingAction,
  };
}
