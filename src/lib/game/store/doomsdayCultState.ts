import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { CellKey, GameState, PlayerKey } from "./types";
import { seatFromOwner } from "./utils/boardHelpers";

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

    // Check if the card is Evil (has Evil subtype) - use embedded CardRef data
    const subTypes = (topCard.subTypes || "").toLowerCase();

    // Check for Evil subtype
    const isEvil = subTypes.includes("evil");

    if (!isEvil) {
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

    set({ zones: zonesNext } as Partial<GameState> as GameState);

    // Send patch - send full zones for seat to prevent partial patch issues
    get().trySendPatch({
      zones: {
        [playerKey]: zonesNext[playerKey],
      } as GameState["zones"],
    });

    get().log(
      `[${playerKey.toUpperCase()}] Casts ${
        card.name
      } from spellbook top (Doomsday Cult)`,
    );

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

    // The card needs to be played/cast - return the card so the caller can handle it
    // This integrates with the existing casting system
    return card;
  },
});
