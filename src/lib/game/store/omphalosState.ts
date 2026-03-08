import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  ServerPatchT,
} from "./types";

function newOmphalosId() {
  return `omph_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

// Omphalos private hand entry - similar to Morgana but for artifacts
export type OmphalosHandEntry = {
  id: string;
  // The Omphalos artifact that has this private hand
  artifact: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  // Who played the Omphalos
  ownerSeat: PlayerKey;
  // The private hand of spells (grows by 1 each end of turn)
  hand: CardRef[];
  createdAt: number;
};

export type OmphalosSlice = Pick<
  GameState,
  | "omphalosHands"
  | "registerOmphalos"
  | "triggerOmphalosEndOfTurn"
  | "castFromOmphalosHand"
  | "removeOmphalosHand"
  | "getOmphalosHandForArtifact"
>;

// Helper to detect Omphalos cards by name
export function isOmphalos(cardName: string): boolean {
  const name = (cardName || "").toLowerCase();
  return (
    name.includes("algor omphalos") ||
    name.includes("char omphalos") ||
    name.includes("dank omphalos") ||
    name.includes("torrid omphalos")
  );
}

// Known monument card names (for fallback when subTypes not populated)
const MONUMENT_NAMES = [
  "belfry",
  "black obelisk",
  "blasted oak",
  "chains of prometheus",
  "orb of ba'al berith",
  "pendulum of peril",
  "the immortal throne",
  "bailey",
  "the round table",
  "shrine of the dragonlord",
  "algor omphalos",
  "arcade of bones",
  "cage of sidrak",
  "char omphalos",
  "dank omphalos",
  "makeshift barricade",
  "pile of skulls",
  "red rock of ravannis",
  "sentinel trap",
  "tombstone wardens",
  "torrid omphalos",
];

// Known automaton card names (for fallback when subTypes not populated)
const AUTOMATON_NAMES = [
  "crave golem",
  "purge juggernaut",
  "undertaker engine",
  "wicker manikin",
  "iron man talus",
  "kairos the archivist",
  "clay golem",
  "driftwood marrows",
  "hemogolem",
  "i am colossus!",
];

// Helper to detect Monument cards by name (fallback for missing subTypes)
export function isMonumentByName(cardName: string): boolean {
  const name = (cardName || "").toLowerCase();
  return MONUMENT_NAMES.some((m) => name.includes(m));
}

// Helper to detect Automaton cards by name (fallback for missing subTypes)
export function isAutomatonByName(cardName: string): boolean {
  const name = (cardName || "").toLowerCase();
  return AUTOMATON_NAMES.some((a) => name.includes(a));
}

export const createOmphalosSlice: StateCreator<
  GameState,
  [],
  [],
  OmphalosSlice
> = (set, get) => ({
  omphalosHands: [],

  // Register an Omphalos when it enters play (creates empty hand)
  registerOmphalos: (input: {
    artifact: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    ownerSeat: PlayerKey;
  }) => {
    const id = newOmphalosId();
    console.log("[Omphalos] Registering Omphalos:", input);

    // Create Omphalos's private hand entry (starts empty)
    const newOmphalosHand: OmphalosHandEntry = {
      id,
      artifact: input.artifact,
      ownerSeat: input.ownerSeat,
      hand: [],
      createdAt: Date.now(),
    };

    set((state) => ({
      omphalosHands: [...state.omphalosHands, newOmphalosHand],
    })) as unknown as void;

    // Send patch
    const patch: ServerPatchT = {
      omphalosHands: [...get().omphalosHands],
    };
    get().trySendPatch(patch);

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "omphalosRegister",
          id,
          artifact: input.artifact,
          ownerSeat: input.ownerSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${input.ownerSeat.toUpperCase()}] ${
        input.artifact.card.name
      } enters the realm`,
    );
  },

  // Trigger end of turn - shows confirmation before drawing for each Omphalos.
  // NOTE: The TurnEffectQueue now dispatches omphalos_draw entries directly,
  // bypassing this function. Kept for backward compatibility / manual invocation.
  triggerOmphalosEndOfTurn: (endingPlayerSeat: PlayerKey) => {
    const omphalosHands = get().omphalosHands;
    const zones = get().zones;
    const actorKey = get().actorKey;

    const playerOmphalos = omphalosHands.filter(
      (o) => o.ownerSeat === endingPlayerSeat,
    );

    if (playerOmphalos.length === 0) return;
    if (actorKey && actorKey !== endingPlayerSeat) return;

    // Find first Omphalos that can draw
    for (const omphalos of playerOmphalos) {
      const spellbook = zones[endingPlayerSeat]?.spellbook || [];
      if (spellbook.length === 0) continue;

      get().beginAutoResolve({
        kind: "omphalos_draw",
        ownerSeat: endingPlayerSeat,
        sourceName: omphalos.artifact.card.name,
        sourceLocation: omphalos.artifact.at,
        sourceInstanceId: omphalos.artifact.instanceId,
        effectDescription: `Draw a spell from your spellbook into ${omphalos.artifact.card.name}'s hand`,
        callbackData: { omphalosId: omphalos.id },
      });
      break;
    }
  },

  castFromOmphalosHand: (
    omphalosId: string,
    cardIndex: number,
    // For minions, targetTile MUST be the Omphalos location
    targetTile: { x: number; y: number },
  ) => {
    const omphalosHands = get().omphalosHands;
    const omphalosEntry = omphalosHands.find((o) => o.id === omphalosId);
    if (!omphalosEntry) return;

    if (cardIndex < 0 || cardIndex >= omphalosEntry.hand.length) return;

    const card = omphalosEntry.hand[cardIndex];
    const cardType = (card.type || "").toLowerCase();
    const isMinion = cardType.includes("minion");

    // Parse Omphalos location
    const [omphalosX, omphalosY] = omphalosEntry.artifact.at
      .split(",")
      .map(Number);

    // Enforce placement restriction: minions must be summoned at Omphalos location
    if (
      isMinion &&
      (targetTile.x !== omphalosX || targetTile.y !== omphalosY)
    ) {
      get().log(
        `Minions cast by ${omphalosEntry.artifact.card.name} must be summoned at its location`,
      );
      return;
    }

    // Deduct mana cost for the card being cast
    const manaCost = card.cost ?? 0;
    if (manaCost > 0) {
      const ownerSeat = omphalosEntry.ownerSeat;
      const availableMana = get().getAvailableMana(ownerSeat);
      if (availableMana < manaCost) {
        get().log(
          `Warning: not enough mana to cast ${card.name} (need ${manaCost}, have ${availableMana})`,
        );
      }
      get().addMana(ownerSeat, -manaCost);
    }

    console.log(
      `[Omphalos] Casting ${card.name} from ${omphalosEntry.artifact.card.name} at tile (${targetTile.x}, ${targetTile.y})`,
    );

    // Remove card from Omphalos's hand
    const newHand = [...omphalosEntry.hand];
    newHand.splice(cardIndex, 1);

    const updatedOmphalosHands = omphalosHands.map((o) =>
      o.id === omphalosId ? { ...o, hand: newHand } : o,
    );

    // Place the spell on the board
    const key = `${targetTile.x},${targetTile.y}` as CellKey;
    const permanents = get().permanents;
    const arr = [...(permanents[key] || [])];

    // Add the spell to the target tile
    const newPermanent = {
      card: card as CardRef,
      owner: omphalosEntry.artifact.owner,
      instanceId: `omphalos_spell_${Date.now()}`,
      tapped: false,
      attachedTo: null,
    };
    arr.push(newPermanent);

    const per = { ...permanents, [key]: arr };

    set({
      permanents: per,
      omphalosHands: updatedOmphalosHands,
    } as Partial<GameState> as GameState);

    // Send patch
    const patch: ServerPatchT = {
      permanents: per,
      omphalosHands: updatedOmphalosHands,
    };
    get().trySendPatch(patch);

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "omphalosCast",
          omphalosId,
          cardIndex,
          cardName: card.name,
          targetTile,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `${omphalosEntry.artifact.card.name} casts ${card.name}${
        isMinion ? " (summoned at its location)" : ""
      }`,
    );
  },

  removeOmphalosHand: (
    artifactInstanceId: string | null,
    artifactAt: CellKey,
  ) => {
    const omphalosHands = get().omphalosHands;
    const zones = get().zones;

    // Find the Omphalos entry
    const omphalosEntry = omphalosHands.find(
      (o) =>
        o.artifact.at === artifactAt ||
        (artifactInstanceId && o.artifact.instanceId === artifactInstanceId),
    );

    if (!omphalosEntry) return;

    // Send remaining cards to graveyard (cemetery)
    const ownerSeat = omphalosEntry.ownerSeat;
    const graveyard = [...(zones[ownerSeat]?.graveyard || [])];
    for (const card of omphalosEntry.hand) {
      graveyard.push(card);
    }

    const discardedCount = omphalosEntry.hand.length;

    const zonesNext = {
      ...zones,
      [ownerSeat]: {
        ...zones[ownerSeat],
        graveyard,
      },
    };

    // Remove from tracking
    const remainingOmphalosHands = omphalosHands.filter(
      (o) =>
        o.artifact.at !== artifactAt &&
        (!artifactInstanceId || o.artifact.instanceId !== artifactInstanceId),
    );

    set({
      zones: zonesNext,
      omphalosHands: remainingOmphalosHands,
    } as Partial<GameState> as GameState);

    // Send patch
    const zonePatch: ServerPatchT = {
      zones: zonesNext,
      omphalosHands: remainingOmphalosHands,
    };
    get().trySendPatch(zonePatch);

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "omphalosRemove",
          artifactAt,
          artifactInstanceId,
          discardedCount,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    if (discardedCount > 0) {
      get().log(
        `${
          omphalosEntry.artifact.card.name
        }'s ${discardedCount} remaining spell${
          discardedCount !== 1 ? "s" : ""
        } go to graveyard`,
      );
    }
  },

  getOmphalosHandForArtifact: (
    artifactInstanceId: string | null,
    artifactAt: CellKey,
  ): CardRef[] => {
    const omphalosHands = get().omphalosHands;
    const entry = omphalosHands.find(
      (o) =>
        o.artifact.at === artifactAt ||
        (artifactInstanceId && o.artifact.instanceId === artifactInstanceId),
    );
    return entry?.hand || [];
  },
});
