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

function newBlackMassId() {
  return `black_mass_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type BlackMassPhase = "loading" | "selecting" | "resolving" | "complete";

export type PendingBlackMass = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: BlackMassPhase;
  topSevenCards: CardRef[];
  eligibleIndices: number[]; // Indices of Evil minions in topSevenCards
  allMinionIndices: number[]; // All minions (for checkbox toggle)
  selectedIndices: number[]; // Up to 3 selected cards
  createdAt: number;
};

export type BlackMassSlice = Pick<
  GameState,
  | "pendingBlackMass"
  | "beginBlackMass"
  | "selectBlackMassCard"
  | "deselectBlackMassCard"
  | "resolveBlackMass"
  | "cancelBlackMass"
>;

export const createBlackMassSlice: StateCreator<
  GameState,
  [],
  [],
  BlackMassSlice
> = (set, get) => ({
  pendingBlackMass: null,

  beginBlackMass: async (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => {
    const id = newBlackMassId();
    const { spell, casterSeat } = input;
    const zones = get().zones;
    const spellbook = zones[casterSeat]?.spellbook || [];

    // Set loading state immediately
    set({
      pendingBlackMass: {
        id,
        spell,
        casterSeat,
        phase: "loading",
        topSevenCards: [],
        eligibleIndices: [],
        allMinionIndices: [],
        selectedIndices: [],
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Get top 7 cards (or fewer if spellbook is smaller)
    // Haystack limits opponent's searches to top 3
    const board = get().board;
    const haystackLimit = getHaystackLimit(casterSeat, board.sites || {});
    const searchLimit = haystackLimit ?? 7;
    const topSevenCards = spellbook.slice(0, searchLimit);

    if (topSevenCards.length === 0) {
      // No cards to search, move spell to graveyard
      get().movePermanentToZone(spell.at, spell.index, "graveyard");
      set({ pendingBlackMass: null } as Partial<GameState> as GameState);
      get().log(
        `[${casterSeat.toUpperCase()}] Black Mass finds no cards to search`,
      );
      return;
    }

    // Evil minion types: Demons, Undead, Monsters
    const EVIL_SUBTYPES = ["demon", "undead", "monster"];
    const isEvilSubtype = (subTypes: string) => {
      const lower = subTypes.toLowerCase();
      return EVIL_SUBTYPES.some((evil) => lower.includes(evil));
    };

    // Filter using embedded CardRef data (no async fetch needed)
    const eligibleIndices: number[] = [];
    const allMinionIndices: number[] = [];
    topSevenCards.forEach((card, index) => {
      const cardType = (card.type || "").toLowerCase();
      const subTypes = card.subTypes || "";
      const isMinion = cardType.includes("minion");
      if (isMinion) {
        allMinionIndices.push(index);
        if (isEvilSubtype(subTypes)) {
          eligibleIndices.push(index);
        }
      }
    });

    // Update to selecting phase
    set({
      pendingBlackMass: {
        id,
        spell,
        casterSeat,
        phase: "selecting",
        topSevenCards,
        eligibleIndices,
        allMinionIndices,
        selectedIndices: [],
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "blackMassBegin",
          id,
          spell,
          casterSeat,
          topSevenCards,
          eligibleIndices,
          allMinionIndices,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${casterSeat.toUpperCase()}] casts Black Mass - searching top ${
        topSevenCards.length
      } spells`,
    );
  },

  selectBlackMassCard: (index: number) => {
    const pending = get().pendingBlackMass;
    if (!pending || pending.phase !== "selecting") return;

    // Check if already selected
    if (pending.selectedIndices.includes(index)) return;

    // Check if eligible (allow any minion - checkbox toggle handled in UI)
    if (!pending.allMinionIndices.includes(index)) return;

    // Check if max 3 selected
    if (pending.selectedIndices.length >= 3) return;

    // Check if card is different from already selected (different card names)
    const newCard = pending.topSevenCards[index];
    const alreadySelectedNames = pending.selectedIndices.map(
      (i) => pending.topSevenCards[i]?.name,
    );
    if (alreadySelectedNames.includes(newCard?.name)) {
      // Can't select duplicates
      return;
    }

    set({
      pendingBlackMass: {
        ...pending,
        selectedIndices: [...pending.selectedIndices, index],
      },
    } as Partial<GameState> as GameState);
  },

  deselectBlackMassCard: (index: number) => {
    const pending = get().pendingBlackMass;
    if (!pending || pending.phase !== "selecting") return;

    set({
      pendingBlackMass: {
        ...pending,
        selectedIndices: pending.selectedIndices.filter((i) => i !== index),
      },
    } as Partial<GameState> as GameState);
  },

  resolveBlackMass: () => {
    const pending = get().pendingBlackMass;
    if (!pending || pending.phase !== "selecting") return;

    const { spell, casterSeat, topSevenCards, selectedIndices } = pending;

    // Check Gard of Eden draw limit
    const cardsToDraw = selectedIndices.length;
    if (cardsToDraw > 0) {
      const canDraw = get().canDrawCard(casterSeat, cardsToDraw);
      if (!canDraw.allowed) {
        get().log(
          `[${casterSeat.toUpperCase()}] Gard of Eden prevents drawing ${cardsToDraw} cards (only ${canDraw.remaining} remaining)`,
        );
        // Cancel instead of resolving
        get().cancelBlackMass();
        return;
      }
    }

    // Update phase
    set({
      pendingBlackMass: { ...pending, phase: "resolving" },
    } as Partial<GameState> as GameState);

    const zones = get().zones;
    const spellbook = [...(zones[casterSeat]?.spellbook || [])];
    const hand = [...(zones[casterSeat]?.hand || [])];

    // Get selected cards to draw
    const selectedCards = selectedIndices.map((i) => topSevenCards[i]);

    // Get remaining cards (not selected) from top 7 to put at bottom
    const remainingCards = topSevenCards.filter(
      (_, i) => !selectedIndices.includes(i),
    );

    // Remove top 7 from spellbook
    spellbook.splice(0, topSevenCards.length);

    // Add selected cards to hand
    hand.push(...selectedCards);

    // Add remaining cards to bottom of spellbook
    spellbook.push(...remainingCards);

    const zonesNext = {
      ...zones,
      [casterSeat]: {
        ...zones[casterSeat],
        spellbook,
        hand,
      },
    };

    // Create patches - send full zones for seat to prevent partial patch issues
    // (graveyard handled by movePermanentToZone)
    const patches: ServerPatchT = {
      zones: {
        [casterSeat]: zonesNext[casterSeat],
      } as unknown as ServerPatchT["zones"],
    };

    // Update state
    set({
      zones: zonesNext,
      pendingBlackMass: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    // Remove spell from battlefield and move to graveyard
    get().movePermanentToZone(spell.at, spell.index, "graveyard");

    // Send patches
    get().trySendPatch(patches);

    // Log result
    if (selectedCards.length > 0) {
      get().log(
        `[${casterSeat.toUpperCase()}] draws ${
          selectedCards.length
        } Evil minion(s): ${selectedCards.map((c) => c.name).join(", ")}`,
      );
      // Increment cards drawn counter for Gard of Eden tracking
      get().incrementCardsDrawn(casterSeat, selectedCards.length);
    } else {
      get().log(`[${casterSeat.toUpperCase()}] chooses not to draw any cards`);
    }

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "blackMassResolve",
          id: pending.id,
          selectedCardNames: selectedCards.map((c) => c.name),
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Clear pending after delay
    setTimeout(() => {
      set((state) => {
        if (state.pendingBlackMass?.id === pending.id) {
          return { ...state, pendingBlackMass: null } as GameState;
        }
        return state;
      });
    }, 500);
  },

  cancelBlackMass: () => {
    const pending = get().pendingBlackMass;
    if (!pending) return;

    const { spell, casterSeat } = pending;

    // Move spell to graveyard
    get().movePermanentToZone(spell.at, spell.index, "graveyard");

    set({ pendingBlackMass: null } as Partial<GameState> as GameState);

    get().log(`[${casterSeat.toUpperCase()}] cancels Black Mass`);

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "blackMassCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});
