import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  ServerPatchT,
} from "./types";
import { seatFromOwner, getAdjacentCells } from "./utils/boardHelpers";

function newDholChantsId() {
  return `dhol_chants_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type DholChantsPhase =
  | "selecting_allies" // Choose allies to tap
  | "revealing" // Revealing spells
  | "selecting_spell" // Choose spell to cast free
  | "complete";

export type DholChantsAlly = {
  at: CellKey;
  index: number;
  instanceId: string | null;
  name: string;
  tapped: boolean;
};

export type PendingDholChants = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: DholChantsPhase;
  nearbyAllies: DholChantsAlly[];
  selectedAllies: Array<{ at: CellKey; index: number }>;
  revealedSpells: CardRef[];
  selectedSpell: CardRef | null;
  createdAt: number;
};

export type DholChantsSlice = Pick<
  GameState,
  | "pendingDholChants"
  | "beginDholChants"
  | "toggleDholChantsAlly"
  | "confirmDholChantsAllies"
  | "selectDholChantsSpell"
  | "resolveDholChants"
  | "cancelDholChants"
>;

export const createDholChantsSlice: StateCreator<
  GameState,
  [],
  [],
  DholChantsSlice
> = (set, get) => ({
  pendingDholChants: null,

  beginDholChants: (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => {
    const id = newDholChantsId();
    const { spell, casterSeat } = input;
    const permanents = get().permanents;
    const board = get().board;

    // Get adjacent cells to the spell location
    const adjacentCells = getAdjacentCells(
      spell.at,
      board.size.w,
      board.size.h
    );

    // Find all untapped allies on adjacent tiles
    const nearbyAllies: DholChantsAlly[] = [];

    for (const cell of adjacentCells) {
      const cellPerms = permanents[cell] || [];
      cellPerms.forEach((perm, idx) => {
        const ownerSeat = seatFromOwner(perm.owner);
        if (ownerSeat !== casterSeat) return; // Only own minions

        // Check if it's a minion (not a token, site, artifact, etc.)
        const cardType = (perm.card.type || "").toLowerCase();
        if (!cardType.includes("minion")) return;

        nearbyAllies.push({
          at: cell,
          index: idx,
          instanceId: perm.instanceId ?? null,
          name: perm.card.name || "Minion",
          tapped: !!perm.tapped,
        });
      });
    }

    if (nearbyAllies.length === 0) {
      get().log(
        `[${casterSeat.toUpperCase()}] Dhol Chants: No nearby allies to tap`
      );
      // Move spell to graveyard
      get().movePermanentToZone(spell.at, spell.index, "graveyard");
      return;
    }

    // Filter to only untapped allies
    const untappedAllies = nearbyAllies.filter((a) => !a.tapped);

    if (untappedAllies.length === 0) {
      get().log(
        `[${casterSeat.toUpperCase()}] Dhol Chants: All nearby allies are already tapped`
      );
      get().movePermanentToZone(spell.at, spell.index, "graveyard");
      return;
    }

    set({
      pendingDholChants: {
        id,
        spell,
        casterSeat,
        phase: "selecting_allies",
        nearbyAllies: untappedAllies,
        selectedAllies: [],
        revealedSpells: [],
        selectedSpell: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${casterSeat.toUpperCase()}] Dhol Chants: Select allies to tap (${
        untappedAllies.length
      } available)`
    );

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "dholChantsBegin",
          id,
          spell,
          casterSeat,
          nearbyAllies: untappedAllies.map((a) => a.name),
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  toggleDholChantsAlly: (at: CellKey, index: number) => {
    const pending = get().pendingDholChants;
    if (!pending || pending.phase !== "selecting_allies") return;

    const { selectedAllies, nearbyAllies } = pending;

    // Verify ally is in nearby list and untapped
    const ally = nearbyAllies.find((a) => a.at === at && a.index === index);
    if (!ally || ally.tapped) return;

    // Toggle selection
    const isSelected = selectedAllies.some(
      (s) => s.at === at && s.index === index
    );
    const newSelected = isSelected
      ? selectedAllies.filter((s) => !(s.at === at && s.index === index))
      : [...selectedAllies, { at, index }];

    set({
      pendingDholChants: { ...pending, selectedAllies: newSelected },
    } as Partial<GameState> as GameState);
  },

  confirmDholChantsAllies: () => {
    const pending = get().pendingDholChants;
    if (!pending || pending.phase !== "selecting_allies") return;

    const { selectedAllies, casterSeat, nearbyAllies } = pending;

    if (selectedAllies.length === 0) {
      get().log(
        `[${casterSeat.toUpperCase()}] Dhol Chants: Must select at least one ally`
      );
      return;
    }

    // Tap all selected allies
    const permanents = get().permanents;
    const permsCopy = { ...permanents };

    for (const sel of selectedAllies) {
      const cellArr = [...(permsCopy[sel.at] || [])];
      if (cellArr[sel.index]) {
        cellArr[sel.index] = {
          ...cellArr[sel.index],
          tapped: true,
        };
        permsCopy[sel.at] = cellArr;
      }
    }

    // Reveal N spells from top of spellbook
    const zones = get().zones;
    const spellbook = zones[casterSeat]?.spellbook || [];
    const revealCount = selectedAllies.length;
    const revealedSpells = spellbook.slice(0, revealCount);

    set({
      permanents: permsCopy,
      pendingDholChants: {
        ...pending,
        phase: revealedSpells.length > 0 ? "selecting_spell" : "complete",
        revealedSpells,
      },
    } as Partial<GameState> as GameState);

    // Send patches for tapped permanents
    get().trySendPatch({ permanents: permsCopy });

    const allyNames = selectedAllies
      .map(
        (s) =>
          nearbyAllies.find((a) => a.at === s.at && a.index === s.index)?.name
      )
      .filter(Boolean)
      .join(", ");
    get().log(
      `[${casterSeat.toUpperCase()}] Dhol Chants taps ${
        selectedAllies.length
      } allies (${allyNames}), reveals ${revealedSpells.length} spells`
    );

    if (revealedSpells.length === 0) {
      get().log(
        `[${casterSeat.toUpperCase()}] Dhol Chants: No spells in spellbook to reveal`
      );
      // Move spell to graveyard
      get().movePermanentToZone(
        pending.spell.at,
        pending.spell.index,
        "graveyard"
      );
      setTimeout(() => {
        set({ pendingDholChants: null } as Partial<GameState> as GameState);
      }, 500);
    }

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "dholChantsReveal",
          id: pending.id,
          tappedCount: selectedAllies.length,
          revealedNames: revealedSpells.map((c) => c.name),
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  selectDholChantsSpell: (card: CardRef) => {
    const pending = get().pendingDholChants;
    if (!pending || pending.phase !== "selecting_spell") return;

    // Verify spell is in revealed list
    const isRevealed = pending.revealedSpells.some(
      (c) => c.cardId === card.cardId
    );
    if (!isRevealed) return;

    set({
      pendingDholChants: { ...pending, selectedSpell: card },
    } as Partial<GameState> as GameState);
  },

  resolveDholChants: () => {
    const pending = get().pendingDholChants;
    if (
      !pending ||
      pending.phase !== "selecting_spell" ||
      !pending.selectedSpell
    ) {
      return;
    }

    const { spell, casterSeat, revealedSpells, selectedSpell } = pending;

    const zones = get().zones;
    const spellbook = [...(zones[casterSeat]?.spellbook || [])];
    const hand = [...(zones[casterSeat]?.hand || [])];

    // Remove revealed spells from top
    const remainingRevealed = revealedSpells.filter(
      (c) => c.cardId !== selectedSpell.cardId
    );
    spellbook.splice(0, revealedSpells.length);

    // Add selected spell to hand (cast for free means put in hand to cast)
    hand.push(selectedSpell);

    // Put rest at bottom (shuffled)
    const shuffledRest = [...remainingRevealed].sort(() => Math.random() - 0.5);
    spellbook.push(...shuffledRest);

    const zonesNext = {
      ...zones,
      [casterSeat]: { ...zones[casterSeat], spellbook, hand },
    };

    set({
      zones: zonesNext,
      pendingDholChants: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    // Move Dhol Chants spell to graveyard
    get().movePermanentToZone(spell.at, spell.index, "graveyard");

    // Send patches
    const patches: ServerPatchT = {
      zones: {
        [casterSeat]: {
          spellbook: zonesNext[casterSeat].spellbook,
          hand: zonesNext[casterSeat].hand,
        },
      } as unknown as ServerPatchT["zones"],
    };
    get().trySendPatch(patches);

    get().log(
      `[${casterSeat.toUpperCase()}] Dhol Chants: ${
        selectedSpell.name
      } added to hand (cast free), ${remainingRevealed.length} cards to bottom`
    );

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "dholChantsResolve",
          id: pending.id,
          selectedSpellName: selectedSpell.name,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Clear pending
    setTimeout(() => {
      set((state) => {
        if (state.pendingDholChants?.id === pending.id) {
          return { ...state, pendingDholChants: null } as GameState;
        }
        return state;
      });
    }, 500);
  },

  cancelDholChants: () => {
    const pending = get().pendingDholChants;
    if (!pending) return;

    const { spell, casterSeat } = pending;

    // Move spell to graveyard
    get().movePermanentToZone(spell.at, spell.index, "graveyard");

    set({ pendingDholChants: null } as Partial<GameState> as GameState);

    get().log(`[${casterSeat.toUpperCase()}] Dhol Chants cancelled`);
  },
});
