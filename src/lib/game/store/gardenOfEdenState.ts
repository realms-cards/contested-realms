import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  ServerPatchT,
} from "./types";
import { siteHasSilencedToken } from "./utils/resourceHelpers";

// Helper to detect Garden of Eden by name
export function isGardenOfEden(cardName: string): boolean {
  const name = (cardName || "").toLowerCase();
  return name.includes("garden of eden");
}

export type GardenOfEdenSlice = Pick<
  GameState,
  | "gardenOfEdenLocations"
  | "registerGardenOfEden"
  | "unregisterGardenOfEden"
  | "isGardenOfEdenActive"
  | "isAnyGardenOfEdenActive"
  | "cardsDrawnThisTurn"
  | "incrementCardsDrawn"
  | "resetCardsDrawn"
  | "canDrawCard"
>;

export const createGardenOfEdenSlice: StateCreator<
  GameState,
  [],
  [],
  GardenOfEdenSlice
> = (set, get) => ({
  // Track Garden of Eden locations per player: cellKey -> { instanceId, silenced }
  gardenOfEdenLocations: {},

  // Track cards drawn per player this turn
  cardsDrawnThisTurn: { p1: 0, p2: 0 },

  registerGardenOfEden: (input: {
    site: {
      at: CellKey;
      card: CardRef;
      instanceId?: string | null;
      owner: 1 | 2;
    };
    ownerSeat: PlayerKey;
  }) => {
    const { site, ownerSeat } = input;
    const current = get().gardenOfEdenLocations[ownerSeat];

    // Check if already registered at this location
    if (current?.cellKey === site.at) return;

    const newEntry = {
      cellKey: site.at,
      instanceId: site.instanceId ?? null,
      cardName: site.card.name ?? "Garden of Eden",
      silenced: false,
    };

    set({
      gardenOfEdenLocations: {
        ...get().gardenOfEdenLocations,
        [ownerSeat]: newEntry,
      },
    } as Partial<GameState> as GameState);

    // Send patch
    const patch: ServerPatchT = {
      gardenOfEdenLocations: get().gardenOfEdenLocations,
    };
    get().trySendPatch(patch);

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "gardenOfEdenRegister",
          cellKey: site.at,
          instanceId: site.instanceId,
          ownerSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${ownerSeat.toUpperCase()}] ${site.card.name ?? "Garden of Eden"} enters the realm - spell draws are now limited`,
    );
  },

  unregisterGardenOfEden: (ownerSeat: PlayerKey, cellKey: CellKey) => {
    const current = get().gardenOfEdenLocations[ownerSeat];
    if (!current || current.cellKey !== cellKey) return;

    set({
      gardenOfEdenLocations: {
        ...get().gardenOfEdenLocations,
        [ownerSeat]: undefined,
      },
    } as Partial<GameState> as GameState);

    // Send patch
    const patch: ServerPatchT = {
      gardenOfEdenLocations: get().gardenOfEdenLocations,
    };
    get().trySendPatch(patch);

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "gardenOfEdenUnregister",
          cellKey,
          ownerSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${ownerSeat.toUpperCase()}] Garden of Eden leaves - spell draw limits removed`,
    );
  },

  isGardenOfEdenActive: (seat: PlayerKey): boolean => {
    const entry = get().gardenOfEdenLocations[seat];
    if (!entry) return false;

    // Check if the site still exists on the board
    const site = get().board.sites[entry.cellKey];
    if (!site) return false; // Site no longer exists

    // Check for Silenced token on the site (silenced sites lose their ability)
    const silenced = siteHasSilencedToken(entry.cellKey, get().permanents);
    return !silenced;
  },

  // Check if ANY Garden of Eden is active on the board (affects both players)
  isAnyGardenOfEdenActive: (): boolean => {
    const locations = get().gardenOfEdenLocations;
    const boardSites = get().board.sites;
    const permanents = get().permanents;

    for (const seat of ["p1", "p2"] as PlayerKey[]) {
      const entry = locations[seat];
      if (!entry) continue;

      // Check if site still exists
      const site = boardSites[entry.cellKey];
      if (!site) continue;

      // Check if silenced
      const silenced = siteHasSilencedToken(entry.cellKey, permanents);
      if (!silenced) return true; // Found an active Garden of Eden
    }
    return false;
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

  canDrawCard: (
    seat: PlayerKey,
    count: number = 1,
  ): { allowed: boolean; remaining: number } => {
    // Garden of Eden affects BOTH players - check if ANY is active
    const isActive = get().isAnyGardenOfEdenActive();
    if (!isActive) {
      return { allowed: true, remaining: Infinity };
    }

    const drawn = get().cardsDrawnThisTurn[seat] ?? 0;
    const remaining = Math.max(0, 1 - drawn);
    const allowed = drawn + count <= 1;

    return { allowed, remaining };
  },
});
