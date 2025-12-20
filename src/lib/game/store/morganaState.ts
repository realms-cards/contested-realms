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
>;

export const createMorganaSlice: StateCreator<
  GameState,
  [],
  [],
  MorganaSlice
> = (set, get) => ({
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
  }) => {
    const id = newMorganaId();
    const ownerSeat = input.ownerSeat;
    const zones = get().zones;
    const spellbook = [...(zones[ownerSeat]?.spellbook || [])];

    // Draw up to 3 spells from top of spellbook
    const drawCount = Math.min(3, spellbook.length);
    if (drawCount === 0) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Morgana le Fay: No spells in spellbook to draw`
      );
      return;
    }

    const drawnCards = spellbook.splice(0, drawCount);

    // Update zones
    const zonesNext = {
      ...zones,
      [ownerSeat]: {
        ...zones[ownerSeat],
        spellbook,
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

    set((state) => ({
      zones: zonesNext,
      morganaHands: [...state.morganaHands, newMorganaHand],
    })) as unknown as void;

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
      }`
    );
  },

  castFromMorganaHand: (
    morganaId: string,
    cardIndex: number,
    targetTile: { x: number; y: number }
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
      m.id === morganaId ? { ...m, hand: newHand } : m
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
      `Morgana le Fay casts ${card.name} at tile ${targetTile.x},${targetTile.y}`
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
        (minionInstanceId && m.minion.instanceId === minionInstanceId)
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
        } go to graveyard`
      );
    }

    // Remove from morganaHands tracking
    const remainingMorganaHands = morganaHands.filter(
      (m) =>
        m.minion.at !== minionAt &&
        (!minionInstanceId || m.minion.instanceId !== minionInstanceId)
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
    minionAt: CellKey
  ): CardRef[] => {
    const morganaHands = get().morganaHands;
    const entry = morganaHands.find(
      (m) =>
        m.minion.at === minionAt ||
        (minionInstanceId && m.minion.instanceId === minionInstanceId)
    );
    return entry?.hand || [];
  },
});
