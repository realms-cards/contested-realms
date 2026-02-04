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

function newShapeshiftId() {
  return `shapeshift_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function isShapeshiftCard(cardName: string | null | undefined): boolean {
  if (!cardName) return false;
  return cardName.toLowerCase() === "shapeshift";
}

export type ShapeshiftPhase = "selectingTarget" | "viewing" | "resolved";

export type PendingShapeshift = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: number;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: ShapeshiftPhase;
  targetMinion: {
    cellKey: CellKey;
    index: number;
    instanceId: string | null;
    card: CardRef;
  } | null;
  revealedCards: CardRef[];
  selectedMinionIndex: number | null;
  createdAt: number;
};

export type ShapeshiftSlice = Pick<
  GameState,
  | "pendingShapeshift"
  | "beginShapeshift"
  | "selectShapeshiftTarget"
  | "selectShapeshiftMinion"
  | "skipShapeshiftSelection"
  | "resolveShapeshift"
  | "cancelShapeshift"
  | "skipShapeshiftAutoResolve"
>;

export const createShapeshiftSlice: StateCreator<
  GameState,
  [],
  [],
  ShapeshiftSlice
> = (set, get) => ({
  pendingShapeshift: null,

  beginShapeshift: (input) => {
    const id = newShapeshiftId();
    const casterSeat = input.casterSeat;

    set({
      pendingShapeshift: {
        id,
        spell: input.spell,
        casterSeat,
        phase: "selectingTarget",
        targetMinion: null,
        revealedCards: [],
        selectedMinionIndex: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "shapeshiftBegin",
          id,
          spell: input.spell,
          casterSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${casterSeat.toUpperCase()}] casts Shapeshift - select an allied minion to transform`,
    );
  },

  selectShapeshiftTarget: (target) => {
    const pending = get().pendingShapeshift;
    if (!pending || pending.phase !== "selectingTarget") return;

    const casterSeat = pending.casterSeat;
    const zones = get().zones;
    const spellbook = zones[casterSeat]?.spellbook || [];

    // Take up to 5 cards from the top of spellbook
    const revealedCards = spellbook.slice(0, 5);

    if (revealedCards.length === 0) {
      get().log(
        `[${casterSeat.toUpperCase()}] Shapeshift: No spells in spellbook - transformation fails`,
      );
      // Move spell to graveyard
      try {
        get().movePermanentToZone(
          pending.spell.at,
          pending.spell.index,
          "graveyard",
        );
      } catch {}
      set({ pendingShapeshift: null } as Partial<GameState> as GameState);
      return;
    }

    set({
      pendingShapeshift: {
        ...pending,
        targetMinion: target,
        revealedCards,
        phase: "viewing",
      },
    } as Partial<GameState> as GameState);

    // Broadcast target selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "shapeshiftSelectTarget",
          id: pending.id,
          target,
          revealedCount: revealedCards.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${casterSeat.toUpperCase()}] Shapeshift: ${target.card.name} will try to transform - looking at ${revealedCards.length} spell${revealedCards.length !== 1 ? "s" : ""}`,
    );
  },

  selectShapeshiftMinion: (cardIndex) => {
    const pending = get().pendingShapeshift;
    if (!pending || pending.phase !== "viewing") return;
    if (cardIndex < 0 || cardIndex >= pending.revealedCards.length) return;

    // Verify it's a minion
    const selectedCard = pending.revealedCards[cardIndex];
    const cardType = (selectedCard.type || "").toLowerCase();
    if (!cardType.includes("minion")) {
      get().log("Shapeshift: Selected card is not a minion");
      return;
    }

    set({
      pendingShapeshift: {
        ...pending,
        selectedMinionIndex: cardIndex,
      },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "shapeshiftSelectMinion",
          id: pending.id,
          cardIndex,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  skipShapeshiftSelection: () => {
    const pending = get().pendingShapeshift;
    if (!pending || pending.phase !== "viewing") return;

    // Clear any selection
    set({
      pendingShapeshift: {
        ...pending,
        selectedMinionIndex: null,
      },
    } as Partial<GameState> as GameState);

    // Broadcast skip
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "shapeshiftSkipSelection",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveShapeshift: () => {
    const pending = get().pendingShapeshift;
    if (!pending || pending.phase !== "viewing" || !pending.targetMinion)
      return;

    const casterSeat = pending.casterSeat;
    const zones = get().zones;
    const spellbook = [...(zones[casterSeat]?.spellbook || [])];
    const graveyard = [...(zones[casterSeat]?.graveyard || [])];
    const revealedCount = pending.revealedCards.length;

    // Remove the revealed cards from spellbook (they were at the top)
    spellbook.splice(0, revealedCount);

    // Determine which cards go to bottom (all non-selected, in random order)
    const bottomIndices = pending.revealedCards
      .map((_, i) => i)
      .filter((i) => i !== pending.selectedMinionIndex);

    // Shuffle the bottom cards
    const shuffledBottomIndices = [...bottomIndices].sort(
      () => Math.random() - 0.5,
    );
    const bottomCards = shuffledBottomIndices.map(
      (i) => pending.revealedCards[i],
    );

    // Put bottom cards at the bottom of spellbook
    spellbook.push(...bottomCards);

    // If a minion was selected, transform the target
    const selectedCard =
      pending.selectedMinionIndex !== null
        ? pending.revealedCards[pending.selectedMinionIndex]
        : null;

    let transformedMessage = "";
    const board = get().board;
    const permanents = { ...get().permanents };

    if (selectedCard && pending.targetMinion) {
      const { cellKey, index: targetIndex } = pending.targetMinion;
      const arr = permanents[cellKey];

      if (arr && arr[targetIndex]) {
        const oldCard = arr[targetIndex].card as CardRef;
        // Replace the card on the minion
        permanents[cellKey] = arr.map((p, i) =>
          i === targetIndex
            ? {
                ...p,
                card: {
                  ...selectedCard,
                  instanceId: p.card.instanceId,
                  owner: p.card.owner,
                },
              }
            : p,
        );
        transformedMessage = `${oldCard.name} transforms into ${selectedCard.name}!`;

        // The original minion card goes to graveyard
        graveyard.push(oldCard);
      }
    } else {
      transformedMessage = `${pending.targetMinion.card.name} fails to find a new form`;
    }

    // Update zones
    const zonesNext = {
      ...zones,
      [casterSeat]: {
        ...zones[casterSeat],
        spellbook,
        graveyard,
      },
    };

    set({
      zones: zonesNext,
      permanents,
      pendingShapeshift: null,
    } as Partial<GameState> as GameState);

    // Send zone patch
    const zonePatch: ServerPatchT = {
      zones: { [casterSeat]: zonesNext[casterSeat] } as Record<
        PlayerKey,
        Zones
      >,
      permanents,
    };
    get().trySendPatch(zonePatch);

    // Move spell to graveyard
    try {
      get().movePermanentToZone(
        pending.spell.at,
        pending.spell.index,
        "graveyard",
      );
    } catch {}

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "shapeshiftResolve",
          id: pending.id,
          selectedMinionIndex: pending.selectedMinionIndex,
          shuffledBottomIndices,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${casterSeat.toUpperCase()}] Shapeshift resolved: ${transformedMessage}. ${bottomCards.length} card${bottomCards.length !== 1 ? "s" : ""} to bottom of spellbook.`,
    );
  },

  cancelShapeshift: () => {
    const pending = get().pendingShapeshift;
    if (!pending) return;

    const casterSeat = pending.casterSeat;

    // If we revealed cards, put them back on top in original order
    if (pending.revealedCards.length > 0) {
      const zones = get().zones;
      const spellbook = [...(zones[casterSeat]?.spellbook || [])];
      spellbook.splice(0, pending.revealedCards.length);
      spellbook.unshift(...pending.revealedCards);

      const zonesNext = {
        ...zones,
        [casterSeat]: {
          ...zones[casterSeat],
          spellbook,
        },
      };

      set({
        zones: zonesNext,
        pendingShapeshift: null,
      } as Partial<GameState> as GameState);
    } else {
      set({ pendingShapeshift: null } as Partial<GameState> as GameState);
    }

    // Move spell back to hand
    try {
      get().movePermanentToZone(pending.spell.at, pending.spell.index, "hand");
    } catch {}

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "shapeshiftCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log("Shapeshift cancelled");
  },

  skipShapeshiftAutoResolve: () => {
    const pending = get().pendingShapeshift;
    if (!pending) return;

    const casterSeat = pending.casterSeat;

    // If we revealed cards, put them back on top in original order
    if (pending.revealedCards.length > 0) {
      const zones = get().zones;
      const spellbook = [...(zones[casterSeat]?.spellbook || [])];
      spellbook.splice(0, pending.revealedCards.length);
      spellbook.unshift(...pending.revealedCards);

      const zonesNext = {
        ...zones,
        [casterSeat]: {
          ...zones[casterSeat],
          spellbook,
        },
      };

      set({
        zones: zonesNext,
        pendingShapeshift: null,
      } as Partial<GameState> as GameState);
    } else {
      set({ pendingShapeshift: null } as Partial<GameState> as GameState);
    }

    // NOTE: Unlike cancel, we do NOT move the spell back to hand
    // The spell stays on the board for manual resolution

    // Broadcast skip auto-resolve
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "shapeshiftSkipAutoResolve",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log("Shapeshift: skipping auto-resolve, resolve manually");
  },
});
