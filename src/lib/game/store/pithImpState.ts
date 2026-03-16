import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PithImpHandEntry,
  PlayerKey,
  ServerPatchT,
  Zones,
} from "./types";
import { triggerCardResolvers } from "./utils/resolverTriggers";

function newPithImpId() {
  return `pi_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

// Re-export the type from types.ts for convenience
export type { PithImpHandEntry };

// Legacy type re-export for backwards compatibility
export type { PendingStolenCard } from "./types";

export type PithImpSlice = Pick<
  GameState,
  | "pithImpHands"
  | "stolenCards" // Legacy - kept for backwards compatibility
  | "triggerPithImpGenesis"
  | "returnStolenCard"
  | "removePithImpHand"
  | "getPithImpHandForMinion"
  | "dropStolenCard"
  | "transferPithImpOwnership"
>;

export const createPithImpSlice: StateCreator<
  GameState,
  [],
  [],
  PithImpSlice
> = (set, get) => ({
  pithImpHands: [],
  stolenCards: [], // Legacy - kept for backwards compatibility

  // Register a Pith Imp when it enters play and steals a card
  triggerPithImpGenesis: (input: {
    minion: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    ownerSeat: PlayerKey;
    skipConfirmation?: boolean;
  }) => {
    console.log("[PithImp] triggerPithImpGenesis called:", input);
    const ownerSeat = input.ownerSeat;
    const victimSeat = ownerSeat === "p1" ? "p2" : "p1";
    const zones = get().zones;
    const victimHand = zones[victimSeat]?.hand || [];

    console.log(
      `[PithImp] Victim ${victimSeat} hand has ${victimHand.length} cards`,
    );

    // Filter to only spells (non-site cards)
    const spellsInHand = victimHand.filter((card) => {
      const type = (card.type || "").toLowerCase();
      return !type.includes("site");
    });

    console.log(
      `[PithImp] Found ${spellsInHand.length} spells (non-site cards) in victim's hand`,
    );

    if (spellsInHand.length === 0) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Pith Imp: ${victimSeat.toUpperCase()} has no spells in hand to steal`,
      );
      return;
    }

    // Show confirmation dialog before stealing
    if (!input.skipConfirmation) {
      get().beginAutoResolve({
        kind: "pith_imp_steal",
        ownerSeat,
        sourceName: "Pith Imp",
        sourceLocation: input.minion.at,
        sourceInstanceId: input.minion.instanceId,
        effectDescription: `Steal a random spell from ${victimSeat.toUpperCase()}'s hand (${
          spellsInHand.length
        } eligible)`,
        callbackData: {
          minion: input.minion,
          skipConfirmation: true,
        },
      });
      return;
    }

    // Execute the actual steal (called after confirmation)
    const id = newPithImpId();

    // Pick a random spell
    const randomValue = Math.random();
    const randomIndex = Math.floor(randomValue * spellsInHand.length);
    const stolenCard = spellsInHand[randomIndex];

    console.log("[PithImp] Random selection details:", {
      randomValue,
      spellsCount: spellsInHand.length,
      randomIndex,
      allSpells: spellsInHand.map((c) => c.name),
      selectedCard: stolenCard.name,
    });

    // Find the actual index in the full hand (not just spells array)
    const actualHandIndex = victimHand.findIndex((c, idx) => {
      let spellCount = 0;
      for (let i = 0; i <= idx; i++) {
        const type = (victimHand[i].type || "").toLowerCase();
        if (!type.includes("site")) {
          if (spellCount === randomIndex && i === idx) {
            return true;
          }
          spellCount++;
        }
      }
      return false;
    });

    console.log(
      `[PithImp] Random selection: spellIndex=${randomIndex}, actualHandIndex=${actualHandIndex}, card=${stolenCard.name}`,
    );

    // Create Pith Imp's private hand entry with the stolen card
    const newPithImpHand: PithImpHandEntry = {
      id,
      minion: input.minion,
      ownerSeat,
      victimSeat,
      hand: [stolenCard], // Start with the stolen card
      createdAt: Date.now(),
    };

    console.log("[PithImp] Owner creating private hand:", {
      id,
      cardName: stolenCard.name,
      minionAt: input.minion.at,
      minionInstanceId: input.minion.instanceId,
    });

    // Remove the card from victim's hand locally (owner's view)
    const newVictimHand = [...victimHand];
    if (actualHandIndex >= 0 && actualHandIndex < newVictimHand.length) {
      newVictimHand.splice(actualHandIndex, 1);
    }

    const zonesNext = {
      ...zones,
      [victimSeat]: {
        ...zones[victimSeat],
        hand: newVictimHand,
      },
    } as GameState["zones"];

    // Create visual attachment for display (both players see it)
    const permanents = get().permanents;
    const minionCell = permanents[input.minion.at] || [];
    const minionIndex = minionCell.findIndex(
      (p) => p.instanceId === input.minion.instanceId,
    );

    // IMPORTANT: Use Pith Imp controller's owner number for the stolen card
    // This transfers ownership to the controller while the card is stolen
    // The victimSeat is stored separately to return the card when Pith Imp leaves
    const controllerOwnerNum: 1 | 2 = ownerSeat === "p1" ? 1 : 2;

    let permanentsNext = permanents;
    if (minionIndex !== -1) {
      // Add stolen card as visual attachment (for display only, not for state)
      // Use controllerOwnerNum - ownership transfers to Pith Imp controller
      // victimSeat is tracked in pithImpHands for returning the card later
      const stolenVisual = {
        card: {
          ...stolenCard,
          pithImpStolen: true,
          originalOwnerSeat: victimSeat,
        } as CardRef,
        owner: controllerOwnerNum,
        instanceId: `pithimp_visual_${id}`,
        tapped: false,
        attachedTo: { at: input.minion.at, index: minionIndex },
      };
      const cellWithVisual = [...minionCell, stolenVisual];
      permanentsNext = {
        ...permanents,
        [input.minion.at]: cellWithVisual,
      };
    }

    set((state) => ({
      pithImpHands: [...state.pithImpHands, newPithImpHand],
      zones: zonesNext,
      permanents: permanentsNext,
    })) as unknown as void;

    // Send zones + permanents patch (includes visual attachment for display)
    const patch: ServerPatchT = {
      zones: {
        [victimSeat]: zonesNext[victimSeat],
      } as Record<PlayerKey, Zones>,
      permanents: {
        [input.minion.at]: permanentsNext[input.minion.at],
      },
    };
    get().trySendPatch(patch);

    // Broadcast to opponent (so they can remove from their hand)
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "pithImpSteal",
          id,
          minion: input.minion,
          ownerSeat,
          stolenCardName: stolenCard.name,
          stolenCard,
          stolenCardHandIndex: actualHandIndex,
          victimSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${ownerSeat.toUpperCase()}] Pith Imp steals ${
        stolenCard.name
      } from ${victimSeat.toUpperCase()}'s hand!`,
    );
  },

  // Return stolen cards when Pith Imp leaves the realm (called from movePermanentToZone)
  returnStolenCard: (minionInstanceId: string | null, minionAt: CellKey) => {
    // Use the new removePithImpHand function
    get().removePithImpHand(minionInstanceId, minionAt);
  },

  // Remove a Pith Imp's hand and return cards to victim
  removePithImpHand: (minionInstanceId: string | null, minionAt: CellKey) => {
    const pithImpHands = get().pithImpHands;
    const zones = get().zones;

    // Find the Pith Imp entry - prioritize instanceId (unique per card)
    const pithImpEntry = pithImpHands.find(
      (p) =>
        (minionInstanceId && p.minion.instanceId === minionInstanceId) ||
        (!minionInstanceId && p.minion.at === minionAt),
    );

    if (!pithImpEntry || pithImpEntry.hand.length === 0) {
      console.log("[PithImp] No cards to return for this Pith Imp");
      return;
    }

    console.log("[PithImp] Returning stolen cards:", {
      minionInstanceId,
      minionAt,
      cardsToReturn: pithImpEntry.hand.map((c) => c.name),
    });

    // Return all cards to victim's hand
    const victimHand = [...(zones[pithImpEntry.victimSeat]?.hand || [])];
    for (const card of pithImpEntry.hand) {
      victimHand.push(card);
      get().log(
        `${
          card.name
        } returns to ${pithImpEntry.victimSeat.toUpperCase()}'s hand (Pith Imp left the realm)`,
      );
    }

    const zonesNext = {
      ...zones,
      [pithImpEntry.victimSeat]: {
        ...zones[pithImpEntry.victimSeat],
        hand: victimHand,
      },
    } as GameState["zones"];

    // Remove from tracking
    // Filter out the matched Pith Imp - use same matching logic
    const remainingPithImpHands = pithImpHands.filter(
      (p) =>
        !(minionInstanceId && p.minion.instanceId === minionInstanceId) &&
        !(!minionInstanceId && p.minion.at === minionAt),
    );

    // Remove visual attachments (stolen cards with pithImpStolen flag)
    const permanents = get().permanents;
    const cell = permanents[minionAt] || [];
    const cellWithoutStolenVisuals = cell.filter((p) => {
      const isPithImpStolen = (p.card as { pithImpStolen?: boolean })
        ?.pithImpStolen;
      return !isPithImpStolen || p.attachedTo?.at !== minionAt;
    });
    const permanentsNext =
      cellWithoutStolenVisuals.length !== cell.length
        ? { ...permanents, [minionAt]: cellWithoutStolenVisuals }
        : permanents;

    set({
      zones: zonesNext,
      pithImpHands: remainingPithImpHands,
      permanents: permanentsNext,
    } as Partial<GameState> as GameState);

    // NOTE: Owner cannot send a zones patch for victim's seat since trySendPatch
    // sanitizes patches to only include the actor's own seat data.
    // The victim adds cards to their own hand when they receive the pithImpReturn message.

    // Broadcast return with full card data so victim can add them back
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "pithImpReturn",
          id: pithImpEntry.id, // Include id for deduplication
          minionAt,
          minionInstanceId,
          ownerSeat: pithImpEntry.ownerSeat,
          victimSeat: pithImpEntry.victimSeat,
          // Include full card data so victim can add cards back to hand
          cardsToReturn: pithImpEntry.hand,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  // Get the private hand for a specific Pith Imp
  getPithImpHandForMinion: (
    minionInstanceId: string | null,
    minionAt: CellKey,
  ): CardRef[] => {
    const pithImpHands = get().pithImpHands;
    // Prioritize instanceId (unique per card), fallback to position only if no instanceId
    const entry = pithImpHands.find(
      (p) =>
        (minionInstanceId && p.minion.instanceId === minionInstanceId) ||
        (!minionInstanceId && p.minion.at === minionAt),
    );
    return entry?.hand || [];
  },

  // Drop a stolen card from Pith Imp's hand onto the board
  dropStolenCard: (
    pithImpId: string,
    cardIndex: number,
    targetTile: { x: number; y: number },
  ) => {
    const pithImpHands = get().pithImpHands;
    const pithImpEntry = pithImpHands.find((p) => p.id === pithImpId);
    if (!pithImpEntry) return;

    if (cardIndex < 0 || cardIndex >= pithImpEntry.hand.length) return;

    const card = pithImpEntry.hand[cardIndex];
    const key = `${targetTile.x},${targetTile.y}` as CellKey;

    console.log("[PithImp] Dropping stolen card:", {
      pithImpId,
      cardName: card.name,
      targetTile: key,
    });

    // Add the card as a permanent on the board
    // IMPORTANT: Use the Pith Imp controller's owner number - card ownership transfers
    const controllerOwnerNum: 1 | 2 = pithImpEntry.ownerSeat === "p1" ? 1 : 2;
    const permanents = get().permanents;
    const cellPerms = [...(permanents[key] || [])];
    const newPermanent = {
      card: {
        ...card,
        originalOwnerSeat: pithImpEntry.victimSeat,
      } as CardRef,
      owner: controllerOwnerNum, // Ownership transferred to Pith Imp controller
      instanceId: `dropped_${Date.now().toString(36)}`,
      tapped: false,
    };
    cellPerms.push(newPermanent);

    const per = {
      ...permanents,
      [key]: cellPerms,
    };

    // Remove the card from Pith Imp's hand
    const newHand = [...pithImpEntry.hand];
    newHand.splice(cardIndex, 1);

    const updatedPithImpHands = pithImpHands.map((p) =>
      p.id === pithImpId ? { ...p, hand: newHand } : p,
    );

    set({
      permanents: per,
      pithImpHands: updatedPithImpHands,
    } as Partial<GameState> as GameState);

    // Send patch
    const patch: ServerPatchT = {
      permanents: per,
      pithImpHands: updatedPithImpHands,
    };
    get().trySendPatch(patch);

    get().log(`Dropped ${card.name} from Pith Imp's grasp`);

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "pithImpDrop",
          pithImpId,
          cardIndex,
          cardName: card.name,
          targetTile,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Trigger custom card resolvers (spell abilities, minion genesis, etc.)
    triggerCardResolvers({
      card: card as CardRef,
      key,
      permanentIndex: cellPerms.length - 1,
      instanceId: newPermanent.instanceId,
      owner: controllerOwnerNum,
      ownerSeat: pithImpEntry.ownerSeat,
      get,
    });
  },

  // Transfer Pith Imp ownership when control is transferred to another player
  // Stolen cards transfer with the Pith Imp
  transferPithImpOwnership: (
    minionInstanceId: string | null,
    minionAt: CellKey,
    newOwnerSeat: PlayerKey,
  ) => {
    const pithImpHands = get().pithImpHands;

    // Find the Pith Imp entry - prioritize instanceId (unique per card)
    const entryIndex = pithImpHands.findIndex(
      (p) =>
        (minionInstanceId && p.minion.instanceId === minionInstanceId) ||
        (!minionInstanceId && p.minion.at === minionAt),
    );

    if (entryIndex === -1) {
      console.log("[PithImp] No entry found for ownership transfer");
      return;
    }

    const entry = pithImpHands[entryIndex];
    const oldOwnerSeat = entry.ownerSeat;

    if (oldOwnerSeat === newOwnerSeat) {
      console.log("[PithImp] Ownership already correct, skipping transfer");
      return;
    }

    console.log("[PithImp] Transferring ownership:", {
      minionInstanceId,
      minionAt,
      oldOwnerSeat,
      newOwnerSeat,
      stolenCards: entry.hand.map((c) => c.name),
    });

    // Update the entry with new owner
    const newOwnerNum: 1 | 2 = newOwnerSeat === "p1" ? 1 : 2;
    const updatedEntry: PithImpHandEntry = {
      ...entry,
      ownerSeat: newOwnerSeat,
      minion: {
        ...entry.minion,
        owner: newOwnerNum,
      },
    };

    const updatedHands = [...pithImpHands];
    updatedHands[entryIndex] = updatedEntry;

    // Update visual attachments (stolen cards) to have new owner
    const permanents = get().permanents;
    const cell = permanents[minionAt] || [];
    const updatedCell = cell.map((p) => {
      const isPithImpStolen = (p.card as { pithImpStolen?: boolean })
        ?.pithImpStolen;
      if (isPithImpStolen && p.attachedTo?.at === minionAt) {
        // Update the stolen card's owner to new controller
        return {
          ...p,
          owner: newOwnerNum,
        };
      }
      return p;
    });

    const permanentsNext =
      updatedCell !== cell
        ? { ...permanents, [minionAt]: updatedCell }
        : permanents;

    set({
      pithImpHands: updatedHands,
      permanents: permanentsNext,
    } as Partial<GameState> as GameState);

    // Send patch for permanents update
    const patch: ServerPatchT = {
      permanents: permanentsNext,
      pithImpHands: updatedHands,
    };
    get().trySendPatch(patch);

    get().log(
      `Pith Imp stolen cards transferred to ${newOwnerSeat.toUpperCase()}'s control`,
    );

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "pithImpOwnershipTransfer",
          minionInstanceId,
          minionAt,
          oldOwnerSeat,
          newOwnerSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});
