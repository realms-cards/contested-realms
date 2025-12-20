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

function newPithImpId() {
  return `pi_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type PithImpPhase = "stealing" | "complete";

export type PendingStolenCard = {
  id: string;
  // The Pith Imp minion that stole the card
  minion: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  // Who played the Pith Imp
  ownerSeat: PlayerKey;
  // The stolen card (random spell from opponent's hand)
  stolenCard: CardRef;
  // Original owner of the stolen card
  victimSeat: PlayerKey;
  createdAt: number;
};

export type PithImpSlice = Pick<
  GameState,
  | "stolenCards"
  | "triggerPithImpGenesis"
  | "returnStolenCard"
  | "getStolenCardsForMinion"
>;

export const createPithImpSlice: StateCreator<
  GameState,
  [],
  [],
  PithImpSlice
> = (set, get) => ({
  stolenCards: [],

  triggerPithImpGenesis: (input: {
    minion: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    ownerSeat: PlayerKey;
  }) => {
    const id = newPithImpId();
    const ownerSeat = input.ownerSeat;
    const victimSeat = ownerSeat === "p1" ? "p2" : "p1";
    const zones = get().zones;
    const victimHand = zones[victimSeat]?.hand || [];

    // Filter to only spells (non-site cards)
    const spellsInHand = victimHand.filter((card) => {
      const type = (card.type || "").toLowerCase();
      return !type.includes("site");
    });

    if (spellsInHand.length === 0) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Pith Imp: ${victimSeat.toUpperCase()} has no spells in hand to steal`
      );
      return;
    }

    // Pick a random spell
    const randomIndex = Math.floor(Math.random() * spellsInHand.length);
    const stolenCard = spellsInHand[randomIndex];

    // Find and remove from victim's hand
    const newVictimHand = [...victimHand];
    const handIndex = newVictimHand.findIndex(
      (c) =>
        c.cardId === stolenCard.cardId &&
        c.slug === stolenCard.slug &&
        c.name === stolenCard.name
    );
    if (handIndex !== -1) {
      newVictimHand.splice(handIndex, 1);
    }

    // Update zones
    const zonesNext = {
      ...zones,
      [victimSeat]: {
        ...zones[victimSeat],
        hand: newVictimHand,
      },
    };

    // Add to stolen cards tracking
    const newStolenEntry: PendingStolenCard = {
      id,
      minion: input.minion,
      ownerSeat,
      stolenCard,
      victimSeat,
      createdAt: Date.now(),
    };

    set((state) => ({
      zones: zonesNext,
      stolenCards: [...state.stolenCards, newStolenEntry],
    })) as unknown as void;

    // Send zone patch
    const zonePatch: ServerPatchT = {
      zones: { [victimSeat]: zonesNext[victimSeat] } as Record<
        PlayerKey,
        Zones
      >,
      stolenCards: [...get().stolenCards],
    };
    get().trySendPatch(zonePatch);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "pithImpSteal",
          id,
          minion: input.minion,
          ownerSeat,
          stolenCardName: stolenCard.name,
          stolenCard,
          victimSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${ownerSeat.toUpperCase()}] Pith Imp steals ${
        stolenCard.name
      } from ${victimSeat.toUpperCase()}'s hand!`
    );
  },

  returnStolenCard: (minionInstanceId: string | null, minionAt: CellKey) => {
    const stolenCards = get().stolenCards;
    const zones = get().zones;

    // Find all stolen cards associated with this minion
    const cardsToReturn = stolenCards.filter(
      (sc) =>
        sc.minion.at === minionAt ||
        (minionInstanceId && sc.minion.instanceId === minionInstanceId)
    );

    if (cardsToReturn.length === 0) return;

    // Return each card to its original owner's hand
    let zonesNext = { ...zones };
    for (const entry of cardsToReturn) {
      const victimHand = [...(zonesNext[entry.victimSeat]?.hand || [])];
      victimHand.push(entry.stolenCard);
      zonesNext = {
        ...zonesNext,
        [entry.victimSeat]: {
          ...zonesNext[entry.victimSeat],
          hand: victimHand,
        },
      };

      get().log(
        `${
          entry.stolenCard.name
        } returns to ${entry.victimSeat.toUpperCase()}'s hand (Pith Imp left the realm)`
      );
    }

    // Remove from stolen cards tracking
    const remainingStolenCards = stolenCards.filter(
      (sc) =>
        sc.minion.at !== minionAt &&
        (!minionInstanceId || sc.minion.instanceId !== minionInstanceId)
    );

    set({
      zones: zonesNext,
      stolenCards: remainingStolenCards,
    } as Partial<GameState> as GameState);

    // Send patch
    const zonePatch: ServerPatchT = {
      zones: zonesNext,
      stolenCards: remainingStolenCards,
    };
    get().trySendPatch(zonePatch);

    // Broadcast return
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "pithImpReturn",
          minionAt,
          minionInstanceId,
          returnedCards: cardsToReturn.map((c) => ({
            cardName: c.stolenCard.name,
            victimSeat: c.victimSeat,
          })),
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  getStolenCardsForMinion: (
    minionInstanceId: string | null,
    minionAt: CellKey
  ): CardRef[] => {
    const stolenCards = get().stolenCards;
    return stolenCards
      .filter(
        (sc) =>
          sc.minion.at === minionAt ||
          (minionInstanceId && sc.minion.instanceId === minionInstanceId)
      )
      .map((sc) => sc.stolenCard);
  },
});
