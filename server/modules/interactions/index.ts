/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This module handles dynamic game state and interaction payloads with varying structures.
// Using 'any' types here is intentional to maintain runtime flexibility while the type system
// is being gradually improved. Future work should introduce proper discriminated unions and
// type guards to replace 'any' with 'unknown' + type narrowing.

import {
  getSeatForPlayer,
  getPlayerIdForSeat,
  getOpponentSeat,
  inferLoserId,
} from "../match-utils";

export const INTERACTION_VERSION = 1;

export const INTERACTION_ENFORCEMENT_ENABLED = (() => {
  const raw = process.env.INTERACTION_ENFORCEMENT_ENABLED;
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") {
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
]);

export const INTERACTION_DECISIONS = new Set(["approved", "declined", "cancelled"]);

interface InteractionModuleDeps {
  io: import("socket.io").Server;
  rid: (prefix: string) => string;
  enrichPatchWithCosts: (patch: any, prismaClient: any) => Promise<any>;
  deepMergeReplaceArrays: (base: any, patch: any) => any;
  finalizeMatch: (match: any, options?: any) => Promise<void> | void;
  persistMatchUpdate: (match: any, patch: any, playerId: string, ts: number) => Promise<void>;
  prisma: any;
}

type JsonRecord = Record<string, unknown>;
type MatchPatch = Record<string, unknown>;

export function createInteractionModule({
  io,
  rid,
  enrichPatchWithCosts,
  deepMergeReplaceArrays,
  finalizeMatch,
  persistMatchUpdate,
  prisma,
}: InteractionModuleDeps) {
function ensureInteractionState(match: any): void {
    if (!match) return;
    if (!(match.interactionRequests instanceof Map)) {
      match.interactionRequests = new Map();
    }
    if (!(match.interactionGrants instanceof Map)) {
      match.interactionGrants = new Map();
    }
  }

  function sanitizeGrantOptions(raw: any, fallbackSeat: any): any {
    if (!raw || typeof raw !== "object") {
      if (!fallbackSeat) return null;
      return {
        targetSeat: fallbackSeat,
      };
    }
    const json = raw as JsonRecord;
    const targetSeat =
      json.targetSeat === "p1" || json.targetSeat === "p2" ? json.targetSeat : fallbackSeat || null;
    const expiresAt = Number.isFinite(Number(json.expiresAt)) ? Number(json.expiresAt) : null;
    const result: Record<string, unknown> = {
      targetSeat,
    };
    if (expiresAt !== null) result.expiresAt = expiresAt;
    if (json.singleUse === true) result.singleUse = true;
    if (json.allowOpponentZoneWrite === true) result.allowOpponentZoneWrite = true;
    if (json.allowRevealOpponentHand === true) result.allowRevealOpponentHand = true;
    return result as JsonRecord;
  }

  function purgeExpiredGrants(match: any, now: number) {
    ensureInteractionState(match);
    if (!match || !(match.interactionGrants instanceof Map)) return;
    for (const [playerId, grants] of match.interactionGrants.entries()) {
      const filtered = Array.isArray(grants)
        ? grants.filter((grant) => !grant || !grant.expiresAt || grant.expiresAt > now)
        : [];
      if (filtered.length > 0) {
        match.interactionGrants.set(playerId, filtered);
      } else {
        match.interactionGrants.delete(playerId);
      }
    }
  }

  function detectOpponentZoneMutation(patch: any, actorSeat: any): boolean {
    if (!patch || typeof patch !== "object") return false;
    const opponentSeat = getOpponentSeat(actorSeat);
    if (!opponentSeat) return false;
    const zones = patch.zones;
    if (zones && typeof zones === "object" && zones[opponentSeat] && typeof zones[opponentSeat] === "object") {
      const zonePayload = zones[opponentSeat];
      for (const key of Object.keys(zonePayload)) {
        if (zonePayload[key] !== undefined) {
          return true;
        }
      }
    }
    const avatars = patch.avatars;
    if (
      avatars &&
      typeof avatars === "object" &&
      avatars[opponentSeat] &&
      typeof avatars[opponentSeat] === "object"
    ) {
      if (Object.keys(avatars[opponentSeat]).length > 0) {
        return true;
      }
    }
    return false;
  }

  function collectInteractionRequirements(patch: any, actorSeat: any): any {
    return {
      needsOpponentZoneWrite: detectOpponentZoneMutation(patch, actorSeat),
    };
  }

  function usePermitForRequirement(match: any, playerId: string, actorSeat: any, requirement: string, now: number) {
    ensureInteractionState(match);
    const grants = match.interactionGrants.get(playerId);
    if (!Array.isArray(grants) || grants.length === 0) return null;
    const opponentSeat = getOpponentSeat(actorSeat);
    let consumedIndex = -1;
    const usableGrant = grants.find((grant, idx) => {
      if (!grant) return false;
      if (grant.expiresAt && grant.expiresAt <= now) return false;
      if (grant.targetSeat && grant.targetSeat !== opponentSeat) return false;
      if (requirement === "allowOpponentZoneWrite" && grant.allowOpponentZoneWrite !== true) return false;
      consumedIndex = idx;
      return true;
    });
    if (!usableGrant) return null;
    if (usableGrant.singleUse === true && consumedIndex > -1) {
      grants.splice(consumedIndex, 1);
      if (grants.length > 0) {
        match.interactionGrants.set(playerId, grants);
      } else {
        match.interactionGrants.delete(playerId);
      }
    }
    usableGrant.lastUsed = now;
    return usableGrant;
  }

  function createGrantRecord(request: any, response: any, grantOpts: any, now: number) {
    return {
      __grantId: rid("igr"),
      requestId: request.requestId,
      kind: request.kind,
      grantedBy: response.from,
      grantedTo: response.to,
      targetSeat: grantOpts?.targetSeat ?? null,
      createdAt: now,
      expiresAt: grantOpts?.expiresAt ?? null,
      singleUse: grantOpts?.singleUse === true,
      allowOpponentZoneWrite: grantOpts?.allowOpponentZoneWrite === true,
      allowRevealOpponentHand: grantOpts?.allowRevealOpponentHand === true,
    };
  }

  function recordInteractionRequest(match: any, message: any, proposedGrant: any, pendingAction: any) {
    ensureInteractionState(match);
    const entry = match.interactionRequests.get(message.requestId) || {};
    const now = message.createdAt || Date.now();
    match.interactionRequests.set(message.requestId, {
      request: message,
      response: entry.response || null,
      status: "pending",
      proposedGrant: proposedGrant || entry.proposedGrant || null,
      grant: entry.grant || null,
      pendingAction: pendingAction || entry.pendingAction || null,
      result: entry.result || null,
      createdAt: entry.createdAt || now,
      updatedAt: now,
    });
  }

  function recordInteractionResponse(match: any, response: any, grantRecord: any) {
    ensureInteractionState(match);
    const entry = match.interactionRequests.get(response.requestId) || {};
    const now = response.respondedAt || Date.now();
    const next = {
      request: entry.request || null,
      response,
      status: response.decision,
      proposedGrant: entry.proposedGrant || null,
      grant: grantRecord || entry.grant || null,
      pendingAction: entry.pendingAction || null,
      result: entry.result || null,
      createdAt: entry.createdAt || (entry.request && entry.request.createdAt) || now,
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
    match.interactionRequests.set(response.requestId, next);
  }

  function emitInteraction(matchId: string, message: any) {
    const envelope = { type: "interaction", version: INTERACTION_VERSION, message };
    const room = `match:${matchId}`;
    io.to(room).emit("interaction", envelope);
    io.to(room).emit(message.type, message);
  }

  function emitInteractionResult(matchId: string, result: any) {
    const room = `match:${matchId}`;
    io.to(room).emit("interaction:result", result);
  }

  function sanitizePendingAction(kind: string, payload: any, actorSeat: any, requestingPlayerId: string) {
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

  function getTopCards(match: any, seat: string, pile: string, count: number, from: string) {
    if (!match || !match.game || !match.game.zones) return [];
    const zones = match.game.zones;
    const seatZones = zones && typeof zones === "object" ? zones[seat] : null;
    if (!seatZones || typeof seatZones !== "object") return [];
    const list = Array.isArray(seatZones[pile]) ? [...seatZones[pile]] : [];
    if (count <= 0) return [];
    if (from === "bottom") {
      return list.slice(Math.max(0, list.length - count));
    }
    return list.slice(0, count);
  }

  async function applyPendingAction(match: any, entry: any, now: number) {
    if (!match || !entry || !entry.pendingAction) return null;
    const { pendingAction, request } = entry;
    if (!pendingAction || typeof pendingAction !== "object") return null;
    const kind = pendingAction.kind;
    const actorSeat = pendingAction.actorSeat;
    const resultBase = {
      requestId: request.requestId,
      matchId: match.id,
      kind,
      success: false,
      t: now,
    };
    if (kind === "takeFromPile") {
      const seat = pendingAction.seat === "p1" || pendingAction.seat === "p2" ? pendingAction.seat : null;
      const pile = pendingAction.pile === "atlas" ? "atlas" : "spellbook";
      const from = pendingAction.from === "bottom" ? "bottom" : "top";
      const rawCount = Number(pendingAction.count);
      const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.min(rawCount, 20) : 3;
      if (!seat) {
        return { ...resultBase, success: false, message: "Invalid seat for pile peek" };
      }
      const cards = getTopCards(match, seat, pile, count, from).map((card) => {
        if (!card || typeof card !== "object") return {};
        const out: Record<string, unknown> = {};
        if ((card as any).name) out.name = (card as any).name;
        if ((card as any).type) out.type = (card as any).type;
        if ((card as any).slug) out.slug = (card as any).slug;
        if (Number.isFinite((card as any).cardId)) out.cardId = Number((card as any).cardId);
        if (Number.isFinite((card as any).variantId)) out.variantId = Number((card as any).variantId);
        return out;
      });
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
      const seat = pendingAction.seat === "p1" || pendingAction.seat === "p2" ? pendingAction.seat : null;
      if (!seat) {
        return { ...resultBase, success: false, message: "Invalid seat for hand inspect" };
      }
      const cards = getTopCards(match, seat, "hand", 99, "top").map((card) => {
        if (!card || typeof card !== "object") return {};
        const out: Record<string, unknown> = {};
        if ((card as any).name) out.name = (card as any).name;
        if ((card as any).type) out.type = (card as any).type;
        if ((card as any).slug) out.slug = (card as any).slug;
        if (Number.isFinite((card as any).cardId)) out.cardId = Number((card as any).cardId);
        if (Number.isFinite((card as any).variantId)) out.variantId = Number((card as any).variantId);
        return out;
      });
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
    if (kind === "tieGame") {
      try {
        const g = match.game || {};
        const players = g.players && typeof g.players === "object" ? g.players : {};
        const p1 = players.p1 || {};
        const p2 = players.p2 || {};
        const p1LS = typeof p1.lifeState === "string" ? p1.lifeState : null;
        const p2LS = typeof p2.lifeState === "string" ? p2.lifeState : null;
        const eligible = p1LS === "dd" && p2LS === "dd" && !(g && g.matchEnded);
        if (!eligible) {
          return {
            ...resultBase,
            success: false,
            message: "Tie not eligible: both players must be at Death's Door and match not ended",
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
          finalizeMatch(match, { isDraw: true });
        } catch {}
        return {
          ...resultBase,
          success: true,
          payload: { requestedBy: pendingAction.requestedBy || null },
          message: "Tie declared: both players died simultaneously.",
        };
      } catch (e) {
        return { ...resultBase, success: false, message: "Failed to apply tie" };
      }
    }
    return { ...resultBase, success: false, message: "Unsupported pending action kind" };
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
