import type { AvatarState, GameState, PlayerKey } from "../types";

export function createEmptyAvatarState(): AvatarState {
  return {
    card: null,
    pos: null,
    tapped: false,
    offset: null,
  };
}

export function createDefaultAvatars(): Record<PlayerKey, AvatarState> {
  return {
    p1: createEmptyAvatarState(),
    p2: createEmptyAvatarState(),
  };
}

export function ensureAvatarState(
  candidate: Partial<AvatarState> | undefined,
  fallback: AvatarState | undefined
): AvatarState {
  const base = fallback ? { ...fallback } : createEmptyAvatarState();
  const next: AvatarState = {
    card:
      candidate && "card" in candidate ? candidate.card ?? null : base.card,
    pos:
      candidate && Array.isArray(candidate.pos)
        ? (candidate.pos as [number, number])
        : base.pos ?? null,
    tapped:
      candidate && typeof candidate.tapped === "boolean"
        ? candidate.tapped
        : base.tapped ?? false,
  };
  if (candidate && "offset" in candidate) {
    next.offset = candidate.offset ?? null;
  } else if (base.offset !== undefined) {
    next.offset = base.offset;
  } else {
    delete next.offset;
  }
  // Normalize counters if present
  if (candidate && Object.prototype.hasOwnProperty.call(candidate, "counters")) {
    next.counters = (candidate as { counters?: number | null }).counters ?? null;
  } else if ((base as { counters?: number | null }).counters !== undefined) {
    next.counters = (base as { counters?: number | null }).counters ?? null;
  } else {
    delete (next as { counters?: number | null }).counters;
  }
  return next;
}

export function normalizeAvatars(
  avatars: Partial<Record<PlayerKey, Partial<AvatarState>>> | undefined,
  prev?: Record<PlayerKey, AvatarState>
): Record<PlayerKey, AvatarState> {
  const base = prev ?? createDefaultAvatars();
  return {
    p1: ensureAvatarState(avatars?.p1, base.p1),
    p2: ensureAvatarState(avatars?.p2, base.p2),
  };
}

export function buildAvatarUpdate(
  s: GameState,
  who: PlayerKey,
  pos: [number, number],
  offset: [number, number] | null
): Record<PlayerKey, AvatarState> {
  const next = { ...s.avatars[who], pos, offset } as AvatarState;
  return { ...s.avatars, [who]: next } as Record<PlayerKey, AvatarState>;
}
