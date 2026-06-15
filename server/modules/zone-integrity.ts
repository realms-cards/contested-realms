"use strict";

// Server-authoritative zone integrity (Layers 1 & 2 of the cross-seat zone-write
// authorization design).
//
//  - Layer 1 (card conservation): the multiset of card instanceIds across all
//    zones + permanents must be preserved across a client patch, except for
//    legitimately-minted tokens. This blocks fabrication, deletion and
//    duplication of real cards — effect-agnostically.
//
//  - Layer 2 (cross-seat capability): a player may only write the OPPONENT's
//    zones via a declared `crossSeat` effect descriptor, and only the zones that
//    effect is allowed to touch.
//
// This module is pure (no IO) so it can be unit-tested in isolation. The caller
// (match-leader) decides what to do with the violations based on the
// ZONE_INTEGRITY_MODE ladder (off | warn | bot_only | all).

export type Seat = "p1" | "p2";

// ---------------------------------------------------------------------------
// Token whitelist
// ---------------------------------------------------------------------------
// Source of truth for token definitions lives client-side at
// src/lib/game/tokens.ts (TOKEN_DEFS). The server cannot import client code, so
// the slugs of every token the game actively mints during play are mirrored
// here. Keep in sync when a new token is added to TOKEN_DEFS.
export const SERVER_TOKEN_SLUGS: ReadonlySet<string> = new Set([
  "token:skeleton",
  "token:frog",
  "token:bruin",
  "token:stealth",
  "token:rubble",
  "token:flooded",
  "token:disabled",
  // Silenced reuses the Silence spell art slug rather than a token: slug.
  "alp_silence_b_s",
]);

type CardLike = {
  instanceId?: unknown;
  cardId?: unknown;
  slug?: unknown;
  type?: unknown;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * A card-like item is treated as a (legitimately mintable) token when any of:
 *  - its slug is in the server token whitelist, or starts with "token:"
 *  - its type is "Token"
 *  - its cardId is a negative number (tokens use negative sentinel ids)
 * This is intentionally permissive on the MINT side so legitimate token
 * creation is never flagged as fabrication.
 */
export function isTokenCard(item: unknown): boolean {
  const rec = asRecord(item) as CardLike | null;
  if (!rec) return false;
  const slug = typeof rec.slug === "string" ? rec.slug.toLowerCase() : "";
  if (slug && (SERVER_TOKEN_SLUGS.has(slug) || slug.startsWith("token:"))) {
    return true;
  }
  if (typeof rec.type === "string" && rec.type.toLowerCase() === "token") {
    return true;
  }
  const cardId =
    typeof rec.cardId === "number"
      ? rec.cardId
      : typeof rec.cardId === "string"
        ? Number(rec.cardId)
        : NaN;
  if (Number.isFinite(cardId) && cardId < 0) return true;
  return false;
}

function instanceIdOf(item: unknown): string | null {
  const rec = asRecord(item);
  if (!rec) return null;
  const id = rec.instanceId;
  if (typeof id === "string" && id.length > 0) return id;
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return null;
}

const ZONE_KEYS = [
  "spellbook",
  "atlas",
  "hand",
  "graveyard",
  "battlefield",
  "collection",
  "banished",
] as const;

export interface CollectedCard {
  isToken: boolean;
}

/**
 * Collect every card instanceId across both seats' zones and all permanent
 * cells of a game state. Avatars are excluded (they never move into zones).
 */
export function collectInstanceIds(
  game: unknown,
): Map<string, CollectedCard> {
  const out = new Map<string, CollectedCard>();
  const g = asRecord(game);
  if (!g) return out;

  const add = (item: unknown): void => {
    const id = instanceIdOf(item);
    if (!id) return;
    // First writer wins; duplicates are reported separately by the caller via
    // count, but here we only need presence + token-ness.
    if (!out.has(id)) out.set(id, { isToken: isTokenCard(item) });
  };

  const zones = asRecord(g.zones);
  if (zones) {
    for (const seat of ["p1", "p2"] as Seat[]) {
      const seatZones = asRecord(zones[seat]);
      if (!seatZones) continue;
      for (const zk of ZONE_KEYS) {
        const arr = seatZones[zk];
        if (Array.isArray(arr)) for (const item of arr) add(item);
      }
    }
  }

  const permanents = asRecord(g.permanents);
  if (permanents) {
    for (const cellKey of Object.keys(permanents)) {
      const arr = permanents[cellKey];
      if (Array.isArray(arr)) for (const item of arr) add(item);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Layer 2: cross-seat effect capability table
// ---------------------------------------------------------------------------
export type CrossSeatEffectId =
  | "infiltrate"
  | "betrayal"
  | "sea_raider"
  | "site_destroy"
  | "banish_graveyard"
  | "permanent_move"
  | "control_transfer";

// Which of the opponent's zones each declared effect may legitimately modify.
// Derived from the audited catalog of every __allowZoneSeats caller.
export const CROSS_SEAT_CAPABILITIES: Record<
  CrossSeatEffectId,
  ReadonlySet<string>
> = {
  infiltrate: new Set(["battlefield", "hand", "spellbook", "graveyard"]),
  betrayal: new Set(["battlefield", "hand", "spellbook", "graveyard"]),
  sea_raider: new Set(["spellbook", "graveyard"]),
  site_destroy: new Set(["graveyard", "banished", "hand"]),
  banish_graveyard: new Set(["graveyard", "banished"]),
  permanent_move: new Set([
    "graveyard",
    "banished",
    "hand",
    "spellbook",
    "battlefield",
  ]),
  control_transfer: new Set(["battlefield"]),
};

function isCrossSeatEffectId(v: unknown): v is CrossSeatEffectId {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(CROSS_SEAT_CAPABILITIES, v)
  );
}

export interface CrossSeatDescriptor {
  effect: CrossSeatEffectId | "legacy";
  seats: Seat[];
}

/**
 * Read the cross-seat authorization from a patch. Prefers the typed `crossSeat`
 * descriptor; falls back to the legacy `__allowZoneSeats` flag (reported as
 * effect "legacy" so the caller can warn/reject on un-migrated writers).
 * Returns null when the patch claims no cross-seat authorization.
 */
export function deriveCrossSeat(patch: unknown): CrossSeatDescriptor | null {
  const rec = asRecord(patch);
  if (!rec) return null;
  const cs = asRecord(rec.crossSeat);
  if (cs) {
    const seats = Array.isArray(cs.seats)
      ? (cs.seats.filter((s) => s === "p1" || s === "p2") as Seat[])
      : [];
    const effect = isCrossSeatEffectId(cs.effect) ? cs.effect : "legacy";
    return { effect, seats };
  }
  const legacy = rec.__allowZoneSeats;
  if (Array.isArray(legacy)) {
    const seats = legacy.filter((s) => s === "p1" || s === "p2") as Seat[];
    if (seats.length > 0) return { effect: "legacy", seats };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Combined validation
// ---------------------------------------------------------------------------
export interface ZoneIntegrityViolation {
  code:
    | "fabricated_card"
    | "deleted_card"
    | "unauthorized_cross_seat"
    | "cross_seat_out_of_envelope"
    | "legacy_cross_seat";
  message: string;
}

export interface ZoneIntegrityResult {
  ok: boolean;
  violations: ZoneIntegrityViolation[];
}

function seatZonesChanged(
  prevGame: unknown,
  nextGame: unknown,
  seat: Seat,
): string[] {
  const prevZones = asRecord(asRecord(prevGame)?.zones);
  const nextZones = asRecord(asRecord(nextGame)?.zones);
  const prevSeat = asRecord(prevZones?.[seat]);
  const nextSeat = asRecord(nextZones?.[seat]);
  const changed: string[] = [];
  for (const zk of ZONE_KEYS) {
    const a = prevSeat?.[zk];
    const b = nextSeat?.[zk];
    const aArr = Array.isArray(a) ? a : undefined;
    const bArr = Array.isArray(b) ? b : undefined;
    if (aArr === undefined && bArr === undefined) continue;
    // Cheap structural diff: length or per-index instanceId mismatch.
    if (!aArr || !bArr || aArr.length !== bArr.length) {
      changed.push(zk);
      continue;
    }
    for (let i = 0; i < aArr.length; i++) {
      if (instanceIdOf(aArr[i]) !== instanceIdOf(bArr[i])) {
        changed.push(zk);
        break;
      }
    }
  }
  return changed;
}

/**
 * Validate a client patch's effect on game state.
 *
 * @param prevGame  authoritative state before the patch
 * @param nextGame  state after merging the client patch (pre server-transforms)
 * @param patch     the raw client patch (carries crossSeat / __allowZoneSeats)
 * @param actorSeat the seat of the acting player (server-derived)
 */
export function validateZoneIntegrity(
  prevGame: unknown,
  nextGame: unknown,
  patch: unknown,
  actorSeat: Seat,
): ZoneIntegrityResult {
  const violations: ZoneIntegrityViolation[] = [];

  // --- Layer 1: card conservation ---------------------------------------
  const prevIds = collectInstanceIds(prevGame);
  const nextIds = collectInstanceIds(nextGame);

  for (const [id, info] of nextIds) {
    if (!prevIds.has(id) && !info.isToken) {
      violations.push({
        code: "fabricated_card",
        message: `card instance ${id} appeared from nowhere (not a token)`,
      });
    }
  }
  for (const [id, info] of prevIds) {
    if (!nextIds.has(id) && !info.isToken) {
      violations.push({
        code: "deleted_card",
        message: `card instance ${id} was deleted (not a token)`,
      });
    }
  }

  // --- Layer 2: cross-seat capability -----------------------------------
  const opponentSeat: Seat = actorSeat === "p1" ? "p2" : "p1";
  const opponentChanged = seatZonesChanged(prevGame, nextGame, opponentSeat);

  if (opponentChanged.length > 0) {
    const descriptor = deriveCrossSeat(patch);
    if (!descriptor || !descriptor.seats.includes(opponentSeat)) {
      violations.push({
        code: "unauthorized_cross_seat",
        message: `wrote opponent (${opponentSeat}) zones [${opponentChanged.join(
          ", ",
        )}] without a crossSeat authorization`,
      });
    } else if (descriptor.effect === "legacy") {
      violations.push({
        code: "legacy_cross_seat",
        message: `wrote opponent (${opponentSeat}) zones via legacy __allowZoneSeats (no crossSeat descriptor)`,
      });
    } else {
      const allowed = CROSS_SEAT_CAPABILITIES[descriptor.effect];
      const outside = opponentChanged.filter((z) => !allowed.has(z));
      if (outside.length > 0) {
        violations.push({
          code: "cross_seat_out_of_envelope",
          message: `effect '${descriptor.effect}' wrote opponent zones [${outside.join(
            ", ",
          )}] outside its envelope`,
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
