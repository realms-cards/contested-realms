import type { StateCreator } from "zustand";
import { getPermanentOwnerBaseZ } from "@/lib/game/boardShared";
import {
  TOKEN_BY_NAME,
  newTokenInstanceId,
  tokenSlug,
} from "@/lib/game/tokens";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  InfiltrationLink,
  PendingInfiltrate,
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
import { newPermanentInstanceId } from "./utils/idHelpers";
import {
  cloneCardForPatch,
  createPermanentDeltaPatch,
  createPermanentsPatch,
  type PermanentDeltaUpdate,
} from "./utils/patchHelpers";
import {
  bumpPermanentVersion,
  ensurePermanentInstanceId,
  randomTilt,
} from "./utils/permanentHelpers";
import {
  createEmptyPlayerZones,
  createZonesPatchFor,
  removeCardInstanceFromAllZones,
} from "./utils/zoneHelpers";

function newInfiltrateId(): string {
  return `infiltrate_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
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

export type InfiltrateSlice = Pick<
  GameState,
  | "pendingInfiltrate"
  | "activeInfiltrations"
  | "beginInfiltrate"
  | "selectInfiltrateTarget"
  | "resolveInfiltrate"
  | "cancelInfiltrate"
  | "revertInfiltratedPermanent"
  | "handleInfiltrateStealthRemoved"
  | "cleanupInfiltrationForPermanent"
>;

export const createInfiltrateSlice: StateCreator<
  GameState,
  [],
  [],
  InfiltrateSlice
> = (set, get) => ({
  pendingInfiltrate: null,
  activeInfiltrations: [],

  beginInfiltrate: (input) => {
    const state = get();
    const id = newInfiltrateId();
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
        `[${casterSeat.toUpperCase()}] Infiltrate has no enemy minion target`,
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

    const pending: PendingInfiltrate = {
      id,
      spell: input.spell,
      casterSeat,
      phase: "selectingTarget",
      targetMinion: null,
      createdAt: Date.now(),
    };

    set({ pendingInfiltrate: pending } as Partial<GameState> as GameState);
    get().trySendPatch({ pendingInfiltrate: pending });

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "infiltrateBegin",
          id,
          spell: input.spell,
          casterSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${casterSeat.toUpperCase()}] casts Infiltrate - select an enemy minion`,
    );
  },

  selectInfiltrateTarget: (target) => {
    const pending = get().pendingInfiltrate;
    if (!pending || pending.phase !== "selectingTarget") return;

    const casterOwner = ownerFromSeat(pending.casterSeat);
    const type = (target.card?.type || "").toLowerCase();
    const isMinion = type.includes("minion") || type.includes("creature");
    if (!isMinion || target.owner === casterOwner) return;

    const nextPending: PendingInfiltrate = {
      ...pending,
      targetMinion: target,
      phase: "resolving",
    };

    set({ pendingInfiltrate: nextPending } as Partial<GameState> as GameState);
    get().trySendPatch({ pendingInfiltrate: nextPending });

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "infiltrateSelectTarget",
          id: pending.id,
          target,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveInfiltrate: () => {
    const state = get();
    const pending = state.pendingInfiltrate;
    if (!pending || pending.phase !== "resolving" || !pending.targetMinion)
      return;

    const targetInstanceId = pending.targetMinion.instanceId;
    if (!targetInstanceId) {
      set({ pendingInfiltrate: null } as Partial<GameState> as GameState);
      get().trySendPatch({ pendingInfiltrate: null });
      return;
    }

    const located = findPermanentByInstanceId(
      state.permanents,
      targetInstanceId,
    );
    if (!located) {
      set({ pendingInfiltrate: null } as Partial<GameState> as GameState);
      get().trySendPatch({ pendingInfiltrate: null });
      try {
        get().movePermanentToZone(
          pending.spell.at,
          pending.spell.index,
          "graveyard",
        );
      } catch {}
      return;
    }

    const stealthDef = TOKEN_BY_NAME["stealth"];
    if (!stealthDef) {
      get().log("Stealth token definition not found");
      return;
    }

    const controllerOwner = ownerFromSeat(pending.casterSeat);
    const originalOwner = located.item.owner;
    const originalOwnerSeat = seatFromOwner(originalOwner);
    const per: Permanents = { ...state.permanents };
    const arr = [...(per[located.at] || [])];
    const current = arr[located.index];
    if (!current) return;

    const nextTapVersion =
      Number(current.tapVersion ?? 0) + (current.tapped ? 0 : 1);
    const updatedTarget = bumpPermanentVersion({
      ...current,
      owner: controllerOwner,
      originalOwner,
      originalOwnerSeat,
      infiltrateId: pending.id,
      offset: computeTransferredOffset(current, controllerOwner),
      tapped: true,
      tapVersion: nextTapVersion,
      card: {
        ...prepareCardForSeat(current.card, pending.casterSeat),
        originalOwnerSeat,
      },
    });
    arr[located.index] = updatedTarget;

    const stealthCard: CardRef = {
      cardId: newTokenInstanceId(stealthDef),
      variantId: null,
      name: stealthDef.name,
      type: "Token",
      slug: tokenSlug(stealthDef),
      thresholds: null,
      instanceId: newPermanentInstanceId(),
    };
    const stealthPermanent: PermanentItem = {
      owner: controllerOwner,
      card: stealthCard,
      offset: null,
      tilt: randomTilt(),
      tapped: false,
      tapVersion: 0,
      version: 0,
      instanceId: stealthCard.instanceId ?? newPermanentInstanceId(),
      attachedTo: { at: located.at, index: located.index },
      infiltrateId: pending.id,
    };
    arr.push(stealthPermanent);
    per[located.at] = arr;

    const link: InfiltrationLink = {
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
      stealthToken: stealthPermanent.instanceId
        ? {
            at: located.at,
            instanceId: stealthPermanent.instanceId,
          }
        : null,
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
    const activeInfiltrations = [...state.activeInfiltrations, link];

    set({
      permanents: per,
      zones,
      pendingInfiltrate: null,
      activeInfiltrations,
    } as Partial<GameState> as GameState);

    const deltaPatch = createPermanentDeltaPatch([
      {
        at: located.at,
        entry: {
          instanceId: updatedTarget.instanceId ?? undefined,
          owner: updatedTarget.owner,
          originalOwner: updatedTarget.originalOwner,
          originalOwnerSeat: updatedTarget.originalOwnerSeat,
          infiltrateId: updatedTarget.infiltrateId,
          offset: updatedTarget.offset,
          tapped: updatedTarget.tapped,
          tapVersion: updatedTarget.tapVersion,
          card: cloneCardForPatch(updatedTarget.card),
          version: updatedTarget.version,
        },
      },
      {
        at: located.at,
        entry: {
          instanceId: stealthPermanent.instanceId ?? undefined,
          owner: stealthPermanent.owner,
          infiltrateId: stealthPermanent.infiltrateId,
          attachedTo: stealthPermanent.attachedTo,
          card: cloneCardForPatch(stealthPermanent.card),
          tapped: stealthPermanent.tapped,
          tapVersion: stealthPermanent.tapVersion,
          version: stealthPermanent.version,
          tilt: stealthPermanent.tilt,
        },
      },
    ]);
    const fallbackPatch = deltaPatch
      ? null
      : createPermanentsPatch(per, located.at);
    const patch: ServerPatchT = {
      pendingInfiltrate: null,
      activeInfiltrations,
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

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "infiltrateResolve",
          id: pending.id,
          targetInstanceId: updatedTarget.instanceId,
          stealthTokenInstanceId: stealthPermanent.instanceId,
          at: located.at,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const { x, y } = parseCellKey(located.at);
    const cellNo = getCellNumber(x, y, state.board.size.w, state.board.size.h);
    get().log(
      `[${pending.casterSeat.toUpperCase()}] Infiltrate resolves on ${updatedTarget.card.name} at #${cellNo}`,
    );

    try {
      get().movePermanentToZone(
        pending.spell.at,
        pending.spell.index,
        "graveyard",
      );
    } catch {}
  },

  cancelInfiltrate: () => {
    const pending = get().pendingInfiltrate;
    if (!pending) return;

    set({ pendingInfiltrate: null } as Partial<GameState> as GameState);
    get().trySendPatch({ pendingInfiltrate: null });

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "infiltrateCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  revertInfiltratedPermanent: (targetInstanceId, options) => {
    const state = get();
    const link = state.activeInfiltrations.find(
      (entry) => entry.target.instanceId === targetInstanceId,
    );
    if (!link) return;

    const located = findPermanentByInstanceId(
      state.permanents,
      targetInstanceId,
    );
    if (!located) {
      if (options?.keepLink) return;
      const activeInfiltrations = state.activeInfiltrations.filter(
        (entry) => entry.id !== link.id,
      );
      set({ activeInfiltrations } as Partial<GameState> as GameState);
      if (!options?.skipPatch) {
        get().trySendPatch({ activeInfiltrations });
      }
      return;
    }

    const current = located.item;
    if (current.owner === link.originalOwner) {
      if (!options?.keepLink) {
        const activeInfiltrations = state.activeInfiltrations.filter(
          (entry) => entry.id !== link.id,
        );
        set({ activeInfiltrations } as Partial<GameState> as GameState);
        if (!options?.skipPatch) {
          get().trySendPatch({ activeInfiltrations });
        }
      }
      return;
    }

    const per: Permanents = { ...state.permanents };
    const arr = [...(per[located.at] || [])];
    const stealthRemovalIndex = options?.removeStealthTokenInstanceId
      ? arr.findIndex(
          (item) => item.instanceId === options.removeStealthTokenInstanceId,
        )
      : -1;
    const removedStealth =
      stealthRemovalIndex >= 0 ? arr[stealthRemovalIndex] : null;
    if (stealthRemovalIndex >= 0) {
      arr.splice(stealthRemovalIndex, 1);
    }
    const targetIndex = arr.findIndex(
      (item) => item.instanceId === targetInstanceId,
    );
    if (targetIndex < 0) return;
    const updatedTarget = bumpPermanentVersion({
      ...arr[targetIndex],
      owner: link.originalOwner,
      originalOwner: undefined,
      originalOwnerSeat: null,
      infiltrateId: null,
      offset: computeTransferredOffset(arr[targetIndex], link.originalOwner),
      card: {
        ...prepareCardForSeat(arr[targetIndex].card, link.originalOwnerSeat),
        originalOwnerSeat: null,
      },
    });
    arr[targetIndex] = updatedTarget;
    per[located.at] = arr;

    const { zones, seats } = buildControlZones(
      state,
      updatedTarget.card,
      link.originalOwnerSeat,
    );
    const activeInfiltrations = options?.keepLink
      ? state.activeInfiltrations
      : state.activeInfiltrations.filter((entry) => entry.id !== link.id);

    set({
      permanents: per,
      zones,
      activeInfiltrations,
    } as Partial<GameState> as GameState);

    if (!options?.skipPatch) {
      const deltaUpdates: PermanentDeltaUpdate[] = [
        {
          at: located.at,
          entry: {
            instanceId: updatedTarget.instanceId ?? undefined,
            owner: updatedTarget.owner,
            originalOwner: undefined,
            originalOwnerSeat: null,
            infiltrateId: null,
            offset: updatedTarget.offset,
            card: cloneCardForPatch(updatedTarget.card),
            version: updatedTarget.version,
          },
        },
      ];
      if (removedStealth?.instanceId) {
        deltaUpdates.push({
          at: located.at,
          entry: { instanceId: removedStealth.instanceId },
          remove: true,
        });
      }
      const deltaPatch = createPermanentDeltaPatch(deltaUpdates);
      const fallbackPatch = deltaPatch
        ? null
        : createPermanentsPatch(per, located.at);
      const patch: ServerPatchT = {
        activeInfiltrations,
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

  handleInfiltrateStealthRemoved: (stealthTokenInstanceId) => {
    const link = get().activeInfiltrations.find(
      (entry) => entry.stealthToken?.instanceId === stealthTokenInstanceId,
    );
    if (!link) return;
    get().revertInfiltratedPermanent(link.target.instanceId, {
      removeStealthTokenInstanceId: stealthTokenInstanceId,
      reason: `${link.target.cardName} is breaking Stealth`,
    });
  },

  cleanupInfiltrationForPermanent: (targetInstanceId, options) => {
    const state = get();
    const activeInfiltrations = state.activeInfiltrations.filter(
      (entry) => entry.target.instanceId !== targetInstanceId,
    );
    if (activeInfiltrations.length === state.activeInfiltrations.length) return;
    set({ activeInfiltrations } as Partial<GameState> as GameState);
    if (!options?.skipPatch) {
      get().trySendPatch({ activeInfiltrations });
    }
  },
});
