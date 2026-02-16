import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  ServerPatchT,
} from "./types";
import { newPermanentInstanceId } from "./utils/idHelpers";
import { bumpPermanentVersion } from "./utils/permanentHelpers";

function newAssimilatorSnailId() {
  return `assimilator_snail_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function isAssimilatorSnail(
  cardName: string | null | undefined,
): boolean {
  if (!cardName) return false;
  return cardName.toLowerCase() === "assimilator snail";
}

export type AssimilatorSnailPhase = "selectingCorpse" | "resolved";

export type PendingAssimilatorSnail = {
  id: string;
  /** The Assimilator Snail permanent on the board */
  snail: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  activatorSeat: PlayerKey;
  phase: AssimilatorSnailPhase;
  /** All eligible dead minions from the activator's graveyard */
  eligibleCorpses: Array<{
    card: CardRef;
    fromSeat: PlayerKey;
  }>;
  /** Selected corpse index (into eligibleCorpses) */
  selectedCorpseIndex: number | null;
  createdAt: number;
};

/**
 * Tracks active Assimilator Snail transformations so they can be reverted
 * at the start of the owner's next turn.
 */
export type AssimilatorSnailTransform = {
  /** Cell where the snail sits */
  snailAt: CellKey;
  /** The snail's instanceId for stable identification */
  snailInstanceId: string;
  /** The original Assimilator Snail card data (to revert to) */
  originalCard: CardRef;
  /** The seat that activated the ability */
  ownerSeat: PlayerKey;
  /** Turn number when the transformation was applied */
  appliedOnTurn: number;
};

export type AssimilatorSnailSlice = Pick<
  GameState,
  | "pendingAssimilatorSnail"
  | "beginAssimilatorSnail"
  | "selectAssimilatorSnailCorpse"
  | "resolveAssimilatorSnail"
  | "cancelAssimilatorSnail"
  | "assimilatorSnailUsed"
  | "assimilatorSnailTransforms"
  | "revertAssimilatorSnailTransforms"
>;

export const createInitialAssimilatorSnailUsed =
  (): GameState["assimilatorSnailUsed"] => ({
    p1: false,
    p2: false,
  });

export const createAssimilatorSnailSlice: StateCreator<
  GameState,
  [],
  [],
  AssimilatorSnailSlice
> = (set, get) => ({
  pendingAssimilatorSnail: null,
  assimilatorSnailUsed: createInitialAssimilatorSnailUsed(),
  assimilatorSnailTransforms: [],

  beginAssimilatorSnail: (input) => {
    const state = get();
    const { snail, activatorSeat } = input;

    // Validate: must be the activator's turn
    const currentSeat = state.currentPlayer === 1 ? "p1" : "p2";
    if (activatorSeat !== currentSeat) {
      get().log("Cannot activate Assimilator Snail: not your turn");
      return;
    }

    // Validate: once per turn
    if (state.assimilatorSnailUsed[activatorSeat]) {
      get().log(
        "Cannot activate Assimilator Snail: already used this turn",
      );
      return;
    }

    // Gather eligible dead minions from both players' graveyards
    const zones = state.zones;
    const eligibleCorpses: Array<{ card: CardRef; fromSeat: PlayerKey }> = [];

    for (const seat of ["p1", "p2"] as PlayerKey[]) {
      const graveyard = zones[seat]?.graveyard || [];
      for (const card of graveyard) {
        const cardType = (card.type || "").toLowerCase();
        if (cardType.includes("minion")) {
          eligibleCorpses.push({ card, fromSeat: seat });
        }
      }
    }

    if (eligibleCorpses.length === 0) {
      get().log(
        "Assimilator Snail: No dead minions in any graveyard",
      );
      return;
    }

    const id = newAssimilatorSnailId();

    set({
      pendingAssimilatorSnail: {
        id,
        snail,
        activatorSeat,
        phase: "selectingCorpse",
        eligibleCorpses,
        selectedCorpseIndex: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "assimilatorSnailBegin",
          id,
          snail,
          activatorSeat,
          eligibleCount: eligibleCorpses.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${activatorSeat.toUpperCase()}] activates Assimilator Snail - select a dead minion to banish and copy`,
    );
  },

  selectAssimilatorSnailCorpse: (corpseIndex: number) => {
    const pending = get().pendingAssimilatorSnail;
    if (!pending || pending.phase !== "selectingCorpse") return;
    if (corpseIndex < 0 || corpseIndex >= pending.eligibleCorpses.length) return;

    set({
      pendingAssimilatorSnail: {
        ...pending,
        selectedCorpseIndex: corpseIndex,
      },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "assimilatorSnailSelectCorpse",
          id: pending.id,
          corpseIndex,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveAssimilatorSnail: () => {
    const pending = get().pendingAssimilatorSnail;
    if (!pending || pending.phase !== "selectingCorpse") return;
    if (pending.selectedCorpseIndex === null) return;

    const { activatorSeat, snail } = pending;
    const selectedCorpse = pending.eligibleCorpses[pending.selectedCorpseIndex];
    const selectedCard = selectedCorpse.card;
    const selectedFromSeat = selectedCorpse.fromSeat;

    // 1. Transform the Assimilator Snail to become a copy of the banished minion
    const permanents = { ...get().permanents };
    const cellPerms = [...(permanents[snail.at] || [])];

    // Find the snail by instanceId for stability
    const snailIndex = cellPerms.findIndex(
      (p) =>
        (p.instanceId && p.instanceId === snail.instanceId) ||
        (p.card?.instanceId && p.card.instanceId === snail.instanceId),
    );

    if (snailIndex === -1) {
      get().log("Assimilator Snail: Could not find snail on board");
      set({ pendingAssimilatorSnail: null } as Partial<GameState> as GameState);
      return;
    }

    const snailPerm = cellPerms[snailIndex];
    const originalCard = { ...snailPerm.card } as CardRef;
    const snailInstanceId =
      snailPerm.instanceId ?? snailPerm.card?.instanceId ?? newPermanentInstanceId();

    // Replace the snail's card data with the copied minion's card data,
    // but keep the snail's instanceId and owner
    cellPerms[snailIndex] = bumpPermanentVersion({
      ...snailPerm,
      card: {
        ...selectedCard,
        instanceId: snailPerm.card.instanceId, // Keep original instanceId
        owner: snailPerm.card.owner, // Keep original owner
      },
      isCopy: true, // Mark as copy for proper cleanup
    });

    permanents[snail.at] = cellPerms;

    // 2. Track the transformation for reversion
    const transformEntry: AssimilatorSnailTransform = {
      snailAt: snail.at,
      snailInstanceId,
      originalCard,
      ownerSeat: activatorSeat,
      appliedOnTurn: get().turn,
    };

    const assimilatorSnailTransforms = [
      ...get().assimilatorSnailTransforms,
      transformEntry,
    ];

    // 3. Mark as used this turn
    const assimilatorSnailUsedNext = {
      ...get().assimilatorSnailUsed,
      [activatorSeat]: true,
    };

    // 4. Update state (permanents + tracking, zones handled by moveFromGraveyardToBanished)
    set({
      permanents,
      pendingAssimilatorSnail: null,
      assimilatorSnailUsed: assimilatorSnailUsedNext,
      assimilatorSnailTransforms,
    } as Partial<GameState> as GameState);

    // 5. Send permanents + tracking patch
    get().trySendPatch({
      permanents: {
        [snail.at]: permanents[snail.at],
      },
      assimilatorSnailUsed: assimilatorSnailUsedNext,
      assimilatorSnailTransforms,
    });

    // 6. Banish the selected dead minion using canonical zone helper
    // (handles zone immutability, createZonesPatchFor, __allowZoneSeats internally)
    const corpseId = selectedCard.instanceId;
    if (corpseId) {
      get().moveFromGraveyardToBanished(selectedFromSeat, corpseId);
    }

    // 7. Log the result
    const playerNum = activatorSeat === "p1" ? "1" : "2";
    get().log(
      `[p${playerNum}:PLAYER] Assimilator Snail banishes ${selectedCard.name} and becomes a copy of it until next turn`,
    );

    // 8. Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "assimilatorSnailResolve",
          id: pending.id,
          activatorSeat,
          banishedMinionName: selectedCard.name,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}

      // Send toast
      try {
        transport.sendMessage({
          type: "toast",
          text: `[p${playerNum}:PLAYER] Assimilator Snail becomes ${selectedCard.name}!`,
          seat: activatorSeat,
        } as never);
      } catch {}
    }
  },

  cancelAssimilatorSnail: () => {
    const pending = get().pendingAssimilatorSnail;
    if (!pending) return;

    const { activatorSeat, id } = pending;

    set({ pendingAssimilatorSnail: null } as Partial<GameState> as GameState);

    get().log("Assimilator Snail ability cancelled");

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "assimilatorSnailCancel",
          id,
          activatorSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  /**
   * Revert all Assimilator Snail transformations for a given player.
   * Called at the start of the owner's next turn.
   */
  revertAssimilatorSnailTransforms: (who: PlayerKey) => {
    const transforms = get().assimilatorSnailTransforms;
    const toRevert = transforms.filter((t) => t.ownerSeat === who);
    const remaining = transforms.filter((t) => t.ownerSeat !== who);

    if (toRevert.length === 0) return;

    const permanents = { ...get().permanents };

    for (const transform of toRevert) {
      const cellPerms = [...(permanents[transform.snailAt] || [])];
      const snailIndex = cellPerms.findIndex(
        (p) =>
          (p.instanceId && p.instanceId === transform.snailInstanceId) ||
          (p.card?.instanceId &&
            p.card.instanceId === transform.snailInstanceId),
      );

      if (snailIndex !== -1) {
        // Revert to original Assimilator Snail card
        cellPerms[snailIndex] = bumpPermanentVersion({
          ...cellPerms[snailIndex],
          card: {
            ...transform.originalCard,
            instanceId: cellPerms[snailIndex].card.instanceId, // Keep current instanceId
            owner: cellPerms[snailIndex].card.owner, // Keep current owner
          },
          isCopy: false, // No longer a copy
        });
        permanents[transform.snailAt] = cellPerms;

        const playerNum = who === "p1" ? "1" : "2";
        get().log(
          `[p${playerNum}:PLAYER] Assimilator Snail reverts to its original form`,
        );
      }
    }

    set({
      permanents,
      assimilatorSnailTransforms: remaining,
    } as Partial<GameState> as GameState);

    // Send patch
    const patchPerms: Record<string, unknown> = {};
    for (const transform of toRevert) {
      patchPerms[transform.snailAt] = permanents[transform.snailAt];
    }

    get().trySendPatch({
      permanents: patchPerms as ServerPatchT["permanents"],
      assimilatorSnailTransforms: remaining,
    });

    // Broadcast reversion
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "assimilatorSnailRevert",
          who,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}

      // Send toast
      const playerNum = who === "p1" ? "1" : "2";
      try {
        transport.sendMessage({
          type: "toast",
          text: `[p${playerNum}:PLAYER] Assimilator Snail reverts to original form`,
          seat: who,
        } as never);
      } catch {}
    }
  },
});
