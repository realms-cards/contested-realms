import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { GameState, PlayerKey, Zones } from "./types";
import { findInquisitionInCards } from "./inquisitionSummonState";
import { opponentSeat } from "./utils/boardHelpers";

function newInquisitionId() {
  return `inq_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type InquisitionSlice = Pick<
  GameState,
  | "pendingInquisition"
  | "beginInquisition"
  | "selectInquisitionCard"
  | "resolveInquisition"
  | "skipInquisition"
  | "cancelInquisition"
>;

export const createInquisitionSlice: StateCreator<
  GameState,
  [],
  [],
  InquisitionSlice
> = (set, get) => ({
  pendingInquisition: null,

  beginInquisition: (input) => {
    const id = newInquisitionId();
    const casterSeat = input.casterSeat;
    const victimSeat = opponentSeat(casterSeat);
    const zones = get().zones;
    const victimHand = [...(zones[victimSeat]?.hand || [])];

    if (victimHand.length === 0) {
      get().log(
        `[${casterSeat.toUpperCase()}] The Inquisition: Opponent has no cards in hand`,
      );
      return;
    }

    set({
      pendingInquisition: {
        id,
        minion: input.minion,
        casterSeat,
        phase: "revealing",
        victimSeat,
        revealedHand: victimHand,
        selectedCardIndex: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "inquisitionBegin",
          id,
          minion: input.minion,
          casterSeat,
          victimSeat,
          handSize: victimHand.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${casterSeat.toUpperCase()}] The Inquisition Genesis - ${victimSeat.toUpperCase()}'s hand is revealed (${
        victimHand.length
      } cards)`,
    );

    // Check if The Inquisition is in the victim's revealed hand
    const inqIdx = findInquisitionInCards(victimHand);
    if (inqIdx !== -1) {
      setTimeout(() => {
        try {
          get().offerInquisitionSummon({
            ownerSeat: victimSeat,
            triggerSource: "inquisition",
            card: victimHand[inqIdx],
            sourceZone: "hand",
            cardIndex: inqIdx,
          });
        } catch {}
      }, 800);
    }

    // Auto-transition to selecting phase after a brief reveal
    setTimeout(() => {
      const current = get().pendingInquisition;
      if (current?.id === id && current.phase === "revealing") {
        set({
          pendingInquisition: {
            ...current,
            phase: "selecting",
          },
        } as Partial<GameState> as GameState);
      }
    }, 1500);
  },

  selectInquisitionCard: (cardIndex: number) => {
    const pending = get().pendingInquisition;
    if (!pending || pending.phase !== "selecting") return;
    if (cardIndex < 0 || cardIndex >= pending.revealedHand.length) return;

    set({
      pendingInquisition: {
        ...pending,
        selectedCardIndex: cardIndex,
      },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "inquisitionSelectCard",
          id: pending.id,
          cardIndex,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const selectedCard = pending.revealedHand[cardIndex];
    get().log(`Selected ${selectedCard?.name || "card"} to banish`);
  },

  resolveInquisition: () => {
    const pending = get().pendingInquisition;
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

    // Update zones — always send the FULL seat object to avoid partial-patch data loss
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
      pendingInquisition: null,
    } as Partial<GameState> as GameState);

    // Send victim zone patch only in hotseat mode (actorKey === null).
    // In online mode the victim handles zone updates via the inquisitionResolve message handler.
    const actorKey = get().actorKey;
    if (handIndex !== -1 && actorKey === null) {
      try {
        get().trySendPatch({
          zones: { [victimSeat]: zonesNext[victimSeat] } as Record<
            PlayerKey,
            Zones
          >,
        });
      } catch {}
    }

    // Broadcast resolution with full card data so victim can update their own zones
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "inquisitionResolve",
          id: pending.id,
          casterSeat,
          victimSeat,
          selectedCardIndex: pending.selectedCardIndex,
          selectedCard,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `The Inquisition resolved: ${
        selectedCard?.name || "card"
      } banished from ${victimSeat.toUpperCase()}'s hand`,
    );
  },

  skipInquisition: () => {
    const pending = get().pendingInquisition;
    if (!pending) return;

    // Broadcast skip
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "inquisitionSkip",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${pending.casterSeat.toUpperCase()}] The Inquisition: chose not to banish a card`,
    );
    set({ pendingInquisition: null } as Partial<GameState> as GameState);
  },

  cancelInquisition: () => {
    const pending = get().pendingInquisition;
    if (!pending) return;

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "inquisitionCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log("The Inquisition cancelled");
    set({ pendingInquisition: null } as Partial<GameState> as GameState);
  },
});
