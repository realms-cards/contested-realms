
import type { StateCreator } from "zustand";
import type {
  CellKey,
  GameState,
  Permanents,
  PlayerKey,
  ServerPatchT,
  Zones,
  CardRef,
} from "../types";
import {
  getCellNumber,
  ownerLabel,
  parseCellKey,
  seatFromOwner,
  toCellKey,
} from "../utils/boardHelpers";
import { prepareCardForSeat } from "../utils/cardHelpers";
import {
  createPermanentDeltaPatch,
  createPermanentsPatch,
  buildMoveDeltaPatch,
} from "../utils/patchHelpers";
import {
  movePermanentCore,
  bumpPermanentVersion,
  ensurePermanentInstanceId,
} from "../utils/permanentHelpers";
import {
  createZonesPatchFor,
  removeCardInstanceFromAllZones,
  createEmptyPlayerZones,
} from "../utils/zoneHelpers";

export type PermanentMovementSlice = Pick<
  GameState,
  | "moveSelectedPermanentTo"
  | "moveSelectedPermanentToWithOffset"
  | "movePermanentToZone"
  | "transferPermanentControl"
>;

export const createPermanentMovementSlice: StateCreator<
  GameState,
  [],
  [],
  PermanentMovementSlice
> = (set, get) => ({
moveSelectedPermanentTo: (x, y) =>
    set((state) => {
      const sel = state.selectedPermanent;
      if (!sel) return state;
      get().pushHistory();
      const fromKey: CellKey = sel.at;
      const toKey: CellKey = toCellKey(x, y);
      const exists = (state.permanents[fromKey] || [])[sel.index];
      if (!exists) return state;
      if (state.transport) {
        const ownerSeat = seatFromOwner(exists.owner);
        if (!state.actorKey || state.actorKey !== ownerSeat) {
          return state;
        }
      }
      console.log("[moveSelectedPermanentTo] Moving", exists.card.name, "from", fromKey, "to", toKey);
      const { per, movedName, removed, added, updated, newIndex } = movePermanentCore(
        state.permanents,
        fromKey,
        sel.index,
        toKey,
        null
      );
      const cellNo = getCellNumber(x, y, state.board.size.w);
      let finalPer = per;
      const finalUpdated = updated;
      let finalAdded = added;
      if (fromKey !== toKey && newIndex >= 0) {
        const movedUnit = finalPer[toKey]?.[newIndex];
        if (movedUnit && !movedUnit.tapped) {
          const arr = [...(finalPer[toKey] || [])];
          const nextTapVersion = Number(movedUnit.tapVersion ?? 0) + 1;
          const tappedUnit = bumpPermanentVersion({
            ...movedUnit,
            tapped: true,
            tapVersion: nextTapVersion,
          });
          arr[newIndex] = tappedUnit;
          finalPer = { ...finalPer, [toKey]: arr };
          const movedId = ensurePermanentInstanceId(tappedUnit);
          if (movedId) {
            finalAdded = finalAdded.map((item) =>
              ensurePermanentInstanceId(item) === movedId ? tappedUnit : item
            );
          }
          get().log(`Moved '${movedName}' to #${cellNo} (tapped)`);
        } else {
          get().log(`Moved '${movedName}' to #${cellNo}`);
        }
      } else {
        get().log(`Moved '${movedName}' to #${cellNo}`);
      }
      const tr = get().transport;
      if (tr) {
        console.log("[moveSelectedPermanentTo] Before movement - state.permanents[toKey]:",
          state.permanents[toKey]?.map((p) => ({
            name: p.card.name,
            tapped: p.tapped,
            owner: p.owner,
            attachedTo: p.attachedTo
          })));
        console.log("[moveSelectedPermanentTo] After movement - finalPer[toKey]:",
          finalPer[toKey]?.map((p) => ({
            name: p.card.name,
            tapped: p.tapped,
            owner: p.owner,
            attachedTo: p.attachedTo
          })));
        const patch = buildMoveDeltaPatch(
          fromKey,
          toKey,
          removed,
          finalUpdated,
          finalAdded,
          finalPer,
          state.permanents
        );
        get().trySendPatch(patch);
      }
      return {
        permanents: finalPer,
        selectedPermanent: null,
      } as Partial<GameState> as GameState;
    }),
moveSelectedPermanentToWithOffset: (x, y, offset) =>
    set((state) => {
      const sel = state.selectedPermanent;
      if (!sel) return state;
      get().pushHistory();
      const fromKey: CellKey = sel.at;
      const toKey: CellKey = toCellKey(x, y);
      const exists = (state.permanents[fromKey] || [])[sel.index];
      if (!exists) return state;
      if (state.transport) {
        const ownerSeat = seatFromOwner(exists.owner);
        if (!state.actorKey || state.actorKey !== ownerSeat) {
          return state;
        }
      }
      const { per, movedName, removed, added, updated, newIndex } = movePermanentCore(
        state.permanents,
        fromKey,
        sel.index,
        toKey,
        offset
      );
      const cellNo = getCellNumber(x, y, state.board.size.w);
      let finalPer = per;
      const finalUpdated = updated;
      let finalAdded = added;
      if (fromKey !== toKey && newIndex >= 0) {
        const movedUnit = finalPer[toKey]?.[newIndex];
        if (movedUnit && !movedUnit.tapped) {
          const arr = [...(finalPer[toKey] || [])];
          const nextTapVersion = Number(movedUnit.tapVersion ?? 0) + 1;
          const tappedUnit = bumpPermanentVersion({
            ...movedUnit,
            tapped: true,
            tapVersion: nextTapVersion,
          });
          arr[newIndex] = tappedUnit;
          finalPer = { ...finalPer, [toKey]: arr };
          const movedId = ensurePermanentInstanceId(tappedUnit);
          if (movedId) {
            finalAdded = finalAdded.map((item) =>
              ensurePermanentInstanceId(item) === movedId ? tappedUnit : item
            );
          }
          get().log(`Moved '${movedName}' to #${cellNo} (tapped)`);
        } else {
          get().log(`Moved '${movedName}' to #${cellNo}`);
        }
      } else {
        get().log(`Moved '${movedName}' to #${cellNo}`);
      }
      const tr = get().transport;
      if (tr) {
        const patch = buildMoveDeltaPatch(
          fromKey,
          toKey,
          removed,
          finalUpdated,
          finalAdded,
          finalPer,
          state.permanents
        );
        get().trySendPatch(patch);
      }
      return {
        permanents: finalPer,
        selectedPermanent: null,
      } as Partial<GameState> as GameState;
    }),
movePermanentToZone: (at, index, target, position) =>
    set((state) => {
      get().pushHistory();
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[at] || [])];
      const item = arr.splice(index, 1)[0];
      if (!item) return state;
      const ownerKey = seatFromOwner(item.owner);
      if (state.transport) {
        if (!state.actorKey) {
          get().log("Cannot move permanents until seat ownership is established");
          return state as GameState;
        }
        if (state.actorKey !== ownerKey) {
          get().log("Cannot move opponent's permanent to a zone");
          return state as GameState;
        }
      }
      per[at] = arr;
      const owner = seatFromOwner(item.owner);
      const zonesNext = { ...state.zones } as Record<PlayerKey, Zones>;
      const seatZones = { ...zonesNext[owner] };
      const movedCard = prepareCardForSeat(item.card, owner);
      const isToken = String(item.card?.type || "").toLowerCase().includes("token");
      const finalTarget = target === "graveyard" && isToken ? "banished" : target;
      if (finalTarget === "hand") seatZones.hand = [...seatZones.hand, movedCard];
      else if (finalTarget === "graveyard")
        seatZones.graveyard = [movedCard, ...seatZones.graveyard];
      else if (target === "spellbook") {
        const pile = [...seatZones.spellbook];
        if (position === "top") pile.unshift(movedCard);
        else pile.push(movedCard);
        seatZones.spellbook = pile;
      } else if ((target as string) === "atlas") {
        const pile = [...seatZones.atlas];
        if (position === "top") pile.unshift(movedCard);
        else pile.push(movedCard);
        seatZones.atlas = pile;
      } else {
        seatZones.banished = [...seatZones.banished, movedCard];
      }
      zonesNext[owner] = seatZones;
      const { x, y } = parseCellKey(at);
      const cellNo = getCellNumber(x, y, state.board.size.w);
      get().log(
        `Moved '${item.card.name}' from #${cellNo} to ${ownerLabel(
          owner
        )} ${finalTarget}`
      );
      const removedId = ensurePermanentInstanceId(item);
      const deltaPatch = removedId
        ? createPermanentDeltaPatch([
            {
              at,
              entry: { instanceId: removedId },
              remove: true,
            },
          ])
        : null;
      const fallbackPatch = deltaPatch ? null : createPermanentsPatch(per, at);
      const zonePatch = createZonesPatchFor(zonesNext, owner);
      const patch: ServerPatchT = {};
      if (deltaPatch?.permanents)
        patch.permanents = deltaPatch.permanents;
      else if (fallbackPatch?.permanents)
        patch.permanents = fallbackPatch.permanents;
      if (zonePatch?.zones) patch.zones = zonePatch.zones;
      if (Object.keys(patch).length > 0) get().trySendPatch(patch);
      return {
        permanents: per,
        zones: zonesNext,
      } as Partial<GameState> as GameState;
    }),
transferPermanentControl: (at, index, to) =>
    set((state) => {
      get().pushHistory();
      if (state.transport && !state.actorKey) {
        get().log("Cannot transfer control until seat is established");
        return state as GameState;
      }
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[at] || [])];
      const item = arr[index];
      if (!item) return state;
      if (state.transport && state.actorKey) {
        const ownerSeat = seatFromOwner(item.owner);
        if (state.actorKey !== ownerSeat) {
          get().log("Cannot transfer opponent permanent");
          return state as GameState;
        }
      }
      const fromOwner = item.owner;
      const newOwner: 1 | 2 = to ?? (fromOwner === 1 ? 2 : 1);
      const newOwnerSeat = seatFromOwner(newOwner);
      const TILE_SIZE = 2.0;
      const STACK_MARGIN_Z = TILE_SIZE * 0.1;
      const oldOffsetZ = Number(item.offset?.[1] ?? 0);
      const oldZBase = fromOwner === 1 ? STACK_MARGIN_Z : -STACK_MARGIN_Z;
      const newZBase = newOwner === 1 ? STACK_MARGIN_Z : -STACK_MARGIN_Z;
      const adjustedOffset: [number, number] | null = item.offset
        ? [item.offset[0], oldOffsetZ + (oldZBase - newZBase)]
        : [0, oldOffsetZ + (oldZBase - newZBase)];
      const updated = bumpPermanentVersion({
        ...item,
        owner: newOwner,
        offset: adjustedOffset,
        card: prepareCardForSeat(item.card, newOwnerSeat),
      });
      arr[index] = updated;
      per[at] = arr;
      const instanceId = item.card.instanceId;
      let zonesNext = state.zones;
      let changedSeats: PlayerKey[] = [];
      if (instanceId) {
        const removal = removeCardInstanceFromAllZones(state.zones, instanceId);
        if (removal) {
          zonesNext = removal.zones;
          changedSeats = removal.seats;
        }
      }
      if (zonesNext) {
        const currentSeatZones = {
          ...(zonesNext[newOwnerSeat] ?? createEmptyPlayerZones()),
        } as Zones;
        const battlefield = [...currentSeatZones.battlefield];
        const alreadyPresent = instanceId
          ? battlefield.some((card) => card.instanceId === instanceId)
          : battlefield.some((card) => card.cardId === item.card.cardId);
        if (!alreadyPresent) {
          battlefield.push(prepareCardForSeat(item.card, newOwnerSeat));
          currentSeatZones.battlefield = battlefield;
          zonesNext = {
            ...zonesNext,
            [newOwnerSeat]: currentSeatZones,
          } as GameState["zones"];
          if (!changedSeats.includes(newOwnerSeat)) {
            changedSeats.push(newOwnerSeat);
          }
        }
      }
      const { x, y } = parseCellKey(at);
      const cellNo = getCellNumber(x, y, state.board.size.w);
      get().log(
        `Control of '${item.card.name}' at #${cellNo} transferred to P${newOwner}`
      );
      const current = arr[index];
      const deltaPatch =
        current && current.instanceId
          ? createPermanentDeltaPatch([
              {
                at,
                entry: {
                  instanceId: current.instanceId,
                  owner: current.owner,
                  offset: current.offset,
                  card: { ...(current.card as CardRef) },
                  version: current.version,
                },
              },
            ])
          : null;
      const fallbackPatch = deltaPatch ? null : createPermanentsPatch(per, at);
      const patch: ServerPatchT = {};
      if (deltaPatch) Object.assign(patch, deltaPatch);
      else if (fallbackPatch?.permanents)
        patch.permanents = fallbackPatch.permanents;
      if (zonesNext !== state.zones) {
        const seatsForZone: PlayerKey[] = [
          seatFromOwner(fromOwner),
          newOwnerSeat,
        ];
        const zonePatch = createZonesPatchFor(
          zonesNext as GameState["zones"],
          seatsForZone
        );
        if (zonePatch?.zones) {
          (patch as Record<string, unknown>).__allowZoneSeats = seatsForZone;
          patch.zones = zonePatch.zones;
        }
      }
      if (Object.keys(patch).length > 0) get().trySendPatch(patch);
      return {
        permanents: per,
        ...(zonesNext !== state.zones ? { zones: zonesNext } : {}),
      } as Partial<GameState> as GameState;
    }),
});
