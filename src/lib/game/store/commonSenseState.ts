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

function newCommonSenseId() {
  return `cs_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type CommonSensePhase = "selecting" | "resolving" | "complete";

export type PendingCommonSense = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: CommonSensePhase;
  // All Ordinary cards in spellbook that can be selected
  eligibleCards: CardRef[];
  // Index of selected card in eligibleCards array
  selectedCardIndex: number | null;
  createdAt: number;
};

export type CommonSenseSlice = Pick<
  GameState,
  | "pendingCommonSense"
  | "beginCommonSense"
  | "selectCommonSenseCard"
  | "resolveCommonSense"
  | "cancelCommonSense"
>;

export const createCommonSenseSlice: StateCreator<
  GameState,
  [],
  [],
  CommonSenseSlice
> = (set, get) => ({
  pendingCommonSense: null,

  beginCommonSense: async (input) => {
    const id = newCommonSenseId();
    const casterSeat = input.casterSeat;
    const zones = get().zones;
    const fullSpellbook = zones[casterSeat]?.spellbook || [];

    // Haystack limits opponent's searches to top 3
    const board = get().board;
    const haystackLimit = getHaystackLimit(casterSeat, board.sites || {});
    const spellbook = haystackLimit
      ? fullSpellbook.slice(0, haystackLimit)
      : fullSpellbook;

    // First, fetch card meta for all spellbook cards to get rarity data
    const cardIds = spellbook
      .map((c) => c.cardId)
      .filter((id) => Number.isFinite(id) && id > 0);
    if (cardIds.length > 0) {
      try {
        await get().fetchCardMeta(cardIds);
      } catch {}
    }

    // Now get the updated meta cache
    const metaByCardId = get().metaByCardId;

    // Find all Ordinary cards in spellbook
    // Note: rarity comes from metaByCardId, not from CardRef directly
    const eligibleCards = spellbook.filter((card: CardRef) => {
      const meta = metaByCardId[card.cardId] as { rarity?: string } | undefined;
      const rarity = (meta?.rarity || "").toLowerCase();
      return rarity === "ordinary";
    });

    if (eligibleCards.length === 0) {
      get().log(
        `[${casterSeat.toUpperCase()}] Common Sense: No Ordinary cards in spellbook`,
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

    set({
      pendingCommonSense: {
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
          type: "commonSenseBegin",
          id,
          spell: input.spell,
          casterSeat,
          eligibleCount: eligibleCards.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${casterSeat.toUpperCase()}] casts Common Sense - searching for Ordinary cards (${
        eligibleCards.length
      } found)`,
    );
  },

  selectCommonSenseCard: (cardIndex) => {
    const pending = get().pendingCommonSense;
    if (!pending || pending.phase !== "selecting") return;
    if (cardIndex < 0 || cardIndex >= pending.eligibleCards.length) return;

    set({
      pendingCommonSense: {
        ...pending,
        selectedCardIndex: cardIndex,
      },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "commonSenseSelectCard",
          id: pending.id,
          cardIndex,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Don't log the specific card name - deck searches are private
    get().log(`Selected a card to put in hand`);
  },

  resolveCommonSense: () => {
    const pending = get().pendingCommonSense;
    if (
      !pending ||
      pending.phase !== "selecting" ||
      pending.selectedCardIndex === null
    )
      return;

    const casterSeat = pending.casterSeat;

    // Check Gard of Eden draw limit
    const canDraw = get().canDrawCard(casterSeat, 1);
    if (!canDraw.allowed) {
      get().log(
        `[${casterSeat.toUpperCase()}] Gard of Eden prevents drawing more cards this turn (limit: 1)`,
      );
      // Cancel instead of resolving
      get().cancelCommonSense();
      return;
    }

    const zones = get().zones;
    const spellbook = [...(zones[casterSeat]?.spellbook || [])];
    const hand = [...(zones[casterSeat]?.hand || [])];

    // Find the selected card in spellbook and remove it
    const selectedCard = pending.eligibleCards[pending.selectedCardIndex];
    const spellbookIndex = spellbook.findIndex(
      (c) =>
        c.cardId === selectedCard.cardId &&
        c.slug === selectedCard.slug &&
        c.name === selectedCard.name,
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

    // Increment cards drawn counter for Gard of Eden tracking
    get().incrementCardsDrawn(casterSeat, 1);

    set({
      zones: zonesNext,
      pendingCommonSense: null,
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
        "graveyard",
      );
    } catch {}

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "commonSenseResolve",
          id: pending.id,
          selectedCardIndex: pending.selectedCardIndex,
          selectedCardName: selectedCard?.name,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `Common Sense resolved: ${
        selectedCard?.name || "card"
      } added to hand, spellbook shuffled`,
    );
  },

  cancelCommonSense: () => {
    const pending = get().pendingCommonSense;
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
          type: "commonSenseCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log("Common Sense cancelled");
    set({ pendingCommonSense: null } as Partial<GameState> as GameState);
  },
});
