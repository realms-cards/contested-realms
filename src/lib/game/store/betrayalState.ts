import type { StateCreator } from "zustand";
import { getPermanentOwnerBaseZ } from "@/lib/game/boardShared";
import type {
  BetrayalLink,
  CardRef,
  CellKey,
  GameState,
  PendingBetrayal,
  PermanentItem,
  Permanents,
  PlayerKey,
  ServerPatchT,
  Zones,
} from "./types";
import {
  getCellNumber,
  ownerFromSeat,
  parseCellKey,
  seatFromOwner,
} from "./utils/boardHelpers";
import { prepareCardForSeat } from "./utils/cardHelpers";
import {
  cloneCardForPatch,
  createPermanentDeltaPatch,
  createPermanentsPatch,
} from "./utils/patchHelpers";
import {
  bumpPermanentVersion,
  ensurePermanentInstanceId,
} from "./utils/permanentHelpers";
import {
  createEmptyPlayerZones,
  createZonesPatchFor,
  removeCardInstanceFromAllZones,
} from "./utils/zoneHelpers";

function newBetrayalId(): string {
  return `betrayal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function findPermanentByInstanceId(
  permanents: Permanents,
  instanceId: string,
): { at: CellKey; index: number; item: PermanentItem } | null {
  for (const [cellKey, items] of Object.entries(permanents)) {
    const index = (items || []).findIndex(
      (item) => ensurePermanentInstanceId(item) === instanceId,
    );
    if (index >= 0) {
      return {
        at: cellKey as CellKey,
        index,
        item: items[index],
      };
    }
  }
  return null;
}

function computeTransferredOffset(
  item: PermanentItem,
  newOwner: 1 | 2,
): [number, number] {
  const oldZBase = getPermanentOwnerBaseZ(item.owner);
  const newZBase = getPermanentOwnerBaseZ(newOwner);
  const oldOffZ = item.offset?.[1] ?? 0;
  return [item.offset?.[0] ?? 0, oldOffZ + oldZBase - newZBase];
}

function buildControlZones(
  state: GameState,
  card: CardRef,
  nextSeat: PlayerKey,
): { zones: GameState["zones"]; seats: PlayerKey[] } {
  const instanceId = card.instanceId;
  let zonesNext = state.zones;
  const changedSeats: PlayerKey[] = [];
  if (instanceId) {
    const removal = removeCardInstanceFromAllZones(state.zones, instanceId);
    if (removal) {
      zonesNext = removal.zones;
      changedSeats.push(...removal.seats);
    }
  }
  const currentSeatZones = {
    ...(zonesNext[nextSeat] ?? createEmptyPlayerZones()),
  } as Zones;
  const battlefield = [...currentSeatZones.battlefield];
  const alreadyPresent = instanceId
    ? battlefield.some((entry) => entry.instanceId === instanceId)
    : battlefield.some((entry) => entry.cardId === card.cardId);
  if (!alreadyPresent) {
    battlefield.push(prepareCardForSeat(card, nextSeat));
    currentSeatZones.battlefield = battlefield;
    zonesNext = {
      ...zonesNext,
      [nextSeat]: currentSeatZones,
    } as GameState["zones"];
    if (!changedSeats.includes(nextSeat)) {
      changedSeats.push(nextSeat);
    }
  }
  return { zones: zonesNext, seats: changedSeats };
}

export type BetrayalSlice = Pick<
  GameState,
  | "pendingBetrayal"
  | "activeBetrayals"
  | "beginBetrayal"
  | "selectBetrayalTarget"
  | "resolveBetrayal"
  | "cancelBetrayal"
  | "revertBetrayedPermanent"
  | "cleanupBetrayalForPermanent"
  | "triggerBetrayalEndOfTurn"
>;

export const createBetrayalSlice: StateCreator<
  GameState,
  [],
  [],
  BetrayalSlice
> = (set, get) => ({
  pendingBetrayal: null,
  activeBetrayals: [],

  beginBetrayal: (input) => {
    const state = get();
    const id = newBetrayalId();
    const casterSeat = input.casterSeat;
    const casterOwner = ownerFromSeat(casterSeat);
    const hasEnemyMinion = Object.values(state.permanents).some((items) =>
      (items || []).some((item) => {
        const type = (item.card?.type || "").toLowerCase();
        const isMinion = type.includes("minion") || type.includes("creature");
        return isMinion && !item.attachedTo && item.owner !== casterOwner;
      }),
    );

    if (!hasEnemyMinion) {
      get().log(
        `[${casterSeat.toUpperCase()}] Betrayal has no enemy minion target`,
      );
      try {
        get().movePermanentToZone(
          input.spell.at,
          input.spell.index,
          "graveyard",
        );
      } catch {}
      return;
    }

    const pending: PendingBetrayal = {
      id,
      spell: input.spell,
      casterSeat,
      phase: "selectingTarget",
      targetMinion: null,
      createdAt: Date.now(),
    };

    set({ pendingBetrayal: pending } as Partial<GameState> as GameState);
    get().trySendPatch({ pendingBetrayal: pending });
    get().log(
      `[${casterSeat.toUpperCase()}] casts Betrayal - select an enemy minion`,
    );
  },

  selectBetrayalTarget: (target) => {
    const pending = get().pendingBetrayal;
    if (!pending || pending.phase !== "selectingTarget") return;

    const casterOwner = ownerFromSeat(pending.casterSeat);
    const type = (target.card?.type || "").toLowerCase();
    const isMinion = type.includes("minion") || type.includes("creature");
    if (!isMinion || target.owner === casterOwner) return;

    const nextPending: PendingBetrayal = {
      ...pending,
      targetMinion: target,
      phase: "resolving",
    };

    set({ pendingBetrayal: nextPending } as Partial<GameState> as GameState);
    get().trySendPatch({ pendingBetrayal: nextPending });
  },

  resolveBetrayal: () => {
    const state = get();
    const pending = state.pendingBetrayal;
    if (!pending || pending.phase !== "resolving" || !pending.targetMinion) {
      return;
    }

    const targetInstanceId = pending.targetMinion.instanceId;
    if (!targetInstanceId) {
      set({ pendingBetrayal: null } as Partial<GameState> as GameState);
      get().trySendPatch({ pendingBetrayal: null });
      return;
    }

    const located = findPermanentByInstanceId(state.permanents, targetInstanceId);
    if (!located) {
      set({ pendingBetrayal: null } as Partial<GameState> as GameState);
      get().trySendPatch({ pendingBetrayal: null });
      try {
        get().movePermanentToZone(
          pending.spell.at,
          pending.spell.index,
          "graveyard",
        );
      } catch {}
      return;
    }

    const controllerOwner = ownerFromSeat(pending.casterSeat);
    const originalOwner = located.item.owner;
    const originalOwnerSeat = seatFromOwner(originalOwner);
    const per: Permanents = { ...state.permanents };
    const arr = [...(per[located.at] || [])];
    const current = arr[located.index];
    if (!current) return;

    const nextTapVersion = Number(current.tapVersion ?? 0) + (current.tapped ? 1 : 0);
    const updatedTarget = bumpPermanentVersion({
      ...current,
      owner: controllerOwner,
      originalOwner,
      originalOwnerSeat,
      betrayalId: pending.id,
      offset: computeTransferredOffset(current, controllerOwner),
      tapped: false,
      tapVersion: nextTapVersion,
      card: {
        ...prepareCardForSeat(current.card, pending.casterSeat),
        originalOwnerSeat,
      },
    });
    arr[located.index] = updatedTarget;
    per[located.at] = arr;

    const link: BetrayalLink = {
      id: pending.id,
      casterSeat: pending.casterSeat,
      originalOwner,
      originalOwnerSeat,
      controllerOwner,
      target: {
        at: located.at,
        instanceId: updatedTarget.instanceId ?? targetInstanceId,
        cardName: updatedTarget.card.name,
      },
      spell: {
        at: pending.spell.at,
        instanceId: pending.spell.instanceId ?? null,
        cardName: pending.spell.card.name,
      },
      createdAt: Date.now(),
    };

    const { zones, seats } = buildControlZones(
      state,
      updatedTarget.card,
      pending.casterSeat,
    );
    const activeBetrayals = [...state.activeBetrayals, link];

    set({
      permanents: per,
      zones,
      pendingBetrayal: null,
      activeBetrayals,
    } as Partial<GameState> as GameState);

    const deltaPatch = createPermanentDeltaPatch([
      {
        at: located.at,
        entry: {
          instanceId: updatedTarget.instanceId ?? undefined,
          owner: updatedTarget.owner,
          originalOwner: updatedTarget.originalOwner,
          originalOwnerSeat: updatedTarget.originalOwnerSeat,
          betrayalId: updatedTarget.betrayalId,
          offset: updatedTarget.offset,
          tapped: updatedTarget.tapped,
          tapVersion: updatedTarget.tapVersion,
          card: cloneCardForPatch(updatedTarget.card),
          version: updatedTarget.version,
        },
      },
    ]);
    const fallbackPatch = deltaPatch
      ? null
      : createPermanentsPatch(per, located.at);
    const patch: ServerPatchT = {
      pendingBetrayal: null,
      activeBetrayals,
    };
    if (deltaPatch) {
      Object.assign(patch, deltaPatch);
    } else if (fallbackPatch?.permanents) {
      patch.permanents = fallbackPatch.permanents;
    }
    const zonePatch = createZonesPatchFor(zones, seats);
    if (zonePatch?.zones) {
      patch.zones = zonePatch.zones;
      (patch as Record<string, unknown>).__allowZoneSeats = seats;
    }
    get().trySendPatch(patch);

    const { x, y } = parseCellKey(located.at);
    const cellNo = getCellNumber(x, y, state.board.size.w, state.board.size.h);
    get().log(
      `[${pending.casterSeat.toUpperCase()}] Betrayal resolves on ${updatedTarget.card.name} at #${cellNo}`,
    );

    try {
      get().movePermanentToZone(
        pending.spell.at,
        pending.spell.index,
        "graveyard",
      );
    } catch {}
  },

  cancelBetrayal: () => {
    const pending = get().pendingBetrayal;
    if (!pending) return;
    set({ pendingBetrayal: null } as Partial<GameState> as GameState);
    get().trySendPatch({ pendingBetrayal: null });
  },

  revertBetrayedPermanent: (targetInstanceId, options) => {
    const state = get();
    const link = state.activeBetrayals.find(
      (entry) => entry.target.instanceId === targetInstanceId,
    );
    if (!link) return;

    const located = findPermanentByInstanceId(state.permanents, targetInstanceId);
    if (!located) {
      if (options?.keepLink) return;
      const activeBetrayals = state.activeBetrayals.filter(
        (entry) => entry.id !== link.id,
      );
      set({ activeBetrayals } as Partial<GameState> as GameState);
      if (!options?.skipPatch) {
        get().trySendPatch({ activeBetrayals });
      }
      return;
    }

    const current = located.item;
    if (current.owner === link.originalOwner) {
      if (!options?.keepLink) {
        const activeBetrayals = state.activeBetrayals.filter(
          (entry) => entry.id !== link.id,
        );
        set({ activeBetrayals } as Partial<GameState> as GameState);
        if (!options?.skipPatch) {
          get().trySendPatch({ activeBetrayals });
        }
      }
      return;
    }

    const per: Permanents = { ...state.permanents };
    const arr = [...(per[located.at] || [])];
    const updatedTarget = bumpPermanentVersion({
      ...current,
      owner: link.originalOwner,
      originalOwner: undefined,
      originalOwnerSeat: null,
      betrayalId: null,
      offset: computeTransferredOffset(current, link.originalOwner),
      card: {
        ...prepareCardForSeat(current.card, link.originalOwnerSeat),
        originalOwnerSeat: null,
      },
    });
    arr[located.index] = updatedTarget;
    per[located.at] = arr;

    const { zones, seats } = buildControlZones(
      state,
      updatedTarget.card,
      link.originalOwnerSeat,
    );
    const activeBetrayals = options?.keepLink
      ? state.activeBetrayals
      : state.activeBetrayals.filter((entry) => entry.id !== link.id);

    set({
      permanents: per,
      zones,
      activeBetrayals,
    } as Partial<GameState> as GameState);

    if (!options?.skipPatch) {
      const deltaPatch = createPermanentDeltaPatch([
        {
          at: located.at,
          entry: {
            instanceId: updatedTarget.instanceId ?? undefined,
            owner: updatedTarget.owner,
            originalOwner: undefined,
            originalOwnerSeat: null,
            betrayalId: null,
            offset: updatedTarget.offset,
            card: cloneCardForPatch(updatedTarget.card),
            version: updatedTarget.version,
          },
        },
      ]);
      const fallbackPatch = deltaPatch
        ? null
        : createPermanentsPatch(per, located.at);
      const patch: ServerPatchT = {
        activeBetrayals,
      };
      if (deltaPatch) {
        Object.assign(patch, deltaPatch);
      } else if (fallbackPatch?.permanents) {
        patch.permanents = fallbackPatch.permanents;
      }
      const zonePatch = createZonesPatchFor(zones, seats);
      if (zonePatch?.zones) {
        patch.zones = zonePatch.zones;
        (patch as Record<string, unknown>).__allowZoneSeats = seats;
      }
      get().trySendPatch(patch);
    }

    if (options?.reason) {
      get().log(options.reason);
    }
  },

  cleanupBetrayalForPermanent: (targetInstanceId, options) => {
    const state = get();
    const activeBetrayals = state.activeBetrayals.filter(
      (entry) => entry.target.instanceId !== targetInstanceId,
    );
    if (activeBetrayals.length === state.activeBetrayals.length) return;
    set({ activeBetrayals } as Partial<GameState> as GameState);
    if (!options?.skipPatch) {
      get().trySendPatch({ activeBetrayals });
    }
  },

  triggerBetrayalEndOfTurn: (endingPlayerSeat) => {
    const state = get();
    const endingLinks = state.activeBetrayals.filter(
      (entry) => entry.casterSeat === endingPlayerSeat,
    );
    for (const link of endingLinks) {
      get().revertBetrayedPermanent(link.target.instanceId, {
        skipPatch: true,
        reason: `${link.target.cardName} returns to its original controller as Betrayal ends`,
      });
    }
  },
});
