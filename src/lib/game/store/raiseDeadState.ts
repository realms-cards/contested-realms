import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  ServerPatchT,
} from "./types";

function newRaiseDeadId() {
  return `raise_dead_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type RaiseDeadPhase =
  | "confirming" // User confirms whether to auto-resolve
  | "resolving" // Processing the effect
  | "complete"; // Done

export type PendingRaiseDead = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: RaiseDeadPhase;
  // All eligible minions from both graveyards
  eligibleMinions: Array<{
    card: CardRef;
    fromSeat: PlayerKey; // Which player's graveyard it came from
  }>;
  // The randomly selected minion (determined on resolve)
  selectedMinion: CardRef | null;
  selectedFromSeat: PlayerKey | null;
  createdAt: number;
};

export type RaiseDeadSlice = Pick<
  GameState,
  "pendingRaiseDead" | "beginRaiseDead" | "resolveRaiseDead" | "cancelRaiseDead"
>;

export const createRaiseDeadSlice: StateCreator<
  GameState,
  [],
  [],
  RaiseDeadSlice
> = (set, get) => ({
  pendingRaiseDead: null,

  beginRaiseDead: async (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => {
    const id = newRaiseDeadId();
    const { spell, casterSeat } = input;
    const zones = get().zones;

    // Gather all minions from both players' graveyards
    const p1Graveyard = zones.p1?.graveyard || [];
    const p2Graveyard = zones.p2?.graveyard || [];

    const eligibleMinions: Array<{ card: CardRef; fromSeat: PlayerKey }> = [];

    // Check P1 graveyard for minions
    for (const card of p1Graveyard) {
      const cardType = (card.type || "").toLowerCase();
      if (cardType.includes("minion")) {
        eligibleMinions.push({ card, fromSeat: "p1" });
      }
    }

    // Check P2 graveyard for minions
    for (const card of p2Graveyard) {
      const cardType = (card.type || "").toLowerCase();
      if (cardType.includes("minion")) {
        eligibleMinions.push({ card, fromSeat: "p2" });
      }
    }

    // If no minions in any graveyard, spell fizzles
    if (eligibleMinions.length === 0) {
      get().log(
        `[${casterSeat.toUpperCase()}] Raise Dead: No minions in any graveyard`
      );
      // Move spell to graveyard
      get().movePermanentToZone(spell.at, spell.index, "graveyard");
      return;
    }

    // Set pending state - user must confirm before auto-resolve
    set({
      pendingRaiseDead: {
        id,
        spell,
        casterSeat,
        phase: "confirming",
        eligibleMinions,
        selectedMinion: null,
        selectedFromSeat: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${casterSeat.toUpperCase()}] casts Raise Dead - ${
        eligibleMinions.length
      } dead minion(s) found`
    );

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "raiseDeadBegin",
          id,
          spell,
          casterSeat,
          eligibleCount: eligibleMinions.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveRaiseDead: () => {
    const pending = get().pendingRaiseDead;
    if (!pending || pending.phase !== "confirming") return;

    const { spell, casterSeat, eligibleMinions, id } = pending;

    if (eligibleMinions.length === 0) {
      // Should not happen, but handle gracefully
      get().movePermanentToZone(spell.at, spell.index, "graveyard");
      set({ pendingRaiseDead: null } as Partial<GameState> as GameState);
      return;
    }

    // Update phase to resolving
    set({
      pendingRaiseDead: { ...pending, phase: "resolving" },
    } as Partial<GameState> as GameState);

    // Pick a random minion from all eligible minions
    const randomIndex = Math.floor(Math.random() * eligibleMinions.length);
    const selected = eligibleMinions[randomIndex];
    const selectedMinion = selected.card;
    const selectedFromSeat = selected.fromSeat;

    // Remove minion from the source graveyard
    const zones = get().zones;
    const sourceGraveyard = [...(zones[selectedFromSeat]?.graveyard || [])];
    const minionIndex = sourceGraveyard.findIndex(
      (c) =>
        c.cardId === selectedMinion.cardId &&
        c.slug === selectedMinion.slug &&
        c.name === selectedMinion.name
    );

    if (minionIndex !== -1) {
      sourceGraveyard.splice(minionIndex, 1);
    }

    // Summon the minion to the spell's location under caster's control
    const permanents = get().permanents;
    const ownerNum = casterSeat === "p1" ? 1 : 2;
    const cellPerms = [...(permanents[spell.at] || [])];

    const newPermanent = {
      card: {
        ...selectedMinion,
        instanceId:
          selectedMinion.instanceId ||
          `raised_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      },
      owner: ownerNum as 1 | 2,
      tapped: false,
      tapVersion: 0,
      version: 0,
      instanceId: `raised_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      counters: 0,
      damage: 0,
      summoningSickness: true,
    };

    cellPerms.push(newPermanent);

    const permanentsNext = {
      ...permanents,
      [spell.at]: cellPerms,
    };

    const zonesNext = {
      ...zones,
      [selectedFromSeat]: {
        ...zones[selectedFromSeat],
        graveyard: sourceGraveyard,
      },
    };

    // Update state
    set({
      zones: zonesNext,
      permanents: permanentsNext,
      pendingRaiseDead: {
        ...pending,
        phase: "complete",
        selectedMinion,
        selectedFromSeat,
      },
    } as Partial<GameState> as GameState);

    // Move the Raise Dead spell to graveyard
    get().movePermanentToZone(spell.at, spell.index, "graveyard");

    // Create patches for network sync
    // Important: Include the source seat's graveyard update
    const zonePatch: ServerPatchT = {
      zones: {
        [selectedFromSeat]: zonesNext[selectedFromSeat],
      } as ServerPatchT["zones"],
    };

    const permanentsPatch: ServerPatchT = {
      permanents: {
        [spell.at]: permanentsNext[spell.at],
      },
    };

    get().trySendPatch({ ...zonePatch, ...permanentsPatch });

    // Log the result
    const fromPlayerStr =
      selectedFromSeat === casterSeat ? "their own" : "opponent's";
    get().log(
      `[${casterSeat.toUpperCase()}] Raise Dead summons ${
        selectedMinion.name
      } from ${fromPlayerStr} graveyard!`
    );

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "raiseDeadResolve",
          id,
          casterSeat,
          selectedMinionName: selectedMinion.name,
          selectedFromSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Clear pending after delay
    setTimeout(() => {
      set((state) => {
        if (state.pendingRaiseDead?.id === id) {
          return { ...state, pendingRaiseDead: null } as GameState;
        }
        return state;
      });
    }, 500);
  },

  cancelRaiseDead: () => {
    const pending = get().pendingRaiseDead;
    if (!pending) return;

    const { spell, casterSeat, id } = pending;

    // User declined auto-resolve - card stays on board but nothing happens
    // The spell is already on the board, so we just clear the pending state
    get().log(
      `[${casterSeat.toUpperCase()}] Raise Dead: Manual resolution chosen - spell remains on board`
    );

    // Move spell to graveyard since it's been cast (even without auto-resolve)
    get().movePermanentToZone(spell.at, spell.index, "graveyard");

    set({ pendingRaiseDead: null } as Partial<GameState> as GameState);

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "raiseDeadCancel",
          id,
          casterSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});
