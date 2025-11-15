import type {
  GameState,
  PlayerKey,
  ServerPatchT,
  Zones,
} from "../types";
import { normalizeCardRefList, prepareCardForSeat } from "./cardHelpers";

const ZONE_PILES: Array<keyof Zones> = [
  "spellbook",
  "atlas",
  "hand",
  "graveyard",
  "battlefield",
  "banished",
];

export function createEmptyPlayerZones(): Zones {
  return {
    spellbook: [],
    atlas: [],
    hand: [],
    graveyard: [],
    battlefield: [],
    banished: [],
  };
}

export function createEmptyZonesRecord(): Record<PlayerKey, Zones> {
  return {
    p1: createEmptyPlayerZones(),
    p2: createEmptyPlayerZones(),
  };
}

export function ensurePlayerZones(
  candidate: Partial<Zones> | undefined,
  fallback?: Zones
): Zones {
  const base = fallback ?? createEmptyPlayerZones();
  const spellbook = candidate?.spellbook;
  const atlas = candidate?.atlas;
  const hand = candidate?.hand;
  const graveyard = candidate?.graveyard;
  const battlefield = candidate?.battlefield;
  const banished = candidate?.banished;
  return {
    spellbook: normalizeCardRefList(spellbook, base.spellbook),
    atlas: normalizeCardRefList(atlas, base.atlas),
    hand: normalizeCardRefList(hand, base.hand),
    graveyard: normalizeCardRefList(graveyard, base.graveyard),
    battlefield: normalizeCardRefList(battlefield, base.battlefield),
    banished: normalizeCardRefList(banished, base.banished),
  };
}

export function normalizeZones(
  zones: Partial<Record<PlayerKey, Partial<Zones>>> | undefined,
  prev?: Record<PlayerKey, Zones>
): Record<PlayerKey, Zones> {
  const base = prev ?? createEmptyZonesRecord();
  return {
    p1: ensurePlayerZones(zones?.p1, base.p1),
    p2: ensurePlayerZones(zones?.p2, base.p2),
  };
}

export function cloneSeatZones(
  z: Zones | undefined,
  seat: keyof GameState["zones"]
): Zones | null {
  if (!z) return null;
  const cloneList = (list: Zones[keyof Zones]): Zones[keyof Zones] =>
    list.map((card) => prepareCardForSeat(card, seat));
  return {
    spellbook: cloneList(z.spellbook),
    atlas: cloneList(z.atlas),
    hand: cloneList(z.hand),
    graveyard: cloneList(z.graveyard),
    battlefield: cloneList(z.battlefield),
    banished: cloneList(z.banished),
  };
}

export function removeCardInstanceFromSeat(
  zones: Zones,
  instanceId: string
): { zones: Zones; changed: boolean } {
  let changed = false;
  const next: Zones = { ...zones };
  for (const key of ZONE_PILES) {
    const pile = zones[key] ?? [];
    const filtered = pile.filter((card) => card?.instanceId !== instanceId);
    if (filtered.length !== pile.length) {
      next[key] = filtered;
      changed = true;
    }
  }
  return { zones: changed ? next : zones, changed };
}

export function removeCardInstanceFromAllZones(
  zones: GameState["zones"],
  instanceId: string
): { zones: GameState["zones"]; seats: PlayerKey[] } | null {
  if (!zones) return null;
  const result: GameState["zones"] = { ...zones };
  const changedSeats: PlayerKey[] = [];
  for (const seat of ["p1", "p2"] as PlayerKey[]) {
    const seatZones = zones[seat];
    if (!seatZones) continue;
    const { zones: updated, changed } = removeCardInstanceFromSeat(
      seatZones,
      instanceId
    );
    if (changed) {
      result[seat] = updated;
      changedSeats.push(seat);
    }
  }
  return changedSeats.length > 0 ? { zones: result, seats: changedSeats } : null;
}

export function createZonesPatchFor(
  zones: GameState["zones"],
  seats: keyof GameState["zones"] | Array<keyof GameState["zones"]>
): ServerPatchT | null {
  if (!zones) return null;
  const seatList = Array.isArray(seats) ? seats : [seats];
  const payload: Partial<GameState["zones"]> = {};
  for (const seat of seatList) {
    const seatZones = cloneSeatZones(zones[seat], seat);
    if (!seatZones) continue;
    payload[seat] = seatZones;
  }
  return Object.keys(payload).length > 0
    ? ({ zones: payload as GameState["zones"] } as ServerPatchT)
    : null;
}
