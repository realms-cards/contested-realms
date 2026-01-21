import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  ServerPatchT,
} from "./types";
import { getHaystackLimit } from "./utils/boardHelpers";

function newHighlandPrincessId() {
  return `highland_princess_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type HighlandPrincessPhase = "loading" | "selecting" | "complete";

export type PendingHighlandPrincess = {
  id: string;
  minion: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  ownerSeat: PlayerKey;
  phase: HighlandPrincessPhase;
  eligibleCards: CardRef[];
  selectedCard: CardRef | null;
  createdAt: number;
};

export type HighlandPrincessSlice = Pick<
  GameState,
  | "pendingHighlandPrincess"
  | "triggerHighlandPrincessGenesis"
  | "selectHighlandPrincessCard"
  | "resolveHighlandPrincess"
  | "cancelHighlandPrincess"
>;

export const createHighlandPrincessSlice: StateCreator<
  GameState,
  [],
  [],
  HighlandPrincessSlice
> = (set, get) => ({
  pendingHighlandPrincess: null,

  triggerHighlandPrincessGenesis: async (input: {
    minion: {
      at: CellKey;
      index: number;
      instanceId: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    ownerSeat: PlayerKey;
  }) => {
    const id = newHighlandPrincessId();
    const { minion, ownerSeat } = input;
    const zones = get().zones;
    const fullSpellbook = zones[ownerSeat]?.spellbook || [];

    // Haystack limits opponent's searches to top 3
    const board = get().board;
    const haystackLimit = getHaystackLimit(ownerSeat, board.sites || {});
    const spellbook = haystackLimit
      ? fullSpellbook.slice(0, haystackLimit)
      : fullSpellbook;

    // Set loading state
    set({
      pendingHighlandPrincess: {
        id,
        minion,
        ownerSeat,
        phase: "loading",
        eligibleCards: [],
        selectedCard: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Find eligible cards (artifacts with cost ≤ 1) - use embedded CardRef data
    const eligibleCards: CardRef[] = [];
    spellbook.forEach((card) => {
      const cardType = (card.type || "").toLowerCase();
      const cost = card.cost ?? 999;

      if (cardType.includes("artifact") && cost <= 1) {
        eligibleCards.push(card);
      }
    });

    if (eligibleCards.length === 0) {
      // No eligible cards, resolve with nothing
      set({ pendingHighlandPrincess: null } as Partial<GameState> as GameState);
      get().log(
        `[${ownerSeat.toUpperCase()}] Highland Princess finds no artifacts costing ①or less`,
      );
      return;
    }

    // Update to selecting phase
    set({
      pendingHighlandPrincess: {
        id,
        minion,
        ownerSeat,
        phase: "selecting",
        eligibleCards,
        selectedCard: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "highlandPrincessBegin",
          id,
          minion,
          ownerSeat,
          eligibleCount: eligibleCards.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${ownerSeat.toUpperCase()}] Highland Princess searches for an artifact...`,
    );
  },

  selectHighlandPrincessCard: (card: CardRef) => {
    const pending = get().pendingHighlandPrincess;
    if (!pending || pending.phase !== "selecting") return;

    // Check if card is eligible
    const isEligible = pending.eligibleCards.some(
      (c) => c.cardId === card.cardId,
    );
    if (!isEligible) return;

    set({
      pendingHighlandPrincess: { ...pending, selectedCard: card },
    } as Partial<GameState> as GameState);
  },

  resolveHighlandPrincess: () => {
    const pending = get().pendingHighlandPrincess;
    if (!pending || pending.phase !== "selecting") return;

    const { ownerSeat, selectedCard } = pending;

    if (!selectedCard) {
      // No card selected, just close
      set({ pendingHighlandPrincess: null } as Partial<GameState> as GameState);
      get().log(
        `[${ownerSeat.toUpperCase()}] Highland Princess chooses not to take an artifact`,
      );
      return;
    }

    const zones = get().zones;
    const spellbook = [...(zones[ownerSeat]?.spellbook || [])];
    const hand = [...(zones[ownerSeat]?.hand || [])];

    // Find and remove the selected card from spellbook
    const cardIndex = spellbook.findIndex(
      (c) => c.cardId === selectedCard.cardId,
    );
    if (cardIndex === -1) {
      set({ pendingHighlandPrincess: null } as Partial<GameState> as GameState);
      return;
    }

    const [removedCard] = spellbook.splice(cardIndex, 1);

    // Add to hand
    hand.push(removedCard);

    // Shuffle spellbook
    for (let i = spellbook.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spellbook[i], spellbook[j]] = [spellbook[j], spellbook[i]];
    }

    const zonesNext = {
      ...zones,
      [ownerSeat]: {
        ...zones[ownerSeat],
        spellbook,
        hand,
      },
    };

    // Create patches - send ALL zones for the affected seat to prevent partial patch issues
    // Partial zone patches can lose data when filtering logic on the receiving end
    // creates intermediate objects that don't preserve all zone keys
    const patches: ServerPatchT = {
      zones: {
        [ownerSeat]: zonesNext[ownerSeat],
      } as unknown as ServerPatchT["zones"],
    };

    // Update state
    set({
      zones: zonesNext,
      pendingHighlandPrincess: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    // Send patches
    get().trySendPatch(patches);

    get().log(
      `[${ownerSeat.toUpperCase()}] Highland Princess finds ${
        selectedCard.name
      }`,
    );

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "highlandPrincessResolve",
          id: pending.id,
          selectedCardName: selectedCard.name,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Clear pending after delay
    setTimeout(() => {
      set((state) => {
        if (state.pendingHighlandPrincess?.id === pending.id) {
          return { ...state, pendingHighlandPrincess: null } as GameState;
        }
        return state;
      });
    }, 500);
  },

  cancelHighlandPrincess: () => {
    const pending = get().pendingHighlandPrincess;
    if (!pending) return;

    set({ pendingHighlandPrincess: null } as Partial<GameState> as GameState);

    get().log(
      `[${pending.ownerSeat.toUpperCase()}] Highland Princess search cancelled`,
    );

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "highlandPrincessCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});
