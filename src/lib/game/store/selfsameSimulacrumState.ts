import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { CardRef, CellKey, GameState, PlayerKey } from "./types";
import { bumpPermanentVersion } from "./utils/permanentHelpers";

function newSelfsameSimulacrumId() {
  return `selfsame_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type SelfsameSimulacrumPhase = "selecting" | "complete";

export type PendingSelfsameSimulacrum = {
  id: string;
  /** The Selfsame Simulacrum permanent on the board */
  minion: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  ownerSeat: PlayerKey;
  phase: SelfsameSimulacrumPhase;
  /** Minions on adjacent cells (either player) */
  nearbyMinions: Array<{
    card: CardRef;
    at: CellKey;
    index: number;
    owner: 1 | 2;
  }>;
  selectedIndex: number | null;
  createdAt: number;
};

export type SelfsameSimulacrumSlice = Pick<
  GameState,
  | "pendingSelfsameSimulacrum"
  | "beginSelfsameSimulacrum"
  | "selectSelfsameSimulacrumTarget"
  | "resolveSelfsameSimulacrum"
  | "cancelSelfsameSimulacrum"
>;

export const createSelfsameSimulacrumSlice: StateCreator<
  GameState,
  [],
  [],
  SelfsameSimulacrumSlice
> = (set, get) => ({
  pendingSelfsameSimulacrum: null,

  beginSelfsameSimulacrum: (input) => {
    const { minion, ownerSeat, nearbyMinions } = input;

    if (nearbyMinions.length === 0) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Selfsame Simulacrum: no nearby minions to copy`,
      );
      return;
    }

    const id = newSelfsameSimulacrumId();

    set({
      pendingSelfsameSimulacrum: {
        id,
        minion,
        ownerSeat,
        phase: "selecting",
        nearbyMinions,
        selectedIndex: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${ownerSeat.toUpperCase()}] Selfsame Simulacrum: choose a nearby minion to copy`,
    );

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "selfsameSimulacrumBegin",
          id,
          minion,
          ownerSeat,
          nearbyCount: nearbyMinions.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  selectSelfsameSimulacrumTarget: (index: number) => {
    const pending = get().pendingSelfsameSimulacrum;
    if (!pending || pending.phase !== "selecting") return;
    if (index < 0 || index >= pending.nearbyMinions.length) return;

    set({
      pendingSelfsameSimulacrum: { ...pending, selectedIndex: index },
    } as Partial<GameState> as GameState);

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "selfsameSimulacrumSelect",
          id: pending.id,
          index,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveSelfsameSimulacrum: () => {
    const pending = get().pendingSelfsameSimulacrum;
    if (!pending || pending.phase !== "selecting") return;
    if (pending.selectedIndex === null) return;

    const { minion, ownerSeat, nearbyMinions, id } = pending;
    const chosen = nearbyMinions[pending.selectedIndex];
    const chosenCard = chosen.card;

    // Find the Simulacrum permanent
    const permanents = { ...get().permanents };
    const cellPerms = [...(permanents[minion.at] || [])];

    const simIndex = cellPerms.findIndex(
      (p) =>
        (p.instanceId && p.instanceId === minion.instanceId) ||
        (p.card?.instanceId && p.card.instanceId === minion.instanceId),
    );

    if (simIndex === -1) {
      get().log("Selfsame Simulacrum: could not find permanent on board");
      set({
        pendingSelfsameSimulacrum: null,
      } as Partial<GameState> as GameState);
      return;
    }

    const simPerm = cellPerms[simIndex];

    // Transform into a basic copy: same card data, no abilities text
    cellPerms[simIndex] = bumpPermanentVersion({
      ...simPerm,
      card: {
        ...chosenCard,
        instanceId: simPerm.card.instanceId,
        owner: simPerm.card.owner,
        text: null, // "basic" = no keyword abilities
      },
    });

    permanents[minion.at] = cellPerms;

    set({
      permanents,
      pendingSelfsameSimulacrum: {
        ...pending,
        phase: "complete",
      },
    } as Partial<GameState> as GameState);

    get().trySendPatch({
      permanents: { [minion.at]: permanents[minion.at] },
    });

    const playerNum = ownerSeat === "p1" ? "1" : "2";
    get().log(
      `[p${playerNum}:PLAYER] Selfsame Simulacrum becomes a basic copy of ${chosenCard.name}`,
    );

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "selfsameSimulacrumResolve",
          id,
          ownerSeat,
          minionAt: minion.at,
          minionInstanceId: minion.instanceId,
          chosenCard,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}

      try {
        transport.sendMessage({
          type: "toast",
          text: `[p${playerNum}:PLAYER] Selfsame Simulacrum becomes ${chosenCard.name}!`,
          seat: ownerSeat,
        } as never);
      } catch {}
    }

    setTimeout(() => {
      set((s) => {
        if (s.pendingSelfsameSimulacrum?.id === id) {
          return { ...s, pendingSelfsameSimulacrum: null } as GameState;
        }
        return s;
      });
    }, 500);
  },

  cancelSelfsameSimulacrum: () => {
    const pending = get().pendingSelfsameSimulacrum;
    if (!pending) return;

    const { ownerSeat, id } = pending;

    set({
      pendingSelfsameSimulacrum: null,
    } as Partial<GameState> as GameState);

    get().log(
      `[${ownerSeat.toUpperCase()}] Selfsame Simulacrum: keeping original form`,
    );

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "selfsameSimulacrumCancel",
          id,
          ownerSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});
