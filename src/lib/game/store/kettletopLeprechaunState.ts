import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  ServerPatchT,
} from "./types";
import { createZonesPatchFor } from "./utils/zoneHelpers";

function newKettletopId() {
  return `kettletop_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type KettletopLeprechaunPhase = "confirming" | "complete";

export type PendingKettletopLeprechaun = {
  id: string;
  ownerSeat: PlayerKey;
  deathLocation: CellKey;
  phase: KettletopLeprechaunPhase;
  drawnCard: CardRef | null; // The site drawn from atlas
  createdAt: number;
};

export type KettletopLeprechaunSlice = Pick<
  GameState,
  | "pendingKettletopLeprechaun"
  | "triggerKettletopDeathrite"
  | "resolveKettletopLeprechaun"
  | "cancelKettletopLeprechaun"
>;

export const createKettletopLeprechaunSlice: StateCreator<
  GameState,
  [],
  [],
  KettletopLeprechaunSlice
> = (set, get) => ({
  pendingKettletopLeprechaun: null,

  triggerKettletopDeathrite: (input: {
    ownerSeat: PlayerKey;
    deathLocation: CellKey;
  }) => {
    const id = newKettletopId();
    const { ownerSeat, deathLocation } = input;

    const zones = get().zones;
    const atlas = zones[ownerSeat]?.atlas || [];

    if (atlas.length === 0) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Kettletop Leprechaun Deathrite: No sites in atlas to draw`,
      );
      return;
    }

    // Set confirming phase — player can decline (e.g. if silenced)
    set({
      pendingKettletopLeprechaun: {
        id,
        ownerSeat,
        deathLocation,
        phase: "confirming",
        drawnCard: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${ownerSeat.toUpperCase()}] Kettletop Leprechaun Deathrite triggered`,
    );

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "kettletopBegin",
          id,
          ownerSeat,
          deathLocation,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveKettletopLeprechaun: () => {
    const pending = get().pendingKettletopLeprechaun;
    if (!pending) return;

    const { ownerSeat, id } = pending;

    const zones = get().zones;
    const atlas = [...(zones[ownerSeat]?.atlas || [])];
    const hand = [...(zones[ownerSeat]?.hand || [])];

    if (atlas.length === 0) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Kettletop Leprechaun: No sites left in atlas`,
      );
      set({
        pendingKettletopLeprechaun: null,
      } as Partial<GameState> as GameState);
      return;
    }

    // Draw top site from atlas
    const drawnCard = atlas.shift()!;
    hand.push(drawnCard);

    // Build FULL zone object for ownerSeat
    const zonesNext = {
      ...zones,
      [ownerSeat]: {
        ...zones[ownerSeat],
        atlas,
        hand,
      },
    } as GameState["zones"];

    // Update local state
    set({
      zones: zonesNext,
      pendingKettletopLeprechaun: {
        ...pending,
        phase: "complete",
        drawnCard,
      },
    } as Partial<GameState> as GameState);

    // Send full zone patch for owner seat
    const zonePatch = createZonesPatchFor(zonesNext, ownerSeat);
    if (zonePatch) {
      get().trySendPatch(zonePatch);
    }

    get().log(
      `[${ownerSeat.toUpperCase()}] Kettletop Leprechaun draws a site from atlas`,
    );

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "kettletopResolve",
          id,
          ownerSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Clear pending after delay
    setTimeout(() => {
      set((state) => {
        if (state.pendingKettletopLeprechaun?.id === id) {
          return {
            ...state,
            pendingKettletopLeprechaun: null,
          } as GameState;
        }
        return state;
      });
    }, 1500);
  },

  cancelKettletopLeprechaun: () => {
    const pending = get().pendingKettletopLeprechaun;
    if (!pending) return;

    set({
      pendingKettletopLeprechaun: null,
    } as Partial<GameState> as GameState);

    get().log(
      `[${pending.ownerSeat.toUpperCase()}] Kettletop Leprechaun Deathrite declined`,
    );

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "kettletopCancel",
          id: pending.id,
          ownerSeat: pending.ownerSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});
