import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { CardRef, CellKey, GameState, PlayerKey } from "./types";
import { opponentSeat } from "./utils/boardHelpers";
import { createZonesPatchFor } from "./utils/zoneHelpers";

function newPiracyId() {
  return `piracy_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

// --- Types ---------------------------------------------------------------

export type PiracyPhase =
  | "revealing" // Showing discarded cards to both players
  | "complete"; // Done

export type PendingPiracy = {
  id: string;
  /** The minion that triggered the ability */
  source: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  /** Owner of the attacking minion */
  attackerSeat: PlayerKey;
  /** Opponent whose spellbook is discarded */
  defenderSeat: PlayerKey;
  /** How many cards to discard from top of spellbook */
  discardCount: number;
  /** The cards that were discarded (revealed to both players) */
  discardedCards: CardRef[];
  phase: PiracyPhase;
  createdAt: number;
};

// --- Slice ---------------------------------------------------------------

export type SeaRaiderSlice = Pick<
  GameState,
  "pendingPiracy" | "triggerPiracy" | "dismissPiracy"
>;

export const createSeaRaiderSlice: StateCreator<
  GameState,
  [],
  [],
  SeaRaiderSlice
> = (set, get) => ({
  pendingPiracy: null,

  /**
   * Trigger the piracy ability for Captain Baldassare or Sea Raider.
   *
   * Captain Baldassare: discards 3 spells from defender's spellbook.
   * Sea Raider: discards 1 spell from defender's spellbook.
   *
   * Discarded cards go to the defender's graveyard and are revealed
   * to both players. Casting them is handled manually by the players.
   */
  triggerPiracy: (input: {
    source: {
      at: CellKey;
      index: number;
      instanceId: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    attackerSeat: PlayerKey;
    discardCount: number;
  }) => {
    const id = newPiracyId();
    const { source, attackerSeat, discardCount } = input;
    const defenderSeat = opponentSeat(attackerSeat);
    const zones = get().zones;
    const defenderSpellbook = [...(zones[defenderSeat]?.spellbook || [])];

    // Take cards from top of spellbook
    const actualCount = Math.min(discardCount, defenderSpellbook.length);
    if (actualCount === 0) {
      get().log(
        `[${attackerSeat.toUpperCase()}] ${source.card.name}: Opponent's spellbook is empty — no cards to discard.`,
      );
      return;
    }

    const discardedCards = defenderSpellbook.splice(0, actualCount);

    // Move discarded cards to top of defender's graveyard
    const defenderGraveyard = [
      ...discardedCards,
      ...(zones[defenderSeat]?.graveyard || []),
    ];

    // Build updated zones
    const zonesNext = {
      ...zones,
      [defenderSeat]: {
        ...zones[defenderSeat],
        spellbook: defenderSpellbook,
        graveyard: defenderGraveyard,
      },
    } as GameState["zones"];

    // Update state
    set({
      zones: zonesNext,
      pendingPiracy: {
        id,
        source,
        attackerSeat,
        defenderSeat,
        discardCount,
        discardedCards,
        phase: "revealing",
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Send zone patch (include defender's zones with __allowZoneSeats)
    const zonePatch = createZonesPatchFor(zonesNext, defenderSeat);
    if (zonePatch) {
      (zonePatch as Record<string, unknown>).__allowZoneSeats = [defenderSeat];
      get().trySendPatch(zonePatch);
    }

    // Log
    const cardNames = discardedCards.map((c) => c.name).join(", ");
    get().log(
      `[${attackerSeat.toUpperCase()}] ${source.card.name} piracy: Discarded ${actualCount} spell(s) from ${defenderSeat.toUpperCase()}'s spellbook to cemetery — ${cardNames}. May cast them this turn (ignoring threshold).`,
    );

    // Broadcast to opponent via custom message
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "piracyTrigger",
          id,
          sourceName: source.card.name,
          attackerSeat,
          defenderSeat,
          discardedCards,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {
        /* swallow transport errors */
      }
    }

    // Show reveal overlay so both players see the discarded cards
    get().openRevealOverlay(
      `${source.card.name} — Piracy`,
      discardedCards,
      attackerSeat,
    );
  },

  dismissPiracy: () => {
    const pending = get().pendingPiracy;
    if (!pending) return;

    set({
      pendingPiracy: null,
    } as Partial<GameState> as GameState);
  },
});
