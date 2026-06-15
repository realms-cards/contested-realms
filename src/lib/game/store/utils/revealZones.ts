import type { CustomMessage } from "@/lib/net/transport";
import type { CardRef, GameState, PlayerKey, Zones } from "../types";

// Hidden zones that the server projects to face-down placeholders and that an
// effect may need revealed authoritatively.
export type HiddenZoneName = "hand" | "spellbook" | "atlas";

type RevealedZones = Partial<Record<HiddenZoneName, CardRef[]>>;

// The server redacts hidden cards to this sentinel shape
// ({ cardId: 0, faceDown: true, name: "" }). cardId 0 is never a real card.
export function isHiddenPlaceholder(card: CardRef | undefined | null): boolean {
  if (!card) return false;
  if (card.cardId === 0) return true;
  const faceDown = (card as { faceDown?: unknown }).faceDown;
  return faceDown === true;
}

export function hasHiddenPlaceholders(cards: readonly CardRef[]): boolean {
  return cards.some((c) => isHiddenPlaceholder(c));
}

// --- Pending reveal round-trips, keyed by requestId ---
interface TransportLike {
  sendMessage?: (msg: CustomMessage) => Promise<void> | void;
}

const pendingReveals = new Map<
  string,
  { resolve: (zones: RevealedZones) => void; timer: ReturnType<typeof setTimeout> }
>();
let revealSeq = 0;

const REVEAL_TIMEOUT_MS = 5000;

/**
 * Ask the server for the authoritative contents of an opponent's hidden zones.
 * Resolves when the matching `revealZonesResult` arrives, or rejects on timeout.
 */
export function requestZoneReveal(
  transport: TransportLike,
  targetSeat: PlayerKey,
  zoneNames: HiddenZoneName[],
): Promise<RevealedZones> {
  return new Promise<RevealedZones>((resolve, reject) => {
    const requestId = `reveal-${++revealSeq}-${Math.floor(performance.now())}`;
    const timer = setTimeout(() => {
      pendingReveals.delete(requestId);
      reject(new Error("reveal timeout"));
    }, REVEAL_TIMEOUT_MS);
    pendingReveals.set(requestId, { resolve, timer });
    try {
      transport.sendMessage?.({
        type: "revealZones",
        requestId,
        targetSeat,
        zones: zoneNames,
      } as unknown as CustomMessage);
    } catch (err) {
      clearTimeout(timer);
      pendingReveals.delete(requestId);
      reject(err instanceof Error ? err : new Error("reveal send failed"));
    }
  });
}

/**
 * Resolve a pending reveal from an inbound `revealZonesResult` message.
 * Returns true if the message matched a pending request.
 */
export function resolveZoneReveal(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const m = message as { requestId?: unknown; zones?: unknown };
  if (typeof m.requestId !== "string") return false;
  const entry = pendingReveals.get(m.requestId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  pendingReveals.delete(m.requestId);
  entry.resolve((m.zones ?? {}) as RevealedZones);
  return true;
}

interface RevealStoreLike {
  zones: GameState["zones"];
  actorKey: PlayerKey | null;
  transport: TransportLike | null;
}

/**
 * Drop-in replacement for reading an opponent's hidden zones in an effect.
 *
 * - Hotseat (no transport / actorKey null) or own seat: returns local data.
 * - Online and the local copy is real (projection off): returns local data.
 * - Online and the local copy is face-down placeholders (projection on):
 *   fetches the authoritative cards from the server and returns those.
 *
 * Falls back to local data if the reveal times out, so the effect degrades
 * rather than crashing.
 */
export async function getAuthoritativeZones(
  get: () => RevealStoreLike,
  seat: PlayerKey,
  zoneNames: HiddenZoneName[],
): Promise<Partial<Record<HiddenZoneName, CardRef[]>>> {
  const state = get();
  const seatZones = state.zones?.[seat] as Zones | undefined;
  const local: Partial<Record<HiddenZoneName, CardRef[]>> = {};
  for (const zn of zoneNames) local[zn] = [...(seatZones?.[zn] ?? [])];

  const transport = state.transport;
  const isOnline = !!transport?.sendMessage;
  const isOpponentSeat = state.actorKey !== null && seat !== state.actorKey;
  const needsReveal =
    isOnline &&
    isOpponentSeat &&
    zoneNames.some((zn) => hasHiddenPlaceholders(local[zn] ?? []));

  if (!needsReveal || !transport) return local;

  try {
    const revealed = await requestZoneReveal(transport, seat, zoneNames);
    for (const zn of zoneNames) {
      const arr = revealed[zn];
      if (Array.isArray(arr)) local[zn] = arr;
    }
  } catch {
    // timeout / send failure — return local placeholders; effect degrades safely
  }
  return local;
}
