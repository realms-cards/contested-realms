import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  FeastForCrowsMatch,
  GameState,
  PlayerKey,
  Zones,
} from "./types";
import { getHaystackLimit, opponentSeat } from "./utils/boardHelpers";

function newFeastId() {
  return `ffc_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type FeastForCrowsSlice = Pick<
  GameState,
  | "pendingFeastForCrows"
  | "beginFeastForCrows"
  | "nameFeastForCrows"
  | "resolveFeastForCrows"
  | "cancelFeastForCrows"
>;

export const createFeastForCrowsSlice: StateCreator<
  GameState,
  [],
  [],
  FeastForCrowsSlice
> = (set, get) => ({
  pendingFeastForCrows: null,

  beginFeastForCrows: (input) => {
    const id = newFeastId();
    const casterSeat = input.casterSeat;
    const victimSeat = opponentSeat(casterSeat);

    set({
      pendingFeastForCrows: {
        id,
        spell: input.spell,
        casterSeat,
        phase: "naming",
        victimSeat,
        namedCardName: null,
        namedCardSlug: null,
        revealedHand: [],
        revealedSpellbook: [],
        revealedGraveyard: [],
        matches: [],
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "feastForCrowsBegin",
          id,
          spell: input.spell,
          casterSeat,
          victimSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${casterSeat.toUpperCase()}] casts Feast for Crows — naming a spell...`,
    );
  },

  nameFeastForCrows: (cardName: string, cardSlug: string) => {
    const pending = get().pendingFeastForCrows;
    if (!pending || pending.phase !== "naming") return;

    const casterSeat = pending.casterSeat;
    const victimSeat = pending.victimSeat;
    const zones = get().zones;

    // Get opponent's zones
    const victimHand = [...(zones[victimSeat]?.hand || [])];
    const fullSpellbook = [...(zones[victimSeat]?.spellbook || [])];
    const victimGraveyard = [...(zones[victimSeat]?.graveyard || [])];

    // Apply Haystack restriction to spellbook search
    const board = get().board;
    const haystackLimit = getHaystackLimit(casterSeat, board.sites || {});
    const victimSpellbook = haystackLimit
      ? fullSpellbook.slice(0, haystackLimit)
      : fullSpellbook;

    // Find matching cards by name (case-insensitive)
    const nameLower = cardName.toLowerCase();
    const matches: FeastForCrowsMatch[] = [];

    victimHand.forEach((card, index) => {
      if ((card.name || "").toLowerCase() === nameLower) {
        matches.push({ zone: "hand", index, card });
      }
    });

    victimSpellbook.forEach((card, index) => {
      if ((card.name || "").toLowerCase() === nameLower) {
        matches.push({ zone: "spellbook", index, card });
      }
    });

    victimGraveyard.forEach((card, index) => {
      if ((card.name || "").toLowerCase() === nameLower) {
        matches.push({ zone: "graveyard", index, card });
      }
    });

    set({
      pendingFeastForCrows: {
        ...pending,
        phase: "revealing",
        namedCardName: cardName,
        namedCardSlug: cardSlug,
        revealedHand: victimHand,
        revealedSpellbook: victimSpellbook,
        revealedGraveyard: victimGraveyard,
        matches,
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent with the named card and match count
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "feastForCrowsName",
          id: pending.id,
          casterSeat,
          victimSeat,
          namedCardName: cardName,
          namedCardSlug: cardSlug,
          matchCount: matches.length,
          matches,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${casterSeat.toUpperCase()}] Feast for Crows — names "${cardName}" (${matches.length} found)`,
    );
  },

  resolveFeastForCrows: () => {
    const pending = get().pendingFeastForCrows;
    if (!pending || pending.phase !== "revealing") return;

    const victimSeat = pending.victimSeat;
    const casterSeat = pending.casterSeat;
    const zones = get().zones;
    const matches = pending.matches;

    // Work on copies of the victim's zones
    const hand = [...(zones[victimSeat]?.hand || [])];
    const spellbook = [...(zones[victimSeat]?.spellbook || [])];
    const graveyard = [...(zones[victimSeat]?.graveyard || [])];
    const banished = [...(zones[victimSeat]?.banished || [])];

    // Collect indices to remove per zone, sort descending to splice safely
    const handIndices: number[] = [];
    const spellbookIndices: number[] = [];
    const graveyardIndices: number[] = [];

    for (const match of matches) {
      // Find the actual current index by matching card identity
      if (match.zone === "hand") {
        const idx = hand.findIndex(
          (c) =>
            c.cardId === match.card.cardId &&
            c.slug === match.card.slug &&
            c.name === match.card.name,
        );
        if (idx !== -1 && !handIndices.includes(idx)) {
          handIndices.push(idx);
        }
      } else if (match.zone === "spellbook") {
        const idx = spellbook.findIndex(
          (c) =>
            c.cardId === match.card.cardId &&
            c.slug === match.card.slug &&
            c.name === match.card.name,
        );
        if (idx !== -1 && !spellbookIndices.includes(idx)) {
          spellbookIndices.push(idx);
        }
      } else if (match.zone === "graveyard") {
        const idx = graveyard.findIndex(
          (c) =>
            c.cardId === match.card.cardId &&
            c.slug === match.card.slug &&
            c.name === match.card.name,
        );
        if (idx !== -1 && !graveyardIndices.includes(idx)) {
          graveyardIndices.push(idx);
        }
      }
    }

    // Remove from end to start to preserve indices
    handIndices.sort((a, b) => b - a).forEach((idx) => {
      banished.push(hand[idx]);
      hand.splice(idx, 1);
    });
    spellbookIndices.sort((a, b) => b - a).forEach((idx) => {
      banished.push(spellbook[idx]);
      spellbook.splice(idx, 1);
    });
    graveyardIndices.sort((a, b) => b - a).forEach((idx) => {
      banished.push(graveyard[idx]);
      graveyard.splice(idx, 1);
    });

    // Shuffle the spellbook ("They shuffle")
    for (let i = spellbook.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spellbook[i], spellbook[j]] = [spellbook[j], spellbook[i]];
    }

    const actorKey = get().actorKey;

    if (actorKey === null) {
      // Hotseat: apply victim zone changes locally and send patch.
      // movePermanentToZone will call trySendPatch, so we must update zones
      // before that call to avoid sending a stale state.
      const zonesNext = {
        ...zones,
        [victimSeat]: {
          ...zones[victimSeat],
          hand,
          spellbook,
          graveyard,
          banished,
        },
      };
      set({
        zones: zonesNext,
        pendingFeastForCrows: null,
      } as Partial<GameState> as GameState);
      try {
        get().trySendPatch({
          zones: { [victimSeat]: zonesNext[victimSeat] } as Record<
            PlayerKey,
            Zones
          >,
        });
      } catch {}
    } else {
      // Online: do NOT touch victimSeat zones here. movePermanentToZone
      // calls trySendPatch internally — if we've already set victim zones
      // locally, that stale data gets broadcast to the server. Instead, let
      // the victim apply their own zone changes via feastForCrowsResolve.
      set({
        pendingFeastForCrows: null,
      } as Partial<GameState> as GameState);
    }

    // Move spell to graveyard (triggers trySendPatch for the spell card only)
    try {
      get().movePermanentToZone(
        pending.spell.at,
        pending.spell.index,
        "graveyard",
      );
    } catch {}

    // Broadcast resolution so victim can update their own zones
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "feastForCrowsResolve",
          id: pending.id,
          casterSeat,
          victimSeat,
          namedCardName: pending.namedCardName,
          matches,
          banishedCount:
            handIndices.length +
            spellbookIndices.length +
            graveyardIndices.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const totalBanished =
      handIndices.length + spellbookIndices.length + graveyardIndices.length;
    get().log(
      `Feast for Crows resolved: ${totalBanished} cop${totalBanished === 1 ? "y" : "ies"} of "${pending.namedCardName}" banished, spellbook shuffled`,
    );
  },

  cancelFeastForCrows: () => {
    const pending = get().pendingFeastForCrows;
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
          type: "feastForCrowsCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log("Feast for Crows cancelled");
    set({ pendingFeastForCrows: null } as Partial<GameState> as GameState);
  },
});
