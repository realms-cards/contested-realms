import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PiracyGrant,
  PlayerKey,
  ServerPatchT,
} from "./types";
import { opponentSeat } from "./utils/boardHelpers";
import { ensureCardInstanceId } from "./utils/cardHelpers";
import { createPermanentsPatch } from "./utils/patchHelpers";
import { triggerCardResolvers } from "./utils/resolverTriggers";
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
  | "pendingPiracy"
  | "triggerPiracy"
  | "dismissPiracy"
  | "piracyGrants"
  | "castFromPiracyGrant"
>;

export const createSeaRaiderSlice: StateCreator<
  GameState,
  [],
  [],
  SeaRaiderSlice
> = (set, get) => ({
  pendingPiracy: null,
  piracyGrants: [],

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

    // Every discarded card needs a stable instanceId: the grant that lets the
    // attacker cast it later identifies the exact copy in the cemetery.
    const discardedCards = defenderSpellbook
      .splice(0, actualCount)
      .map((c) => ensureCardInstanceId(c) ?? c);

    // Discarded cards go to the defender's cemetery.
    const defenderGraveyard = [
      ...(zones[defenderSeat]?.graveyard || []),
      ...discardedCards,
    ];

    // "You may cast each of those spells once this turn, ignoring threshold
    // requirements." Record one grant per discarded card for the attacker.
    const turn = get().turn;
    const newGrants: PiracyGrant[] = discardedCards
      .filter((c) => !!c.instanceId)
      .map((c, i) => ({
        id: `${id}_${i}`,
        instanceId: c.instanceId as string,
        card: c,
        granteeSeat: attackerSeat,
        fromSeat: defenderSeat,
        turn,
        used: false,
        sourceName: source.card.name,
      }));
    const piracyGrantsNext = [...get().piracyGrants, ...newGrants];

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
      piracyGrants: piracyGrantsNext,
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
      zonePatch.piracyGrants = piracyGrantsNext;
      get().trySendPatch(zonePatch);
    } else {
      get().trySendPatch({ piracyGrants: piracyGrantsNext });
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

  /**
   * Cast a spell that piracy left in the defender's cemetery.
   *
   * "You may cast each of those spells once this turn, ignoring threshold
   * requirements." Mana is still paid; only the threshold check is waived,
   * which is implicit here because this path never evaluates thresholds.
   *
   * The card belongs to the defender, so the permanent enters under the
   * grantee's control (`owner`) but keeps `originalOwnerSeat` pointing at the
   * defender — that is what `movePermanentToZone` uses to route it back to the
   * right cemetery when it dies.
   */
  castFromPiracyGrant: (
    grantId: string,
    targetTile: { x: number; y: number },
  ) => {
    const state = get();
    const grant = state.piracyGrants.find((g) => g.id === grantId);
    if (!grant) return;

    if (grant.used) {
      get().log(`${grant.card.name} has already been cast this turn`);
      return;
    }
    if (grant.turn !== state.turn) {
      get().log(`${grant.sourceName}: ${grant.card.name} can no longer be cast`);
      return;
    }
    const actorKey = state.actorKey;
    if (actorKey !== null && actorKey !== grant.granteeSeat) return;

    // Locate the exact copy in the defender's cemetery.
    const zones = state.zones;
    const fromGraveyard = [...(zones[grant.fromSeat]?.graveyard || [])];
    const cardIndex = fromGraveyard.findIndex(
      (c) => c.instanceId === grant.instanceId,
    );
    if (cardIndex === -1) {
      get().log(
        `${grant.card.name} is no longer in ${grant.fromSeat.toUpperCase()}'s cemetery`,
      );
      return;
    }
    const [cardToCast] = fromGraveyard.splice(cardIndex, 1);

    // Pay mana. Thresholds are deliberately NOT checked.
    const manaCost = cardToCast.cost ?? 0;
    if (manaCost > 0) {
      const availableMana = get().getAvailableMana(grant.granteeSeat);
      if (availableMana < manaCost) {
        get().log(
          `Not enough mana to cast ${cardToCast.name} (need ${manaCost}, have ${availableMana})`,
        );
        return;
      }
    }

    const targetCell = `${targetTile.x},${targetTile.y}` as CellKey;
    const ownerNum: 1 | 2 = grant.granteeSeat === "p1" ? 1 : 2;
    const permanents = get().permanents;
    const cellPerms = [...(permanents[targetCell] || [])];
    const instanceId = `piracy_cast_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const newPermanent = {
      card: { ...cardToCast, instanceId },
      owner: ownerNum,
      instanceId,
      // The card is still the defender's: send it to their cemetery on death.
      originalOwnerSeat: grant.fromSeat,
      tapped: false,
      tapVersion: 0,
      version: 0,
      damage: 0,
      summoningSickness: true,
      attachedTo: null,
    };
    cellPerms.push(newPermanent);

    const zonesNext = {
      ...zones,
      [grant.fromSeat]: {
        ...zones[grant.fromSeat],
        graveyard: fromGraveyard,
      },
    } as GameState["zones"];

    const piracyGrantsNext = state.piracyGrants.map((g) =>
      g.id === grantId ? { ...g, used: true } : g,
    );

    set({
      zones: zonesNext,
      permanents: { ...permanents, [targetCell]: cellPerms },
      piracyGrants: piracyGrantsNext,
    } as Partial<GameState> as GameState);

    if (manaCost > 0) {
      get().addMana(grant.granteeSeat, -manaCost);
    }

    const patch: ServerPatchT = {
      ...createPermanentsPatch(
        { ...permanents, [targetCell]: cellPerms },
        targetCell,
      ),
      piracyGrants: piracyGrantsNext,
    };
    const zonePatch = createZonesPatchFor(zonesNext, grant.fromSeat);
    if (zonePatch?.zones) {
      patch.zones = zonePatch.zones;
      // The grantee is not the cemetery's owner, so this write must be
      // explicitly allowed or the server strips it.
      (patch as Record<string, unknown>).__allowZoneSeats = [grant.fromSeat];
    }
    get().trySendPatch(patch);

    get().log(
      `[${grant.granteeSeat.toUpperCase()}] casts ${cardToCast.name} from ${grant.fromSeat.toUpperCase()}'s cemetery via ${grant.sourceName} (ignoring threshold)`,
    );

    // No custom message is needed: the board/zone change rides on the patch
    // above and the log line reaches the opponent through synced events.

    // Run the card's own resolver (magic cast flow, genesis abilities, ...).
    triggerCardResolvers({
      card: newPermanent.card as CardRef,
      key: targetCell,
      permanentIndex: cellPerms.length - 1,
      instanceId,
      owner: ownerNum,
      ownerSeat: grant.granteeSeat,
      get,
    });
  },

  dismissPiracy: () => {
    const pending = get().pendingPiracy;
    if (!pending) return;

    set({
      pendingPiracy: null,
    } as Partial<GameState> as GameState);
  },
});
