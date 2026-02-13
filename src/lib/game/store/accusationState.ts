import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { CardRef, CellKey, GameState, PlayerKey, Zones } from "./types";
import { findInquisitionInCards } from "./inquisitionSummonState";
import { opponentSeat } from "./utils/boardHelpers";

function newAccusationId() {
  return `acc_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type AccusationPhase =
  | "revealing" // Opponent's hand is revealed
  | "selecting" // Caster (or victim if no Evil) selects card to banish
  | "resolving"
  | "complete";

export type PendingAccusation = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: AccusationPhase;
  // The opponent whose hand is revealed
  victimSeat: PlayerKey;
  // The revealed hand (visible to caster during selection)
  revealedHand: CardRef[];
  // Whether caster has choice (if any Evil cards/allies)
  casterHasChoice: boolean;
  // Indices of Evil cards in the revealed hand
  evilCardIndices: number[];
  // Index of selected card to banish
  selectedCardIndex: number | null;
  createdAt: number;
};

export type AccusationSlice = Pick<
  GameState,
  | "pendingAccusation"
  | "beginAccusation"
  | "selectAccusationCard"
  | "resolveAccusation"
  | "cancelAccusation"
>;

export const createAccusationSlice: StateCreator<
  GameState,
  [],
  [],
  AccusationSlice
> = (set, get) => ({
  pendingAccusation: null,

  beginAccusation: async (input) => {
    const id = newAccusationId();
    const casterSeat = input.casterSeat;
    const victimSeat = opponentSeat(casterSeat);
    const zones = get().zones;
    const victimHand = [...(zones[victimSeat]?.hand || [])];

    if (victimHand.length === 0) {
      get().log(
        `[${casterSeat.toUpperCase()}] Accusation: Opponent has no cards in hand`,
      );
      // Move spell to graveyard since it resolves with no effect
      try {
        get().movePermanentToZone(
          input.spell.at,
          input.spell.index,
          "graveyard",
        );
      } catch {}
      return;
    }

    // Fetch card meta to check for Evil cards
    const cardIds = victimHand
      .map((c) => c.cardId)
      .filter((cardId) => Number.isFinite(cardId) && cardId > 0);
    if (cardIds.length > 0) {
      try {
        await get().fetchCardMeta(cardIds);
      } catch {}
    }

    // Check for Evil cards in hand
    // Evil minion types: Demons, Undead, Monsters
    const EVIL_SUBTYPES = ["demon", "undead", "monster"];
    const isEvilSubtype = (subTypes: string) => {
      const lower = subTypes.toLowerCase();
      return EVIL_SUBTYPES.some((evil) => lower.includes(evil));
    };

    // Check hand for Evil cards (use embedded subTypes from CardRef)
    const evilCardIndices: number[] = [];
    for (let i = 0; i < victimHand.length; i++) {
      const card = victimHand[i];
      const subTypes = card.subTypes || "";
      if (isEvilSubtype(subTypes)) {
        evilCardIndices.push(i);
      }
    }

    // Also check for Evil allies on the board
    const permanents = get().permanents;
    let hasEvilAlly = false;
    for (const cell of Object.values(permanents)) {
      if (!Array.isArray(cell)) continue;
      for (const perm of cell) {
        if (perm.owner !== (victimSeat === "p1" ? 1 : 2)) continue;
        const type = (perm.card?.type || "").toLowerCase();
        if (!type.includes("minion")) continue;
        const permSubTypes = perm.card?.subTypes || "";
        if (isEvilSubtype(permSubTypes)) {
          hasEvilAlly = true;
          break;
        }
      }
      if (hasEvilAlly) break;
    }

    // Caster has choice if there are Evil cards or Evil allies
    const casterHasChoice = evilCardIndices.length > 0 || hasEvilAlly;

    console.log("[Accusation] Evil check:", {
      evilCardIndices,
      hasEvilAlly,
      casterHasChoice,
    });

    set({
      pendingAccusation: {
        id,
        spell: input.spell,
        casterSeat,
        phase: "revealing",
        victimSeat,
        revealedHand: victimHand,
        casterHasChoice,
        evilCardIndices,
        selectedCardIndex: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent (they see their hand is revealed)
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "accusationBegin",
          id,
          spell: input.spell,
          casterSeat,
          victimSeat,
          handSize: victimHand.length,
          casterHasChoice,
          evilCardIndices,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${casterSeat.toUpperCase()}] casts Accusation - ${victimSeat.toUpperCase()}'s hand is revealed (${
        victimHand.length
      } cards)`,
    );

    // Check if The Inquisition is in the victim's revealed hand
    // The victim owns it and gets the offer to summon it reactively
    const inqIdx = findInquisitionInCards(victimHand);
    if (inqIdx !== -1) {
      setTimeout(() => {
        try {
          get().offerInquisitionSummon({
            ownerSeat: victimSeat,
            triggerSource: "accusation",
            card: victimHand[inqIdx],
            sourceZone: "hand",
            cardIndex: inqIdx,
          });
        } catch {}
      }, 800);
    }

    // Automatically transition to selecting phase after a brief reveal
    setTimeout(() => {
      const current = get().pendingAccusation;
      if (current?.id === id && current.phase === "revealing") {
        set({
          pendingAccusation: {
            ...current,
            phase: "selecting",
          },
        } as Partial<GameState> as GameState);
      }
    }, 1500);
  },

  selectAccusationCard: (cardIndex: number) => {
    const pending = get().pendingAccusation;
    if (!pending || pending.phase !== "selecting") return;
    if (cardIndex < 0 || cardIndex >= pending.revealedHand.length) return;

    set({
      pendingAccusation: {
        ...pending,
        selectedCardIndex: cardIndex,
      },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "accusationSelectCard",
          id: pending.id,
          cardIndex,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const selectedCard = pending.revealedHand[cardIndex];
    get().log(`Selected ${selectedCard?.name || "card"} to banish`);
  },

  resolveAccusation: () => {
    const pending = get().pendingAccusation;
    if (
      !pending ||
      pending.phase !== "selecting" ||
      pending.selectedCardIndex === null
    )
      return;

    const victimSeat = pending.victimSeat;
    const casterSeat = pending.casterSeat;
    const zones = get().zones;
    const hand = [...(zones[victimSeat]?.hand || [])];
    const banished = [...(zones[victimSeat]?.banished || [])];

    // Remove the selected card from hand and add to banished
    const selectedCard = pending.revealedHand[pending.selectedCardIndex];
    const handIndex = hand.findIndex(
      (c) =>
        c.cardId === selectedCard.cardId &&
        c.slug === selectedCard.slug &&
        c.name === selectedCard.name,
    );

    if (handIndex !== -1) {
      hand.splice(handIndex, 1);
      banished.push(selectedCard);
    }

    // Update local zones (caster's view)
    const zonesNext = {
      ...zones,
      [victimSeat]: {
        ...zones[victimSeat],
        hand,
        banished,
      },
    };

    set({
      zones: zonesNext,
      pendingAccusation: null,
    } as Partial<GameState> as GameState);

    // Send victim zone patch if we are the victim (no Evil case) or in hotseat mode.
    // When the caster resolves (Evil case), the victim handles it via the custom message.
    const actorKey = get().actorKey;
    if (handIndex !== -1 && (actorKey === null || actorKey === victimSeat)) {
      try {
        get().trySendPatch({
          zones: { [victimSeat]: zonesNext[victimSeat] } as Record<
            PlayerKey,
            Zones
          >,
        });
      } catch {}
    }

    // Move spell to graveyard
    try {
      get().movePermanentToZone(
        pending.spell.at,
        pending.spell.index,
        "graveyard",
      );
    } catch {}

    // Broadcast resolution with full card data so victim can update their own zones
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "accusationResolve",
          id: pending.id,
          casterSeat,
          victimSeat,
          selectedCardIndex: pending.selectedCardIndex,
          // Include full card data so victim can add to their banished zone
          selectedCard,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `Accusation resolved: ${
        selectedCard?.name || "card"
      } banished from ${victimSeat.toUpperCase()}'s hand`,
    );
  },

  cancelAccusation: () => {
    const pending = get().pendingAccusation;
    if (!pending) return;

    // Move spell back to hand
    try {
      get().movePermanentToZone(pending.spell.at, pending.spell.index, "hand");
    } catch {}

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "accusationCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log("Accusation cancelled");
    set({ pendingAccusation: null } as Partial<GameState> as GameState);
  },
});
