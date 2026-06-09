import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  ServerPatchT,
  Zones,
} from "./types";
import { getHaystackLimit } from "./utils/boardHelpers";

function newKingswoodPoachersId() {
  return `kingswood_poachers_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type KingswoodPoachersPhase =
  | "confirming" // Auto-resolve confirmation (Genesis may be silenced/skipped)
  | "selecting_spellbook" // Choose own or opponent spellbook to search
  | "selecting" // Pick up to 3 Beasts to banish
  | "resolving"
  | "complete";

export type PendingKingswoodPoachers = {
  id: string;
  casterSeat: PlayerKey;
  minion: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  phase: KingswoodPoachersPhase;
  targetSeat: PlayerKey | null; // chosen spellbook owner
  eligibleCards: CardRef[]; // Beasts found in the searched spellbook
  eligibleIndices: number[]; // eligibleCards[i] -> actual spellbook index
  selectedIndices: number[]; // indices into eligibleCards (max 3)
  createdAt: number;
};

export type KingswoodPoachersSlice = Pick<
  GameState,
  | "pendingKingswoodPoachers"
  | "beginKingswoodPoachers"
  | "confirmKingswoodPoachers"
  | "selectKingswoodPoachersSpellbook"
  | "selectKingswoodPoachersBeast"
  | "resolveKingswoodPoachers"
  | "cancelKingswoodPoachers"
>;

// Find Beasts in a spellbook (respecting an optional Haystack top-N limit).
// Returned indices map back to positions in the FULL spellbook array.
function findBeasts(
  spellbook: CardRef[],
  limit: number | null,
): { eligibleCards: CardRef[]; eligibleIndices: number[] } {
  const view = limit ? spellbook.slice(0, limit) : spellbook;
  const eligibleCards: CardRef[] = [];
  const eligibleIndices: number[] = [];
  view.forEach((card, idx) => {
    const subTypes = (card.subTypes || "").toLowerCase();
    if (subTypes.includes("beast")) {
      eligibleCards.push(card);
      eligibleIndices.push(idx); // slice keeps original top indices
    }
  });
  return { eligibleCards, eligibleIndices };
}

export const createKingswoodPoachersSlice: StateCreator<
  GameState,
  [],
  [],
  KingswoodPoachersSlice
> = (set, get) => ({
  pendingKingswoodPoachers: null,

  beginKingswoodPoachers: (input) => {
    const id = newKingswoodPoachersId();
    const { minion, casterSeat } = input;

    set({
      pendingKingswoodPoachers: {
        id,
        casterSeat,
        minion,
        phase: "confirming",
        targetSeat: null,
        eligibleCards: [],
        eligibleIndices: [],
        selectedIndices: [],
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${casterSeat.toUpperCase()}] Kingswood Poachers enters - awaiting Genesis confirmation`,
    );

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "kingswoodPoachersBegin",
          id,
          casterSeat,
          minion,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  confirmKingswoodPoachers: () => {
    const pending = get().pendingKingswoodPoachers;
    if (!pending || pending.phase !== "confirming") return;

    set({
      pendingKingswoodPoachers: {
        ...pending,
        phase: "selecting_spellbook",
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${pending.casterSeat.toUpperCase()}] Kingswood Poachers: choosing a spellbook to search...`,
    );

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "kingswoodPoachersConfirm",
          id: pending.id,
          casterSeat: pending.casterSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  selectKingswoodPoachersSpellbook: (targetSeat: PlayerKey) => {
    const pending = get().pendingKingswoodPoachers;
    if (!pending || pending.phase !== "selecting_spellbook") return;

    const { casterSeat } = pending;
    const board = get().board;
    const limit = getHaystackLimit(casterSeat, board.sites || {});
    const spellbook = get().zones[targetSeat]?.spellbook || [];
    const { eligibleCards, eligibleIndices } = findBeasts(spellbook, limit);

    set({
      pendingKingswoodPoachers: {
        ...pending,
        phase: "selecting",
        targetSeat,
        eligibleCards,
        eligibleIndices,
        selectedIndices: [],
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${casterSeat.toUpperCase()}] Kingswood Poachers: searching ${targetSeat.toUpperCase()}'s spellbook (${
        eligibleCards.length
      } Beast(s) found)`,
    );

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "kingswoodPoachersSelectSpellbook",
          id: pending.id,
          casterSeat,
          targetSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  selectKingswoodPoachersBeast: (index: number) => {
    const pending = get().pendingKingswoodPoachers;
    if (!pending || pending.phase !== "selecting") return;

    const selectedIndices = [...pending.selectedIndices];
    const existing = selectedIndices.indexOf(index);
    if (existing >= 0) {
      selectedIndices.splice(existing, 1);
    } else {
      if (selectedIndices.length >= 3) {
        selectedIndices.shift();
      }
      selectedIndices.push(index);
    }

    set({
      pendingKingswoodPoachers: {
        ...pending,
        selectedIndices,
      },
    } as Partial<GameState> as GameState);
  },

  resolveKingswoodPoachers: () => {
    const pending = get().pendingKingswoodPoachers;
    if (!pending || pending.targetSeat == null) return;

    const state = get();
    const { casterSeat, selectedIndices, eligibleIndices } = pending;
    const searchedSeat = pending.targetSeat;
    const spellbookOrig = state.zones[searchedSeat]?.spellbook || [];

    // Map selected Beast positions back to actual spellbook indices
    const spellbookIndices = selectedIndices
      .map((i) => eligibleIndices[i])
      .filter((v): v is number => typeof v === "number");
    const sortedIndices = [...spellbookIndices].sort((a, b) => b - a);
    const cardsToBanish = sortedIndices
      .map((idx) => spellbookOrig[idx])
      .filter(Boolean);

    // Build the new spellbook: remove banished Beasts, then shuffle
    const spellbook = [...spellbookOrig];
    sortedIndices.forEach((idx) => {
      if (idx >= 0 && idx < spellbook.length) {
        spellbook.splice(idx, 1);
      }
    });
    for (let i = spellbook.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spellbook[i], spellbook[j]] = [spellbook[j], spellbook[i]];
    }

    const banished = [
      ...(state.zones[searchedSeat]?.banished || []),
      ...cardsToBanish,
    ];

    // Build COMPLETE zone object (all seven zones) for the searched seat
    const targetZones: Zones = {
      spellbook,
      atlas: [...(state.zones[searchedSeat]?.atlas || [])],
      hand: [...(state.zones[searchedSeat]?.hand || [])],
      graveyard: [...(state.zones[searchedSeat]?.graveyard || [])],
      battlefield: [...(state.zones[searchedSeat]?.battlefield || [])],
      collection: [...(state.zones[searchedSeat]?.collection || [])],
      banished,
    };

    const zonesNext = { ...state.zones, [searchedSeat]: targetZones };
    set({
      zones: zonesNext,
      pendingKingswoodPoachers: null,
    } as Partial<GameState> as GameState);

    const cardNames =
      cardsToBanish.map((c) => c.name || "Unknown").join(", ") || "no Beasts";
    get().log(
      `[${casterSeat.toUpperCase()}] Kingswood Poachers banishes ${
        cardsToBanish.length
      } Beast(s) from ${searchedSeat.toUpperCase()}'s spellbook: ${cardNames}`,
    );

    // Only patch our OWN seat's zones. The server blocks cross-player zone
    // patches, so when searching the opponent's spellbook we send a custom
    // message and let them mutate + shuffle + patch their own zones.
    const isOwnBook = searchedSeat === casterSeat;
    if (isOwnBook) {
      try {
        get().trySendPatch({
          zones: { [searchedSeat]: targetZones },
        } as ServerPatchT);
      } catch {}
    }

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "kingswoodPoachersResolve",
          id: pending.id,
          casterSeat,
          targetSeat: searchedSeat,
          spellbookIndices: sortedIndices,
          cardsToBanish,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  cancelKingswoodPoachers: () => {
    const pending = get().pendingKingswoodPoachers;
    if (!pending) return;

    // Genesis declined (or silenced) - the minion remains on the board.
    set({ pendingKingswoodPoachers: null } as Partial<GameState> as GameState);

    get().log(
      `[${pending.casterSeat.toUpperCase()}] Kingswood Poachers: Genesis skipped - minion remains on board`,
    );

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "kingswoodPoachersCancel",
          id: pending.id,
          casterSeat: pending.casterSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});
