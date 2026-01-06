import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  ServerPatchT,
} from "./types";

function newPigsDeathId() {
  return `pigs_death_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

// Card name mappings for Deathrite abilities:
// - "Pigs of the Sounder" → summons "Grand Old Boar"
// - "Squeakers" → summons "Pigs of the Sounder"
const DEATHRITE_SUMMON_TARGETS: Record<string, string> = {
  "pigs of the sounder": "grand old boar",
  squeakers: "pigs of the sounder",
};

export type PigsOfTheSounderPhase = "revealing" | "summoning" | "complete";

export type PendingPigsOfTheSounder = {
  id: string;
  ownerSeat: PlayerKey;
  deathLocation: CellKey; // Where the creature died (where new ones will be summoned)
  triggerCardName: string; // The card that triggered the Deathrite
  targetCardName: string; // The card to search for and summon
  phase: PigsOfTheSounderPhase;
  revealedCards: CardRef[];
  pigsToSummon: CardRef[]; // Cards matching targetCardName to summon
  cardsToBottom: CardRef[];
  createdAt: number;
};

export type PigsOfTheSounderSlice = Pick<
  GameState,
  | "pendingPigsOfTheSounder"
  | "triggerPigsDeathrite"
  | "resolvePigsOfTheSounder"
  | "cancelPigsOfTheSounder"
>;

export const createPigsOfTheSounderSlice: StateCreator<
  GameState,
  [],
  [],
  PigsOfTheSounderSlice
> = (set, get) => ({
  pendingPigsOfTheSounder: null,

  triggerPigsDeathrite: (input: {
    ownerSeat: PlayerKey;
    deathLocation: CellKey;
    triggerCardName?: string; // Optional: defaults to "Pigs of the Sounder"
  }) => {
    const id = newPigsDeathId();
    const { ownerSeat, deathLocation } = input;
    const triggerCardName = input.triggerCardName || "Pigs of the Sounder";
    const triggerNameLower = triggerCardName.toLowerCase();

    // Look up what card this Deathrite should summon
    const targetCardName = DEATHRITE_SUMMON_TARGETS[triggerNameLower];
    if (!targetCardName) {
      get().log(
        `[${ownerSeat.toUpperCase()}] ${triggerCardName} has no known Deathrite summon target`
      );
      return;
    }

    const zones = get().zones;
    const spellbook = zones[ownerSeat]?.spellbook || [];

    // Reveal top 5 cards
    const revealedCards = spellbook.slice(0, 5);

    if (revealedCards.length === 0) {
      get().log(
        `[${ownerSeat.toUpperCase()}] ${triggerCardName} Deathrite: No spells to reveal`
      );
      return;
    }

    // Find all cards matching the target name among revealed cards
    const pigsToSummon = revealedCards.filter(
      (card) => (card.name || "").toLowerCase() === targetCardName
    );

    // Rest go to bottom in random order
    const cardsToBottom = revealedCards
      .filter((card) => (card.name || "").toLowerCase() !== targetCardName)
      .sort(() => Math.random() - 0.5); // Randomize order

    // Set revealing phase
    set({
      pendingPigsOfTheSounder: {
        id,
        ownerSeat,
        deathLocation,
        triggerCardName,
        targetCardName,
        phase: "revealing",
        revealedCards,
        pigsToSummon,
        cardsToBottom,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${ownerSeat.toUpperCase()}] ${triggerCardName} Deathrite reveals ${
        revealedCards.length
      } cards (looking for ${targetCardName})`
    );

    // No auto-resolve - wait for manual dismissal via resolvePigsOfTheSounder()

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "pigsDeathrite",
          id,
          ownerSeat,
          deathLocation,
          triggerCardName,
          targetCardName,
          revealedCards: revealedCards.map((c) => c.name),
          pigsCount: pigsToSummon.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolvePigsOfTheSounder: () => {
    const pending = get().pendingPigsOfTheSounder;
    if (!pending) return;

    const {
      ownerSeat,
      deathLocation,
      triggerCardName,
      targetCardName,
      pigsToSummon,
      cardsToBottom,
      revealedCards,
    } = pending;

    set({
      pendingPigsOfTheSounder: { ...pending, phase: "summoning" },
    } as Partial<GameState> as GameState);

    const zones = get().zones;
    const permanents = get().permanents;
    const spellbook = [...(zones[ownerSeat]?.spellbook || [])];

    // Remove revealed cards from top of spellbook
    spellbook.splice(0, revealedCards.length);

    // Add non-Pigs cards to bottom in random order
    spellbook.push(...cardsToBottom);

    // Summon Pigs to the death location
    const ownerNum = ownerSeat === "p1" ? 1 : 2;
    const locationPerms = [...(permanents[deathLocation] || [])];

    for (const pig of pigsToSummon) {
      locationPerms.push({
        owner: ownerNum as 1 | 2,
        card: pig,
        tapped: false,
        instanceId: `pigs_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 6)}`,
      });
    }

    const zonesNext = {
      ...zones,
      [ownerSeat]: { ...zones[ownerSeat], spellbook },
    };

    const permanentsNext = {
      ...permanents,
      [deathLocation]: locationPerms,
    };

    // Update state
    set({
      zones: zonesNext,
      permanents: permanentsNext,
      pendingPigsOfTheSounder: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    // Send patches
    const patches: ServerPatchT = {
      zones: {
        [ownerSeat]: { spellbook: zonesNext[ownerSeat].spellbook },
      } as unknown as ServerPatchT["zones"],
      permanents: permanentsNext,
    };
    get().trySendPatch(patches);

    if (pigsToSummon.length > 0) {
      get().log(
        `[${ownerSeat.toUpperCase()}] ${triggerCardName} summons ${
          pigsToSummon.length
        } ${targetCardName} to the battlefield`
      );
    } else {
      get().log(
        `[${ownerSeat.toUpperCase()}] ${triggerCardName} finds no ${targetCardName} among revealed cards`
      );
    }

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "pigsDeathResolve",
          id: pending.id,
          summonedCount: pigsToSummon.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Clear pending after delay
    setTimeout(() => {
      set((state) => {
        if (state.pendingPigsOfTheSounder?.id === pending.id) {
          return { ...state, pendingPigsOfTheSounder: null } as GameState;
        }
        return state;
      });
    }, 500);
  },

  cancelPigsOfTheSounder: () => {
    const pending = get().pendingPigsOfTheSounder;
    if (!pending) return;

    set({ pendingPigsOfTheSounder: null } as Partial<GameState> as GameState);

    get().log(
      `[${pending.ownerSeat.toUpperCase()}] Pigs of the Sounder Deathrite cancelled`
    );
  },
});
