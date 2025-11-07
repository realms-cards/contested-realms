import type { PlayerKey } from "../types";
import type { PlayerPositionReference } from "../../types";

export function createDefaultPlayerPosition(
  who: PlayerKey
): PlayerPositionReference {
  return {
    playerId: who === "p1" ? 1 : 2,
    position: { x: 0, z: 0 },
  };
}

export function createDefaultPlayerPositions(): Record<
  PlayerKey,
  PlayerPositionReference
> {
  return {
    p1: createDefaultPlayerPosition("p1"),
    p2: createDefaultPlayerPosition("p2"),
  };
}

export function ensurePlayerPosition(
  who: PlayerKey,
  candidate: Partial<PlayerPositionReference> | undefined,
  fallback: PlayerPositionReference | undefined
): PlayerPositionReference {
  const base = fallback
    ? { ...fallback }
    : createDefaultPlayerPosition(who);
  const coord =
    candidate && typeof candidate.position === "object"
      ? candidate.position
      : undefined;
  return {
    playerId:
      candidate && typeof candidate.playerId === "number"
        ? candidate.playerId
        : base.playerId,
    position: {
      x: coord && typeof coord.x === "number" ? coord.x : base.position.x,
      z: coord && typeof coord.z === "number" ? coord.z : base.position.z,
    },
  };
}

export function normalizePlayerPositions(
  positions:
    | Partial<Record<PlayerKey, Partial<PlayerPositionReference>>>
    | undefined,
  prev?: Record<PlayerKey, PlayerPositionReference>
): Record<PlayerKey, PlayerPositionReference> {
  const base = prev ?? createDefaultPlayerPositions();
  return {
    p1: ensurePlayerPosition("p1", positions?.p1, base.p1),
    p2: ensurePlayerPosition("p2", positions?.p2, base.p2),
  };
}
