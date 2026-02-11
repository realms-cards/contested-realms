import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { GameState, PlayerKey, ServerPatchT, Zones } from "./types";

function newBrowseId() {
  return `browse_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type BrowseSlice = Pick<
  GameState,
  | "pendingBrowse"
  | "beginBrowse"
  | "selectBrowseCard"
  | "setBrowseBottomOrder"
  | "resolveBrowse"
  | "cancelBrowse"
>;

export const createBrowseSlice: StateCreator<GameState, [], [], BrowseSlice> = (
  set,
  get,
) => ({
  pendingBrowse: null,

  beginBrowse: (input) => {
    const id = newBrowseId();
    const casterSeat = input.casterSeat;
    const zones = get().zones;
    const spellbook = zones[casterSeat]?.spellbook || [];

    // Take up to 7 cards from the top of spellbook
    // Note: Browse is NOT a search (it says "Look at"), so Haystack does not apply
    const revealedCards = spellbook.slice(0, 7);

    if (revealedCards.length === 0) {
      get().log(
        `[${casterSeat.toUpperCase()}] Browse: No spells in spellbook to reveal`,
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
      pendingBrowse: {
        id,
        spell: input.spell,
        casterSeat,
        phase: "viewing",
        revealedCards,
        selectedCardIndex: null,
        bottomOrder: [],
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "browseBegin",
          id,
          spell: input.spell,
          casterSeat,
          revealedCount: revealedCards.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${casterSeat.toUpperCase()}] casts Browse - looking at ${
        revealedCards.length
      } spell${revealedCards.length !== 1 ? "s" : ""}`,
    );
  },

  selectBrowseCard: (cardIndex) => {
    const pending = get().pendingBrowse;
    if (!pending || pending.phase !== "viewing") return;
    if (cardIndex < 0 || cardIndex >= pending.revealedCards.length) return;

    // Build default bottom order (all cards except selected, in original order)
    const bottomOrder = pending.revealedCards
      .map((_, i) => i)
      .filter((i) => i !== cardIndex);

    set({
      pendingBrowse: {
        ...pending,
        selectedCardIndex: cardIndex,
        bottomOrder,
        phase: "ordering",
      },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "browseSelectCard",
          id: pending.id,
          cardIndex,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Don't log the specific card name - deck searches are private
    get().log(`Selected a card to put in hand`);
  },

  setBrowseBottomOrder: (order) => {
    const pending = get().pendingBrowse;
    if (!pending || pending.phase !== "ordering") return;

    // Validate order contains all indices except selectedCardIndex
    const expectedIndices = pending.revealedCards
      .map((_, i) => i)
      .filter((i) => i !== pending.selectedCardIndex);

    if (order.length !== expectedIndices.length) return;
    const orderSet = new Set(order);
    if (!expectedIndices.every((i) => orderSet.has(i))) return;
    set({
      pendingBrowse: {
        ...pending,
        bottomOrder: order,
      },
    } as Partial<GameState> as GameState);

    // Broadcast order change
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "browseSetOrder",
          id: pending.id,
          order,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveBrowse: () => {
    const pending = get().pendingBrowse;
    if (
      !pending ||
      pending.phase !== "ordering" ||
      pending.selectedCardIndex === null
    )
      return;

    const casterSeat = pending.casterSeat;

    // Check Garden of Eden draw limit
    const canDraw = get().canDrawCard(casterSeat, 1);
    if (!canDraw.allowed) {
      get().log(
        `[${casterSeat.toUpperCase()}] Garden of Eden prevents drawing more cards this turn (limit: 1)`,
      );
      // Cancel the Browse instead of resolving
      get().cancelBrowse();
      return;
    }

    const zones = get().zones;
    const spellbook = [...(zones[casterSeat]?.spellbook || [])];
    const hand = [...(zones[casterSeat]?.hand || [])];

    // Remove the revealed cards from spellbook (they were at the top)
    const revealedCount = pending.revealedCards.length;
    spellbook.splice(0, revealedCount);

    // Put the selected card in hand
    const selectedCard = pending.revealedCards[pending.selectedCardIndex];
    if (selectedCard) {
      hand.push(selectedCard);
    }

    // Put the rest on the bottom of spellbook in the specified order
    // Last in the UI order = very bottom of spellbook (drawn last among bottom cards)
    const bottomCards = pending.bottomOrder.map(
      (i) => pending.revealedCards[i],
    );
    spellbook.push(...bottomCards);

    // Update zones
    const zonesNext = {
      ...zones,
      [casterSeat]: {
        ...zones[casterSeat],
        spellbook,
        hand,
      },
    };

    // Increment cards drawn counter for Garden of Eden tracking
    get().incrementCardsDrawn(casterSeat, 1);

    set({
      zones: zonesNext,
      pendingBrowse: null,
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
          type: "browseResolve",
          id: pending.id,
          selectedCardIndex: pending.selectedCardIndex,
          bottomOrder: pending.bottomOrder,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `Browse resolved: ${selectedCard?.name || "card"} added to hand, ${
        bottomCards.length
      } card${bottomCards.length !== 1 ? "s" : ""} to bottom of spellbook`,
    );
  },

  cancelBrowse: () => {
    const pending = get().pendingBrowse;
    if (!pending) return;

    // Put revealed cards back on top of spellbook in original order
    const casterSeat = pending.casterSeat;
    const zones = get().zones;
    const spellbook = [...(zones[casterSeat]?.spellbook || [])];

    // Remove the revealed cards that were taken (they're still at top)
    spellbook.splice(0, pending.revealedCards.length);
    // Put them back in original order
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
      pendingBrowse: null,
    } as Partial<GameState> as GameState);

    // Move spell back to hand
    try {
      get().movePermanentToZone(pending.spell.at, pending.spell.index, "hand");
    } catch {}

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "browseCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log("Browse cancelled");
  },
});
