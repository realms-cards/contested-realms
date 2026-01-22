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

function newCallToWarId() {
  return `ctw_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type CallToWarPhase = "loading" | "selecting" | "resolving" | "complete";

export type PendingCallToWar = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: CallToWarPhase;
  // All Exceptional Mortal cards in spellbook that can be selected
  eligibleCards: CardRef[];
  // Index of selected card in eligibleCards array
  selectedCardIndex: number | null;
  createdAt: number;
};

export type CallToWarSlice = Pick<
  GameState,
  | "pendingCallToWar"
  | "beginCallToWar"
  | "selectCallToWarCard"
  | "resolveCallToWar"
  | "cancelCallToWar"
>;

export const createCallToWarSlice: StateCreator<
  GameState,
  [],
  [],
  CallToWarSlice
> = (set, get) => ({
  pendingCallToWar: null,

  beginCallToWar: async (input) => {
    const id = newCallToWarId();
    const casterSeat = input.casterSeat;
    const zones = get().zones;
    const fullSpellbook = zones[casterSeat]?.spellbook || [];

    // Haystack limits opponent's searches to top 3
    const board = get().board;
    const haystackLimit = getHaystackLimit(casterSeat, board.sites || {});
    const spellbook = haystackLimit
      ? fullSpellbook.slice(0, haystackLimit)
      : fullSpellbook;

    // Show loading state immediately
    set({
      pendingCallToWar: {
        id,
        spell: input.spell,
        casterSeat,
        phase: "loading",
        eligibleCards: [],
        selectedCardIndex: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Fetch card meta for all spellbook cards to get rarity and type data
    const cardIds = spellbook
      .map((c) => c.cardId)
      .filter((cardId) => Number.isFinite(cardId) && cardId > 0);
    if (cardIds.length > 0) {
      try {
        await get().fetchCardMeta(cardIds);
      } catch {}
    }

    // Now get the updated meta cache
    const metaByCardId = get().metaByCardId;

    // Find all Exceptional Mortal cards in spellbook
    // Rarity = "Exceptional", Type/subTypes includes "Mortal"
    const eligibleCards = spellbook.filter((card: CardRef) => {
      const meta = metaByCardId[card.cardId] as
        | {
            rarity?: string;
            type?: string;
            subTypes?: string;
          }
        | undefined;
      const rarity = (meta?.rarity || "").toLowerCase();
      const type = (meta?.type || "").toLowerCase();
      const subTypes = (meta?.subTypes || "").toLowerCase();

      // Must be Exceptional rarity and Mortal type/subtype
      const isExceptional = rarity === "exceptional";
      const isMortal =
        type.includes("mortal") ||
        subTypes.includes("mortal") ||
        type === "minion"; // Minions with Mortal subtype

      // For minions, check subTypes for "Mortal"
      const isMinion = type === "minion";
      const hasMortalSubtype = subTypes.includes("mortal");

      return isExceptional && (isMinion ? hasMortalSubtype : isMortal);
    });

    if (eligibleCards.length === 0) {
      get().log(
        `[${casterSeat.toUpperCase()}] Call to War: No Exceptional Mortal cards in spellbook`
      );
      // Move spell to graveyard since it resolves with no effect
      set({ pendingCallToWar: null } as Partial<GameState> as GameState);
      try {
        get().movePermanentToZone(
          input.spell.at,
          input.spell.index,
          "graveyard"
        );
      } catch {}
      return;
    }

    // Update with eligible cards
    set({
      pendingCallToWar: {
        id,
        spell: input.spell,
        casterSeat,
        phase: "selecting",
        eligibleCards,
        selectedCardIndex: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "callToWarBegin",
          id,
          spell: input.spell,
          casterSeat,
          eligibleCount: eligibleCards.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${casterSeat.toUpperCase()}] casts Call to War - searching for Exceptional Mortals (${
        eligibleCards.length
      } found)`
    );
  },

  selectCallToWarCard: (cardIndex) => {
    const pending = get().pendingCallToWar;
    if (!pending || pending.phase !== "selecting") return;
    if (cardIndex < 0 || cardIndex >= pending.eligibleCards.length) return;

    set({
      pendingCallToWar: {
        ...pending,
        selectedCardIndex: cardIndex,
      },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "callToWarSelectCard",
          id: pending.id,
          cardIndex,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Don't log the specific card name - deck searches are private
    get().log(`Selected a card to put in hand`);
  },

  resolveCallToWar: () => {
    const pending = get().pendingCallToWar;
    if (
      !pending ||
      pending.phase !== "selecting" ||
      pending.selectedCardIndex === null
    )
      return;

    const casterSeat = pending.casterSeat;
    const zones = get().zones;
    const spellbook = [...(zones[casterSeat]?.spellbook || [])];
    const hand = [...(zones[casterSeat]?.hand || [])];

    // Find the selected card in spellbook and remove it
    const selectedCard = pending.eligibleCards[pending.selectedCardIndex];
    const spellbookIndex = spellbook.findIndex(
      (c) =>
        c.cardId === selectedCard.cardId &&
        c.slug === selectedCard.slug &&
        c.name === selectedCard.name
    );

    if (spellbookIndex !== -1) {
      spellbook.splice(spellbookIndex, 1);
      hand.push(selectedCard);
    }

    // Shuffle the spellbook
    for (let i = spellbook.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spellbook[i], spellbook[j]] = [spellbook[j], spellbook[i]];
    }

    // Update zones
    const zonesNext = {
      ...zones,
      [casterSeat]: {
        ...zones[casterSeat],
        spellbook,
        hand,
      },
    };

    set({
      zones: zonesNext,
      pendingCallToWar: null,
    } as Partial<GameState> as GameState);

    // Send zone patch
    const zonePatch: ServerPatchT = {
      zones: { [casterSeat]: zonesNext[casterSeat] } as Record<
        PlayerKey,
        Zones
      >,
    };
    get().trySendPatch(zonePatch);

    // Move spell to graveyard
    try {
      get().movePermanentToZone(
        pending.spell.at,
        pending.spell.index,
        "graveyard"
      );
    } catch {}

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "callToWarResolve",
          id: pending.id,
          selectedCardIndex: pending.selectedCardIndex,
          selectedCardName: selectedCard?.name,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `Call to War resolved: ${
        selectedCard?.name || "card"
      } added to hand, spellbook shuffled`
    );
  },

  cancelCallToWar: () => {
    const pending = get().pendingCallToWar;
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
          type: "callToWarCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log("Call to War cancelled");
    set({ pendingCallToWar: null } as Partial<GameState> as GameState);
  },
});
