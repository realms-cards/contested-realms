import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  ServerPatchT,
} from "./types";

// Helper to detect Gard of Eden by name
export function isGardOfEden(cardName: string): boolean {
  const name = (cardName || "").toLowerCase();
  return name.includes("gard of eden");
}

export type GardOfEdenSlice = Pick<
  GameState,
  | "gardOfEdenLocations"
  | "registerGardOfEden"
  | "unregisterGardOfEden"
  | "isGardOfEdenActive"
  | "cardsDrawnThisTurn"
  | "incrementCardsDrawn"
  | "resetCardsDrawn"
  | "canDrawCard"
>;

export const createGardOfEdenSlice: StateCreator<
  GameState,
  [],
  [],
  GardOfEdenSlice
> = (set, get) => ({
  // Track Gard of Eden locations per player: cellKey -> { instanceId, silenced }
  gardOfEdenLocations: {},

  // Track cards drawn per player this turn
  cardsDrawnThisTurn: { p1: 0, p2: 0 },

  registerGardOfEden: (input: {
    site: {
      at: CellKey;
      card: CardRef;
      instanceId?: string | null;
      owner: 1 | 2;
    };
    ownerSeat: PlayerKey;
  }) => {
    const { site, ownerSeat } = input;
    const current = get().gardOfEdenLocations[ownerSeat];

    // Check if already registered at this location
    if (current?.cellKey === site.at) return;

    const newEntry = {
      cellKey: site.at,
      instanceId: site.instanceId ?? null,
      cardName: site.card.name ?? "Gard of Eden",
      silenced: false,
    };

    set({
      gardOfEdenLocations: {
        ...get().gardOfEdenLocations,
        [ownerSeat]: newEntry,
      },
    } as Partial<GameState> as GameState);

    // Send patch
    const patch: ServerPatchT = {
      gardOfEdenLocations: get().gardOfEdenLocations,
    };
    get().trySendPatch(patch);

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "gardOfEdenRegister",
          cellKey: site.at,
          instanceId: site.instanceId,
          ownerSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${ownerSeat.toUpperCase()}] ${site.card.name ?? "Gard of Eden"} enters the realm - card draws are now limited`
    );
  },

  unregisterGardOfEden: (ownerSeat: PlayerKey, cellKey: CellKey) => {
    const current = get().gardOfEdenLocations[ownerSeat];
    if (!current || current.cellKey !== cellKey) return;

    set({
      gardOfEdenLocations: {
        ...get().gardOfEdenLocations,
        [ownerSeat]: undefined,
      },
    } as Partial<GameState> as GameState);

    // Send patch
    const patch: ServerPatchT = {
      gardOfEdenLocations: get().gardOfEdenLocations,
    };
    get().trySendPatch(patch);

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "gardOfEdenUnregister",
          cellKey,
          ownerSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${ownerSeat.toUpperCase()}] Gard of Eden leaves - card draw limits removed`
    );
  },

  isGardOfEdenActive: (seat: PlayerKey): boolean => {
    const entry = get().gardOfEdenLocations[seat];
    if (!entry) return false;

    // Check if the site is silenced by looking at the board
    const site = get().board.sites[entry.cellKey];
    if (!site) return false; // Site no longer exists

    // Check for silence effect on the site
    const silenced = get().board.silencedSites?.[entry.cellKey] ?? false;
    return !silenced;
  },

  incrementCardsDrawn: (seat: PlayerKey, count: number = 1) => {
    const current = get().cardsDrawnThisTurn[seat] ?? 0;
    set({
      cardsDrawnThisTurn: {
        ...get().cardsDrawnThisTurn,
        [seat]: current + count,
      },
    } as Partial<GameState> as GameState);

    // Send patch to sync
    const patch: ServerPatchT = {
      cardsDrawnThisTurn: get().cardsDrawnThisTurn,
    };
    get().trySendPatch(patch);
  },

  resetCardsDrawn: () => {
    set({
      cardsDrawnThisTurn: { p1: 0, p2: 0 },
    } as Partial<GameState> as GameState);

    // Send patch to sync
    const patch: ServerPatchT = {
      cardsDrawnThisTurn: { p1: 0, p2: 0 },
    };
    get().trySendPatch(patch);
  },

  canDrawCard: (seat: PlayerKey, count: number = 1): { allowed: boolean; remaining: number } => {
    const isActive = get().isGardOfEdenActive(seat);
    if (!isActive) {
      return { allowed: true, remaining: Infinity };
    }

    const drawn = get().cardsDrawnThisTurn[seat] ?? 0;
    const remaining = Math.max(0, 1 - drawn);
    const allowed = drawn + count <= 1;

    return { allowed, remaining };
  },
});
