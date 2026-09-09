import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { CardRef, CellKey, GameState, PlayerKey } from "./types";
import { seatFromOwner } from "./utils/boardHelpers";
import { isEvilCard } from "./utils/cardHelpers";
import { triggerCardResolvers } from "./utils/resolverTriggers";

// Doomsday Cult continuous effect:
// - Both players play with top spellbook card revealed
// - Players may cast Evil from top of spellbook at Doomsday Cult's location

export type DoomsdayCultSlice = Pick<
  GameState,
  | "getActiveDoomsdayCults"
  | "isDoomsdayCultActive"
  | "getRevealedSpellbookTop"
  | "canCastFromSpellbookTop"
  | "castFromSpellbookTop"
>;

const DOOMSDAY_CULT_NAME = "Doomsday Cult";

export const createDoomsdayCultSlice: StateCreator<
  GameState,
  [],
  [],
  DoomsdayCultSlice
> = (set, get) => ({
  // Find all active Doomsday Cult minions on the battlefield
  getActiveDoomsdayCults: () => {
    const permanents = get().permanents;
    const cults: Array<{ at: CellKey; owner: PlayerKey; index: number }> = [];

    for (const [cellKey, cellPerms] of Object.entries(permanents)) {
      cellPerms.forEach((perm, idx) => {
        if (perm.card.name === DOOMSDAY_CULT_NAME && !perm.faceDown) {
          cults.push({
            at: cellKey as CellKey,
            owner: seatFromOwner(perm.owner),
            index: idx,
          });
        }
      });
    }

    return cults;
  },

  // Check if any Doomsday Cult is active on the battlefield
  isDoomsdayCultActive: () => {
    const permanents = get().permanents;

    for (const cellPerms of Object.values(permanents)) {
      for (const perm of cellPerms) {
        if (perm.card.name === DOOMSDAY_CULT_NAME && !perm.faceDown) {
          return true;
        }
      }
    }

    return false;
  },

  // Get the revealed top card of a player's spellbook (when Doomsday Cult is active)
  getRevealedSpellbookTop: (playerKey: PlayerKey) => {
    if (!get().isDoomsdayCultActive()) {
      return null;
    }

    const zones = get().zones;
    const spellbook = zones[playerKey]?.spellbook || [];

    if (spellbook.length === 0) {
      return null;
    }

    return spellbook[0];
  },

  // Check if a player can cast a specific card from spellbook top at a location
  canCastFromSpellbookTop: (playerKey: PlayerKey, targetCell: CellKey) => {
    const cults = get().getActiveDoomsdayCults();

    // Must have at least one Doomsday Cult on the field
    if (cults.length === 0) {
      return { canCast: false, reason: "No Doomsday Cult active" };
    }

    // Check if target cell has a Doomsday Cult
    const cultAtTarget = cults.find((c) => c.at === targetCell);
    if (!cultAtTarget) {
      return {
        canCast: false,
        reason: "Must cast at Doomsday Cult's location",
      };
    }

    // Get top spellbook card
    const zones = get().zones;
    const spellbook = zones[playerKey]?.spellbook || [];

    if (spellbook.length === 0) {
      return { canCast: false, reason: "Spellbook is empty" };
    }

    const topCard = spellbook[0];

    // "Evil" is the Demon/Undead/Monster subtype group, not a literal subtype.
    if (!isEvilCard(topCard)) {
      return { canCast: false, reason: "Top card is not Evil" };
    }

    return { canCast: true, card: topCard };
  },

  // Cast the top spellbook card at the Doomsday Cult's location
  castFromSpellbookTop: (playerKey: PlayerKey, targetCell: CellKey) => {
    const check = get().canCastFromSpellbookTop(playerKey, targetCell);

    if (!check.canCast || !check.card) {
      get().log(
        `[${playerKey.toUpperCase()}] Cannot cast from spellbook: ${
          check.reason
        }`,
      );
      return false;
    }

    const card = check.card;
    const zones = get().zones;
    const spellbook = [...(zones[playerKey]?.spellbook || [])];

    // Remove card from top of spellbook
    spellbook.shift();

    // Update zones
    const zonesNext = {
      ...zones,
      [playerKey]: { ...zones[playerKey], spellbook },
    };

    // Pay the card's mana cost, as for any other cast.
    const manaCost = card.cost ?? 0;
    if (manaCost > 0) {
      const availableMana = get().getAvailableMana(playerKey);
      if (availableMana < manaCost) {
        get().log(
          `[${playerKey.toUpperCase()}] Not enough mana to cast ${card.name} (need ${manaCost}, have ${availableMana})`,
        );
        return false;
      }
    }

    // Place the card on the board at the Doomsday Cult's location. Without
    // this the card was only removed from the spellbook and never entered
    // play, so it vanished from the game.
    const owner = playerKey === "p1" ? 1 : 2;
    const permanents = get().permanents;
    const arr = [...(permanents[targetCell] || [])];
    const newPermanent = {
      card,
      owner: owner as 1 | 2,
      instanceId: `doomsday_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      tapped: false,
      attachedTo: null,
    };
    arr.push(newPermanent);

    set({
      zones: zonesNext,
      permanents: { ...permanents, [targetCell]: arr },
    } as Partial<GameState> as GameState);

    if (manaCost > 0) {
      get().addMana(playerKey, -manaCost);
    }

    // Send only the caster's own zones and the affected permanents cell.
    get().trySendPatch({
      zones: {
        [playerKey]: zonesNext[playerKey],
      } as GameState["zones"],
      permanents: { [targetCell]: arr } as GameState["permanents"],
    });

    get().log(
      `[${playerKey.toUpperCase()}] Casts ${
        card.name
      } from spellbook top (Doomsday Cult)`,
    );

    // Run the card's own resolver (genesis abilities, spell flows, etc.)
    triggerCardResolvers({
      card: card as CardRef,
      key: targetCell,
      permanentIndex: arr.length - 1,
      instanceId: newPermanent.instanceId,
      owner: owner as 1 | 2,
      ownerSeat: playerKey,
      get,
    });

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "doomsdayCultCast",
          playerKey,
          cardName: card.name,
          targetCell,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    return card;
  },
});
