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

function newAssortedAnimalsId() {
  return `assorted_animals_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type AssortedAnimalsPhase =
  | "choosing_x"
  | "loading"
  | "selecting"
  | "complete";

export type PendingAssortedAnimals = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: AssortedAnimalsPhase;
  maxMana: number; // Maximum mana available to spend
  xValue: number; // The X cost chosen/paid
  eligibleCards: Array<CardRef & { cost: number }>; // Beasts in spellbook with their costs
  selectedCards: Array<CardRef & { cost: number }>; // Selected Beasts
  createdAt: number;
};

export type AssortedAnimalsSlice = Pick<
  GameState,
  | "pendingAssortedAnimals"
  | "beginAssortedAnimals"
  | "setAssortedAnimalsX"
  | "selectAssortedAnimalsCard"
  | "deselectAssortedAnimalsCard"
  | "resolveAssortedAnimals"
  | "cancelAssortedAnimals"
>;

export const createAssortedAnimalsSlice: StateCreator<
  GameState,
  [],
  [],
  AssortedAnimalsSlice
> = (set, get) => ({
  pendingAssortedAnimals: null,

  beginAssortedAnimals: async (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
    xValue: number; // This is now maxMana - player will choose actual X
  }) => {
    const id = newAssortedAnimalsId();
    const { spell, casterSeat } = input;

    // Calculate available mana from site count
    const board = get().board;
    const ownerNum = casterSeat === "p1" ? 1 : 2;
    const siteCount = Object.values(board.sites || {}).filter(
      (s) => s?.owner === ownerNum,
    ).length;
    const players = get().players;
    const player = players[casterSeat];
    const manaOffset = player?.mana ?? 0;
    const availableMana = Math.max(0, siteCount - manaOffset);

    // Set choosing_x phase - player must choose X value first
    set({
      pendingAssortedAnimals: {
        id,
        spell,
        casterSeat,
        phase: "choosing_x",
        maxMana: availableMana,
        xValue: 0,
        eligibleCards: [],
        selectedCards: [],
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);
  },

  setAssortedAnimalsX: async (xValue: number) => {
    const pending = get().pendingAssortedAnimals;
    if (!pending || pending.phase !== "choosing_x") return;

    const { spell, casterSeat, maxMana } = pending;
    const chosenX = Math.min(xValue, maxMana);

    if (chosenX <= 0) {
      // X=0 means no beasts possible, cancel
      get().cancelAssortedAnimals();
      return;
    }

    // Spend the mana
    const players = get().players;
    const player = players[casterSeat];
    const newManaOffset = (player?.mana ?? 0) + chosenX;
    const playersNext = {
      ...players,
      [casterSeat]: { ...player, mana: newManaOffset },
    };

    // Update to loading phase
    set({
      pendingAssortedAnimals: {
        ...pending,
        phase: "loading",
        xValue: chosenX,
      },
      players: playersNext,
    } as Partial<GameState> as GameState);

    // Send only affected player's data to avoid overwriting opponent's state
    get().trySendPatch({
      players: {
        [casterSeat]: playersNext[casterSeat],
      } as GameState["players"],
    });

    const zones = get().zones;
    const fullSpellbook = zones[casterSeat]?.spellbook || [];

    // Haystack limits opponent's searches to top 3
    const board = get().board;
    const haystackLimit = getHaystackLimit(casterSeat, board.sites || {});
    const spellbook = haystackLimit
      ? fullSpellbook.slice(0, haystackLimit)
      : fullSpellbook;

    // Find eligible cards (Beasts with cost ≤ X) - use embedded CardRef data
    const eligibleCards: Array<CardRef & { cost: number }> = [];
    spellbook.forEach((card) => {
      const subTypes = (card.subTypes || "").toLowerCase();
      const cost = card.cost ?? 999;

      if (subTypes.includes("beast") && cost <= chosenX) {
        eligibleCards.push({ ...card, cost });
      }
    });

    if (eligibleCards.length === 0) {
      // No eligible cards, move spell to graveyard
      get().movePermanentToZone(spell.at, spell.index, "graveyard");
      set({ pendingAssortedAnimals: null } as Partial<GameState> as GameState);
      get().log(
        `[${casterSeat.toUpperCase()}] Assorted Animals finds no Beasts costing ${chosenX} or less`,
      );
      return;
    }

    // Update to selecting phase
    const currentPending = get().pendingAssortedAnimals;
    set({
      pendingAssortedAnimals: {
        ...currentPending,
        phase: "selecting",
        xValue: chosenX,
        eligibleCards,
        selectedCards: [],
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "assortedAnimalsBegin",
          id: currentPending?.id,
          spell,
          casterSeat,
          xValue: chosenX,
          eligibleCount: eligibleCards.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${casterSeat.toUpperCase()}] casts Assorted Animals (X=${chosenX}) - searching for Beasts`,
    );
  },

  selectAssortedAnimalsCard: (card: CardRef & { cost: number }) => {
    const pending = get().pendingAssortedAnimals;
    if (!pending || pending.phase !== "selecting") return;

    // Check if already selected
    if (pending.selectedCards.some((c) => c.cardId === card.cardId)) return;

    // Check if card name is already in selected (must be different Beasts)
    if (pending.selectedCards.some((c) => c.name === card.name)) return;

    // Check if adding this card would exceed X
    const currentTotal = pending.selectedCards.reduce(
      (sum, c) => sum + c.cost,
      0,
    );
    if (currentTotal + card.cost > pending.xValue) return;

    set({
      pendingAssortedAnimals: {
        ...pending,
        selectedCards: [...pending.selectedCards, card],
      },
    } as Partial<GameState> as GameState);
  },

  deselectAssortedAnimalsCard: (cardId: number) => {
    const pending = get().pendingAssortedAnimals;
    if (!pending || pending.phase !== "selecting") return;

    set({
      pendingAssortedAnimals: {
        ...pending,
        selectedCards: pending.selectedCards.filter((c) => c.cardId !== cardId),
      },
    } as Partial<GameState> as GameState);
  },

  resolveAssortedAnimals: () => {
    const pending = get().pendingAssortedAnimals;
    if (!pending || pending.phase !== "selecting") return;

    const { spell, casterSeat, selectedCards } = pending;

    const zones = get().zones;
    const spellbook = [...(zones[casterSeat]?.spellbook || [])];
    const hand = [...(zones[casterSeat]?.hand || [])];

    // Remove selected cards from spellbook and add to hand
    for (const selectedCard of selectedCards) {
      const idx = spellbook.findIndex((c) => c.cardId === selectedCard.cardId);
      if (idx !== -1) {
        const [removed] = spellbook.splice(idx, 1);
        hand.push(removed);
      }
    }

    // Shuffle spellbook
    for (let i = spellbook.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spellbook[i], spellbook[j]] = [spellbook[j], spellbook[i]];
    }

    // Move spell from board to graveyard (this properly removes it from permanents)
    get().movePermanentToZone(spell.at, spell.index, "graveyard");

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
      pendingAssortedAnimals: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    // Send patches
    get().trySendPatch(patches);

    // Log result
    if (selectedCards.length > 0) {
      const totalCost = selectedCards.reduce((sum, c) => sum + c.cost, 0);
      get().log(
        `[${casterSeat.toUpperCase()}] finds ${
          selectedCards.length
        } Beast(s) (total cost ${totalCost}): ${selectedCards
          .map((c) => c.name)
          .join(", ")}`,
      );
    } else {
      get().log(`[${casterSeat.toUpperCase()}] chooses not to take any Beasts`);
    }

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "assortedAnimalsResolve",
          id: pending.id,
          selectedCardNames: selectedCards.map((c) => c.name),
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Clear pending after delay
    setTimeout(() => {
      set((state) => {
        if (state.pendingAssortedAnimals?.id === pending.id) {
          return { ...state, pendingAssortedAnimals: null } as GameState;
        }
        return state;
      });
    }, 500);
  },

  cancelAssortedAnimals: () => {
    const pending = get().pendingAssortedAnimals;
    if (!pending) return;

    const { spell, casterSeat } = pending;

    // Move spell to graveyard
    get().movePermanentToZone(spell.at, spell.index, "graveyard");

    set({ pendingAssortedAnimals: null } as Partial<GameState> as GameState);

    get().log(`[${casterSeat.toUpperCase()}] cancels Assorted Animals`);

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "assortedAnimalsCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});
