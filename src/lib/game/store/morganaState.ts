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

function newMorganaId() {
  return `mor_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type MorganaHandEntry = {
  id: string;
  // The Morgana minion that has this private hand
  minion: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  // Who played Morgana
  ownerSeat: PlayerKey;
  // The private hand of spells (up to 3)
  hand: CardRef[];
  createdAt: number;
};

export type MorganaSlice = Pick<
  GameState,
  | "morganaHands"
  | "triggerMorganaGenesis"
  | "castFromMorganaHand"
  | "removeMorganaHand"
  | "getMorganaHandForMinion"
  | "pendingPrivateHandCast"
  | "setPendingPrivateHandCast"
  | "completePendingPrivateHandCast"
>;

export const createMorganaSlice: StateCreator<
  GameState,
  [],
  [],
  MorganaSlice
> = (set, get, storeApi) => ({
  morganaHands: [],

  triggerMorganaGenesis: (input: {
    minion: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    ownerSeat: PlayerKey;
    skipConfirmation?: boolean; // Set to true when called from auto-resolve
  }) => {
    const ownerSeat = input.ownerSeat;
    const zones = get().zones;
    const spellbook = zones[ownerSeat]?.spellbook || [];

    // Check if there are spells to draw
    const drawCount = Math.min(3, spellbook.length);
    if (drawCount === 0) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Morgana le Fay: No spells in spellbook to draw`,
      );
      return;
    }

    // Check Gard of Eden draw limit
    const canDraw = get().canDrawCard(ownerSeat, drawCount);
    if (!canDraw.allowed) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Gard of Eden prevents Morgana from drawing ${drawCount} spells (only ${canDraw.remaining} remaining)`,
      );
      return;
    }

    // If not skipping confirmation, show dialog first
    if (!input.skipConfirmation) {
      get().beginAutoResolve({
        kind: "morgana_genesis",
        ownerSeat,
        sourceName: "Morgana le Fay",
        sourceLocation: input.minion.at,
        sourceInstanceId: input.minion.instanceId,
        effectDescription: `Draw ${drawCount} spell${
          drawCount !== 1 ? "s" : ""
        } from your spellbook into Morgana's hand`,
        callbackData: {
          minion: input.minion,
          skipConfirmation: true,
        },
      });
      return;
    }

    // Execute the actual draw (called after confirmation)
    const id = newMorganaId();
    const spellbookCopy = [...spellbook];
    const drawnCards = spellbookCopy.splice(0, drawCount);

    // Update zones
    const zonesNext = {
      ...zones,
      [ownerSeat]: {
        ...zones[ownerSeat],
        spellbook: spellbookCopy,
      },
    };

    // Create Morgana's private hand entry
    const newMorganaHand: MorganaHandEntry = {
      id,
      minion: input.minion,
      ownerSeat,
      hand: drawnCards,
      createdAt: Date.now(),
    };

    // Capture current morganaHands before set
    const currentMorganaHands = get().morganaHands;

    // Use storeApi.setState() directly to ensure proper subscriber notification
    // This bypasses any potential batching issues with the slice's set()
    storeApi.setState({
      zones: zonesNext,
      morganaHands: [...currentMorganaHands, newMorganaHand],
    });

    // Increment cards drawn counter for Gard of Eden tracking
    get().incrementCardsDrawn(ownerSeat, drawCount);

    // Send zone patch
    const zonePatch: ServerPatchT = {
      zones: { [ownerSeat]: zonesNext[ownerSeat] } as Record<PlayerKey, Zones>,
      morganaHands: [...get().morganaHands],
    };
    get().trySendPatch(zonePatch);

    // Broadcast to opponent (they see that Morgana drew cards but not what)
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "morganaGenesis",
          id,
          minion: input.minion,
          ownerSeat,
          drawnCount: drawCount,
          // Only send card names to owner, opponent just sees count
          drawnCards,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${ownerSeat.toUpperCase()}] Morgana le Fay draws her own hand of ${drawCount} spell${
        drawCount !== 1 ? "s" : ""
      }`,
    );
  },

  castFromMorganaHand: (
    morganaId: string,
    cardIndex: number,
    targetTile: { x: number; y: number },
  ) => {
    const morganaHands = get().morganaHands;
    const morganaEntry = morganaHands.find((m) => m.id === morganaId);
    if (!morganaEntry) return;

    if (cardIndex < 0 || cardIndex >= morganaEntry.hand.length) return;

    const card = morganaEntry.hand[cardIndex];

    // Remove card from Morgana's hand
    const newHand = [...morganaEntry.hand];
    newHand.splice(cardIndex, 1);

    const updatedMorganaHands = morganaHands.map((m) =>
      m.id === morganaId ? { ...m, hand: newHand } : m,
    );

    set({
      morganaHands: updatedMorganaHands,
    } as Partial<GameState> as GameState);

    // Place the spell on the board
    // This delegates to playSelectedTo after setting up the card
    const key = `${targetTile.x},${targetTile.y}` as CellKey;
    const permanents = get().permanents;
    const arr = [...(permanents[key] || [])];

    // Add the spell to the target tile
    const newPermanent = {
      card: card as CardRef,
      owner: morganaEntry.minion.owner,
      instanceId: `morgana_spell_${Date.now()}`,
      tapped: false,
      attachedTo: null,
    };
    arr.push(newPermanent);

    const per = { ...permanents, [key]: arr };

    set({
      permanents: per,
      morganaHands: updatedMorganaHands,
    } as Partial<GameState> as GameState);

    // Send patch
    const patch: ServerPatchT = {
      permanents: per,
      morganaHands: updatedMorganaHands,
    };
    get().trySendPatch(patch);

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "morganaCast",
          morganaId,
          cardIndex,
          cardName: card.name,
          targetTile,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `Morgana le Fay casts ${card.name} at tile ${targetTile.x},${targetTile.y}`,
    );

    // Trigger magic cast flow if it's a magic spell
    const type = (card.type || "").toLowerCase();
    if (type.includes("magic")) {
      try {
        get().beginMagicCast({
          tile: targetTile,
          spell: {
            at: key,
            index: arr.length - 1,
            instanceId: newPermanent.instanceId,
            owner: morganaEntry.minion.owner,
            card: card as CardRef,
          },
          // Preset Morgana as the caster
          presetCaster: {
            kind: "permanent",
            at: morganaEntry.minion.at,
            index: morganaEntry.minion.index,
            owner: morganaEntry.minion.owner,
          },
        });
      } catch {}
    }
  },

  removeMorganaHand: (minionInstanceId: string | null, minionAt: CellKey) => {
    const morganaHands = get().morganaHands;
    const zones = get().zones;

    // Find Morgana's hand entry
    const morganaEntry = morganaHands.find(
      (m) =>
        m.minion.at === minionAt ||
        (minionInstanceId && m.minion.instanceId === minionInstanceId),
    );

    if (!morganaEntry) return;

    // When Morgana leaves, her remaining cards go to graveyard
    const remainingCards = morganaEntry.hand;
    if (remainingCards.length > 0) {
      const ownerSeat = morganaEntry.ownerSeat;
      const graveyard = [...(zones[ownerSeat]?.graveyard || [])];
      graveyard.push(...remainingCards);

      const zonesNext = {
        ...zones,
        [ownerSeat]: {
          ...zones[ownerSeat],
          graveyard,
        },
      };

      set({
        zones: zonesNext,
      } as Partial<GameState> as GameState);

      const zonePatch: ServerPatchT = {
        zones: { [ownerSeat]: zonesNext[ownerSeat] } as Record<
          PlayerKey,
          Zones
        >,
      };
      get().trySendPatch(zonePatch);

      get().log(
        `Morgana le Fay's remaining ${remainingCards.length} spell${
          remainingCards.length !== 1 ? "s" : ""
        } go to graveyard`,
      );
    }

    // Remove from morganaHands tracking
    const remainingMorganaHands = morganaHands.filter(
      (m) =>
        m.minion.at !== minionAt &&
        (!minionInstanceId || m.minion.instanceId !== minionInstanceId),
    );

    set({
      morganaHands: remainingMorganaHands,
    } as Partial<GameState> as GameState);

    // Send patch
    const patch: ServerPatchT = {
      morganaHands: remainingMorganaHands,
    };
    get().trySendPatch(patch);

    // Broadcast removal
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "morganaRemove",
          minionAt,
          minionInstanceId,
          discardedCount: remainingCards.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  getMorganaHandForMinion: (
    minionInstanceId: string | null,
    minionAt: CellKey,
  ): CardRef[] => {
    const morganaHands = get().morganaHands;
    const entry = morganaHands.find(
      (m) =>
        m.minion.at === minionAt ||
        (minionInstanceId && m.minion.instanceId === minionInstanceId),
    );
    return entry?.hand || [];
  },

  // Pending cast from Morgana/Omphalos private hands
  pendingPrivateHandCast: null,

  setPendingPrivateHandCast: (pending) => {
    set({ pendingPrivateHandCast: pending } as Partial<GameState> as GameState);
  },

  completePendingPrivateHandCast: (targetTile) => {
    const pending = get().pendingPrivateHandCast;
    if (!pending) return;

    // For Omphalos minions, must cast at artifact location
    if (pending.mustCastAtLocation) {
      const [mustX, mustY] = pending.mustCastAtLocation.split(",").map(Number);
      const cardType = (pending.card.type || "").toLowerCase();
      if (
        cardType.includes("minion") &&
        (targetTile.x !== mustX || targetTile.y !== mustY)
      ) {
        get().log("Minions from Omphalos must be summoned at its location");
        return;
      }
    }

    if (pending.kind === "morgana") {
      get().castFromMorganaHand(pending.handId, pending.cardIndex, targetTile);
    } else if (pending.kind === "omphalos") {
      get().castFromOmphalosHand(pending.handId, pending.cardIndex, targetTile);
    }

    set({ pendingPrivateHandCast: null } as Partial<GameState> as GameState);
  },
});
