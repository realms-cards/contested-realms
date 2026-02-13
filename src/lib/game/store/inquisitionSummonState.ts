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

/**
 * Compute which cells the owner can summon The Inquisition to.
 * Valid = any cell adjacent to (or on) a site the owner controls.
 */
function computeValidCells(state: GameState, ownerSeat: PlayerKey): CellKey[] {
  const board = state.board;
  if (!board?.size) return [];
  const { w, h } = board.size;
  const ownerNum = ownerSeat === "p1" ? 1 : 2;
  const valid = new Set<string>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const key = `${x},${y}`;
      const site = board.sites[key];
      if (site && site.owner === ownerNum) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              valid.add(`${nx},${ny}`);
            }
          }
        }
      }
    }
  }
  return [...valid] as CellKey[];
}

function newInquisitionSummonId() {
  return `inqsum_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/**
 * Check if a list of cards contains "The Inquisition".
 * Returns the index of the first match, or -1 if not found.
 */
export function findInquisitionInCards(cards: CardRef[]): number {
  return cards.findIndex(
    (c) => (c.name || "").toLowerCase() === "the inquisition",
  );
}

export type InquisitionSummonSlice = Pick<
  GameState,
  | "pendingInquisitionSummon"
  | "offerInquisitionSummon"
  | "acceptInquisitionSummon"
  | "placeInquisitionSummon"
  | "declineInquisitionSummon"
>;

export const createInquisitionSummonSlice: StateCreator<
  GameState,
  [],
  [],
  InquisitionSummonSlice
> = (set, get) => ({
  pendingInquisitionSummon: null,

  offerInquisitionSummon: (input) => {
    const id = newInquisitionSummonId();
    const { ownerSeat, triggerSource, card, sourceZone, cardIndex } = input;

    // Don't offer if there's already a pending summon offer
    if (get().pendingInquisitionSummon) return;

    set({
      pendingInquisitionSummon: {
        id,
        ownerSeat,
        triggerSource,
        card,
        sourceZone,
        cardIndex,
        phase: "offered",
        selectedCell: null,
        validCells: [],
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast offer to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "inquisitionSummonOffer",
          id,
          ownerSeat,
          triggerSource,
          card,
          sourceZone,
          cardIndex,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${ownerSeat.toUpperCase()}] The Inquisition was revealed! May summon it from ${sourceZone}.`,
    );
  },

  acceptInquisitionSummon: () => {
    const pending = get().pendingInquisitionSummon;
    if (!pending || pending.phase !== "offered") return;

    const validCells = computeValidCells(get(), pending.ownerSeat);

    set({
      pendingInquisitionSummon: {
        ...pending,
        phase: "selectingCell",
        validCells,
      },
    } as Partial<GameState> as GameState);

    // Broadcast acceptance (include validCells so opponent can highlight)
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "inquisitionSummonAccept",
          id: pending.id,
          validCells,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${pending.ownerSeat.toUpperCase()}] chooses to summon The Inquisition — select a cell.`,
    );
  },

  placeInquisitionSummon: (cell: CellKey) => {
    const pending = get().pendingInquisitionSummon;
    if (!pending || pending.phase !== "selectingCell") return;

    const { ownerSeat, card, sourceZone, cardIndex } = pending;
    const zones = get().zones;
    const permanents = get().permanents;
    const ownerNum = ownerSeat === "p1" ? 1 : 2;

    // Remove the card from the source zone
    const zoneArr = [...(zones[ownerSeat]?.[sourceZone] || [])];
    // Find by matching the exact card (prefer cardIndex, fall back to search)
    let removeIndex = -1;
    if (cardIndex >= 0 && cardIndex < zoneArr.length) {
      const candidate = zoneArr[cardIndex];
      if (candidate.cardId === card.cardId && candidate.name === card.name) {
        removeIndex = cardIndex;
      }
    }
    if (removeIndex === -1) {
      removeIndex = zoneArr.findIndex(
        (c) => c.cardId === card.cardId && c.name === card.name,
      );
    }
    if (removeIndex !== -1) {
      zoneArr.splice(removeIndex, 1);
    }

    // Create the permanent
    const instanceId = `${card.cardId}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const newPermanent = {
      card,
      owner: ownerNum as 1 | 2,
      tapped: false,
      tapVersion: 0,
      version: 0,
      instanceId,
      counters: 0,
      damage: 0,
      summoningSickness: true,
    };

    const cellPerms = permanents[cell] || [];
    const permanentsNext = {
      ...permanents,
      [cell]: [...cellPerms, newPermanent],
    };

    const zonesNext = {
      ...zones,
      [ownerSeat]: {
        ...zones[ownerSeat],
        [sourceZone]: zoneArr,
      },
    };

    set({
      zones: zonesNext,
      permanents: permanentsNext,
      pendingInquisitionSummon: {
        ...pending,
        phase: "complete",
        selectedCell: cell,
      },
    } as Partial<GameState> as GameState);

    // Send patches
    const actorKey = get().actorKey;
    if (actorKey === null || actorKey === ownerSeat) {
      try {
        const patch: ServerPatchT = {
          zones: { [ownerSeat]: zonesNext[ownerSeat] } as Record<
            PlayerKey,
            Zones
          >,
          permanents: { [cell]: permanentsNext[cell] },
        };
        get().trySendPatch(patch);
      } catch {}
    }

    // Broadcast placement to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "inquisitionSummonPlace",
          id: pending.id,
          ownerSeat,
          cell,
          card,
          sourceZone,
          instanceId,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${ownerSeat.toUpperCase()}] summons The Inquisition from ${sourceZone}!`,
    );

    // Clear the pending state after a brief moment, then trigger Genesis
    setTimeout(() => {
      const current = get().pendingInquisitionSummon;
      if (current?.id === pending.id) {
        set({
          pendingInquisitionSummon: null,
        } as Partial<GameState> as GameState);
      }

      // Trigger Genesis: reveal opponent hand, may banish
      try {
        const newIndex = (permanentsNext[cell] || []).length - 1;
        get().beginInquisition({
          minion: {
            at: cell,
            index: newIndex >= 0 ? newIndex : 0,
            instanceId,
            owner: ownerNum as 1 | 2,
            card,
          },
          casterSeat: ownerSeat,
        });
      } catch (e) {
        console.error(
          "[InquisitionSummon] Error triggering Genesis after summon:",
          e,
        );
      }
    }, 500);
  },

  declineInquisitionSummon: () => {
    const pending = get().pendingInquisitionSummon;
    if (!pending) return;

    // Broadcast decline
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "inquisitionSummonDecline",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${pending.ownerSeat.toUpperCase()}] declines to summon The Inquisition.`,
    );
    set({ pendingInquisitionSummon: null } as Partial<GameState> as GameState);
  },
});
