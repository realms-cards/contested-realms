import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { CardRef, CellKey, GameState, PlayerKey } from "./types";

function newLegionOfGallId() {
  return `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export type LegionOfGallPhase =
  | "confirming" // User confirms whether to auto-resolve
  | "viewing" // Viewing opponent's collection
  | "selecting" // Selecting cards to banish
  | "resolving" // Processing the banishment
  | "complete";

export type PendingLegionOfGall = {
  id: string;
  casterSeat: PlayerKey;
  targetSeat: PlayerKey;
  spell: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  phase: LegionOfGallPhase;
  selectedIndices: number[];
  createdAt: number;
};

export type LegionOfGallSlice = Pick<
  GameState,
  | "pendingLegionOfGall"
  | "beginLegionOfGall"
  | "confirmLegionOfGall"
  | "selectLegionOfGallCard"
  | "resolveLegionOfGall"
  | "cancelLegionOfGall"
>;

export const createLegionOfGallSlice: StateCreator<
  GameState,
  [],
  [],
  LegionOfGallSlice
> = (set, get) => ({
  pendingLegionOfGall: null,

  beginLegionOfGall: (input) => {
    const id = newLegionOfGallId();
    const casterSeat = input.casterSeat;
    const targetSeat = casterSeat === "p1" ? "p2" : "p1";

    // Start in confirming phase - user must confirm before proceeding
    set({
      pendingLegionOfGall: {
        id,
        casterSeat,
        targetSeat,
        spell: input.spell,
        phase: "confirming",
        selectedIndices: [],
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${casterSeat.toUpperCase()}] casts Legion of Gall - awaiting confirmation`,
    );

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "legionOfGallBegin",
          id,
          casterSeat,
          targetSeat,
          spell: input.spell,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  confirmLegionOfGall: () => {
    const pending = get().pendingLegionOfGall;
    if (!pending || pending.phase !== "confirming") return;

    const { casterSeat, targetSeat, id } = pending;

    // Transition to viewing phase
    set({
      pendingLegionOfGall: {
        ...pending,
        phase: "viewing",
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${casterSeat.toUpperCase()}] Legion of Gall: inspecting ${targetSeat.toUpperCase()}'s collection...`,
    );

    // Broadcast confirmation to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "legionOfGallConfirm",
          id,
          casterSeat,
          targetSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  selectLegionOfGallCard: (index: number) => {
    const pending = get().pendingLegionOfGall;
    if (!pending) return;

    const selectedIndices = [...pending.selectedIndices];
    const existingIndex = selectedIndices.indexOf(index);

    if (existingIndex >= 0) {
      selectedIndices.splice(existingIndex, 1);
    } else {
      if (selectedIndices.length >= 3) {
        selectedIndices.shift();
      }
      selectedIndices.push(index);
    }

    set({
      pendingLegionOfGall: {
        ...pending,
        selectedIndices,
        phase: "selecting",
      },
    } as Partial<GameState> as GameState);

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "legionOfGallSelect",
          id: pending.id,
          selectedIndices,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveLegionOfGall: () => {
    const pending = get().pendingLegionOfGall;
    if (!pending || pending.selectedIndices.length === 0) return;

    const state = get();
    const { targetSeat, selectedIndices, casterSeat } = pending;
    const collection = state.zones[targetSeat].collection;

    // Get the cards to banish (sorted descending for proper removal)
    const sortedIndices = [...selectedIndices].sort((a, b) => b - a);
    const cardsToBanish = sortedIndices
      .map((idx) => collection[idx])
      .filter(Boolean);

    // Update local state (caster's view)
    const zonesNext = { ...state.zones };
    const collectionNext = [...collection];

    sortedIndices.forEach((idx) => {
      if (idx >= 0 && idx < collectionNext.length) {
        collectionNext.splice(idx, 1);
      }
    });

    const banishedNext = [
      ...state.zones[targetSeat].banished,
      ...cardsToBanish,
    ];

    zonesNext[targetSeat] = {
      ...state.zones[targetSeat],
      collection: collectionNext,
      banished: banishedNext,
    };

    set({ zones: zonesNext } as Partial<GameState> as GameState);

    const cardNames = cardsToBanish.map((c) => c.name || "Unknown").join(", ");
    get().log(
      `[${casterSeat.toUpperCase()}] Legion of Gall: banished ${cardsToBanish.length} cards from ${targetSeat.toUpperCase()}'s collection: ${cardNames}`,
    );

    // NOTE: Do NOT send zone patches for opponent's seat - the server will block it.
    // Instead, the opponent updates their own zones when they receive the custom message.

    set({ pendingLegionOfGall: null } as Partial<GameState> as GameState);

    // Broadcast resolution with FULL card data so opponent can update their own zones
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "legionOfGallResolve",
          id: pending.id,
          casterSeat,
          targetSeat,
          selectedIndices: sortedIndices,
          // Include full card data so opponent can add to their banished zone
          cardsToBanish,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  cancelLegionOfGall: () => {
    const pending = get().pendingLegionOfGall;
    if (!pending) return;

    get().movePermanentToZone(
      pending.spell.at,
      pending.spell.index,
      "graveyard",
    );

    set({ pendingLegionOfGall: null } as Partial<GameState> as GameState);

    get().log(`[${pending.casterSeat.toUpperCase()}] Legion of Gall cancelled`);
  },
});
