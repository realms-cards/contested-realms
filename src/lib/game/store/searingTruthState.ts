import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import { findInquisitionInCards } from "./inquisitionSummonState";
import type {
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  ServerPatchT,
  Zones,
} from "./types";

function newSearingTruthId() {
  return `st_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type SearingTruthPhase =
  | "selectingTarget" // Caster is selecting which player to target
  | "revealing" // Cards have been drawn and are being shown
  | "resolving"
  | "complete";

export type PendingSearingTruth = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: SearingTruthPhase;
  // Target player who will draw and take damage
  targetSeat: PlayerKey | null;
  // The two cards drawn (visible to both players during reveal)
  revealedCards: CardRef[];
  // The damage that will be dealt (higher mana cost)
  damageAmount: number;
  createdAt: number;
};

export type SearingTruthSlice = Pick<
  GameState,
  | "pendingSearingTruth"
  | "beginSearingTruth"
  | "selectSearingTruthTarget"
  | "resolveSearingTruth"
  | "cancelSearingTruth"
>;

export const createSearingTruthSlice: StateCreator<
  GameState,
  [],
  [],
  SearingTruthSlice
> = (set, get) => ({
  pendingSearingTruth: null,

  beginSearingTruth: (input) => {
    const id = newSearingTruthId();
    const casterSeat = input.casterSeat;

    set({
      pendingSearingTruth: {
        id,
        spell: input.spell,
        casterSeat,
        phase: "selectingTarget",
        targetSeat: null,
        revealedCards: [],
        damageAmount: 0,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "searingTruthBegin",
          id,
          spell: input.spell,
          casterSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const casterNum = casterSeat === "p1" ? "1" : "2";
    get().log(
      `[p${casterNum}:PLAYER] casts Searing Truth - choose a target player`,
    );
  },

  selectSearingTruthTarget: async (targetSeat: PlayerKey) => {
    const pending = get().pendingSearingTruth;
    if (!pending || pending.phase !== "selectingTarget") return;

    // Check Garden of Eden draw limit for target player
    const canDraw = get().canDrawCard(targetSeat, 2);
    if (!canDraw.allowed) {
      const targetNum = targetSeat === "p1" ? "1" : "2";
      get().log(
        `[p${targetNum}:PLAYER] Garden of Eden prevents drawing more cards this turn (limit: 1)`,
      );
      // Cancel instead of resolving
      get().cancelSearingTruth();
      return;
    }

    const zones = get().zones;
    const spellbook = [...(zones[targetSeat]?.spellbook || [])];
    const hand = [...(zones[targetSeat]?.hand || [])];

    // Draw up to 2 cards from the top of target's spellbook
    const cardsToDraw = Math.min(2, spellbook.length);
    const drawnCards: CardRef[] = [];

    for (let i = 0; i < cardsToDraw; i++) {
      const card = spellbook.shift();
      if (card) {
        drawnCards.push(card);
        hand.push(card);
      }
    }

    // Calculate the higher mana cost (use embedded CardRef cost)
    let maxCost = 0;
    for (const card of drawnCards) {
      const cost = card.cost ?? 0;
      if (cost > maxCost) {
        maxCost = cost;
      }
    }

    // Update zones with drawn cards
    const zonesNext = {
      ...zones,
      [targetSeat]: {
        ...zones[targetSeat],
        spellbook,
        hand,
      },
    };

    set({
      zones: zonesNext,
      pendingSearingTruth: {
        ...pending,
        phase: "revealing",
        targetSeat,
        revealedCards: drawnCards,
        damageAmount: maxCost,
      },
    } as Partial<GameState> as GameState);

    // NOTE: Do NOT send zone patches for target's seat if it's the opponent - the server will block it.
    // The opponent updates their own zones when they receive the custom message.
    // Only send patch if targeting self (caster)
    const casterSeat = pending.casterSeat;
    if (targetSeat === casterSeat) {
      const zonePatch: ServerPatchT = {
        zones: { [targetSeat]: zonesNext[targetSeat] } as Record<
          PlayerKey,
          Zones
        >,
      };
      get().trySendPatch(zonePatch);
    }

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "searingTruthTarget",
          id: pending.id,
          targetSeat,
          revealedCards: drawnCards.map((c) => ({
            cardId: c.cardId,
            name: c.name,
            slug: c.slug,
          })),
          damageAmount: maxCost,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const cardNames = drawnCards.map((c) => c.name || "Unknown").join(" and ");
    const targetNumForLog = targetSeat === "p1" ? "1" : "2";
    get().log(
      `[p${targetNumForLog}:PLAYER] draws and reveals ${cardNames} - will take ${maxCost} damage`,
    );

    // Check if The Inquisition is among the revealed spellbook cards
    // The target owns the revealed cards; if caster is the opponent, the target gets the offer
    const casterIsOpponent = pending.casterSeat !== targetSeat;
    if (casterIsOpponent) {
      const inqIdx = findInquisitionInCards(drawnCards);
      if (inqIdx !== -1) {
        // Find the card's index in the target's updated hand
        const handBefore = zones[targetSeat]?.hand || [];
        const handIdx = handBefore.length + inqIdx; // drawnCards were appended to hand
        setTimeout(() => {
          try {
            get().offerInquisitionSummon({
              ownerSeat: targetSeat,
              triggerSource: "searing_truth",
              card: drawnCards[inqIdx],
              sourceZone: "hand", // Card was moved from spellbook to hand by Searing Truth
              cardIndex: handIdx,
            });
          } catch {}
        }, 800);
      }
    }

    // Increment cards drawn counter for Garden of Eden tracking
    get().incrementCardsDrawn(targetSeat, drawnCards.length);
  },

  resolveSearingTruth: () => {
    const pending = get().pendingSearingTruth;
    if (
      !pending ||
      pending.phase !== "revealing" ||
      pending.targetSeat === null
    )
      return;

    const targetSeat = pending.targetSeat;
    const damageAmount = pending.damageAmount;

    // Apply damage to target player
    if (damageAmount > 0) {
      const players = get().players;
      const targetPlayer = players[targetSeat];
      if (!targetPlayer) return;
      const newLife = targetPlayer.life - damageAmount;

      // Determine life state
      let newLifeState = targetPlayer.lifeState;
      if (newLife <= 0) {
        if (targetPlayer.lifeState === "alive") {
          newLifeState = "dd"; // Death's Door
        } else if (targetPlayer.lifeState === "dd") {
          newLifeState = "dead";
        }
      }

      const playersNext = {
        ...players,
        [targetSeat]: {
          ...targetPlayer,
          life: Math.max(0, newLife),
          lifeState: newLifeState,
        },
      };

      set({ players: playersNext } as Partial<GameState> as GameState);

      // Send only affected player's data to avoid overwriting opponent's state
      const playersPatch: ServerPatchT = {
        players: {
          [targetSeat]: playersNext[targetSeat],
        } as GameState["players"],
      };
      get().trySendPatch(playersPatch);
    }

    set({ pendingSearingTruth: null } as Partial<GameState> as GameState);

    // Move spell to graveyard
    try {
      get().movePermanentToZone(
        pending.spell.at,
        pending.spell.index,
        "graveyard",
      );
    } catch {}

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "searingTruthResolve",
          id: pending.id,
          damageAmount,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const targetNumResolve = targetSeat === "p1" ? "1" : "2";
    get().log(
      `Searing Truth resolved: [p${targetNumResolve}:PLAYER] takes ${damageAmount} damage`,
    );
  },

  cancelSearingTruth: () => {
    const pending = get().pendingSearingTruth;
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
          type: "searingTruthCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log("Searing Truth cancelled");
    set({ pendingSearingTruth: null } as Partial<GameState> as GameState);
  },
});
