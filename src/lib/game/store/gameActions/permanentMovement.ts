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
      if (state.transport && state.localPlayerId) {
        const ownerSeat = seatFromOwner(exists.owner);
        if (!state.actorKey || state.actorKey !== ownerSeat) {
          return state;
        }
      }
      console.log(
        "[moveSelectedPermanentTo] Moving",
        exists.card.name,
        "from",
        fromKey,
        "to",
        toKey
      );
      const { per, movedName, removed, added, updated, newIndex } =
        movePermanentCore(state.permanents, fromKey, sel.index, toKey, null);
      const cellNo = getCellNumber(x, y, state.board.size.w);
      const ownerKey = seatFromOwner(exists.owner);
      const ownerPlayerNum = ownerKey === "p1" ? "1" : "2";
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
          get().log(
            `Moved [p${ownerPlayerNum}card:${movedName}] to #${cellNo} (tapped)`
          );
        } else {
          get().log(
            `Moved [p${ownerPlayerNum}card:${movedName}] to #${cellNo}`
          );
        }
      } else {
        get().log(`Moved [p${ownerPlayerNum}card:${movedName}] to #${cellNo}`);
      }
      const tr = get().transport;
      if (tr) {
        console.log(
          "[moveSelectedPermanentTo] Before movement - state.permanents[toKey]:",
          state.permanents[toKey]?.map((p) => ({
            name: p.card.name,
            tapped: p.tapped,
            owner: p.owner,
            attachedTo: p.attachedTo,
          }))
        );
        console.log(
          "[moveSelectedPermanentTo] After movement - finalPer[toKey]:",
          finalPer[toKey]?.map((p) => ({
            name: p.card.name,
            tapped: p.tapped,
            owner: p.owner,
            attachedTo: p.attachedTo,
          }))
        );
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
      if (state.transport && state.localPlayerId) {
        const ownerSeat = seatFromOwner(exists.owner);
        if (!state.actorKey || state.actorKey !== ownerSeat) {
          return state;
        }
      }
      const { per, movedName, removed, added, updated, newIndex } =
        movePermanentCore(state.permanents, fromKey, sel.index, toKey, offset);
      const cellNo = getCellNumber(x, y, state.board.size.w);
      const ownerKey = seatFromOwner(exists.owner);
      const ownerPlayerNum = ownerKey === "p1" ? "1" : "2";
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
          get().log(
            `Moved [p${ownerPlayerNum}card:${movedName}] to #${cellNo} (tapped)`
          );
        } else {
          get().log(
            `Moved [p${ownerPlayerNum}card:${movedName}] to #${cellNo}`
          );
        }
      } else {
        get().log(`Moved [p${ownerPlayerNum}card:${movedName}] to #${cellNo}`);
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
      const item = arr[index];
      if (!item) return state;
      const ownerKey = seatFromOwner(item.owner);
      if (state.transport && state.localPlayerId) {
        if (!state.actorKey) {
          get().log(
            "Cannot move permanents until seat ownership is established"
          );
          return state as GameState;
        }
        const isOwner = state.actorKey === ownerKey;
        // Acting player can send opponent's permanents to graveyard/banished (destroy effects)
        const isActingPlayer =
          (state.actorKey === "p1" && state.currentPlayer === 1) ||
          (state.actorKey === "p2" && state.currentPlayer === 2);
        const canMoveToDestructiveZone =
          target === "graveyard" || target === "banished";
        if (!isOwner && !(isActingPlayer && canMoveToDestructiveZone)) {
          get().log("Cannot move opponent's permanent to a zone");
          return state as GameState;
        }
      }

      // Find all attachments attached to this permanent before removing it
      const attachedIndices: number[] = [];
      arr.forEach((perm, idx) => {
        if (
          perm.attachedTo &&
          perm.attachedTo.at === at &&
          perm.attachedTo.index === index
        ) {
          attachedIndices.push(idx);
        }
      });

      // Collect attached items (in reverse order for safe splicing)
      const attachedItems = attachedIndices
        .sort((a, b) => b - a)
        .map((idx) => arr[idx]);

      // Remove attachments first (in reverse order to preserve indices)
      attachedIndices
        .sort((a, b) => b - a)
        .forEach((idx) => {
          arr.splice(idx, 1);
        });

      // Now find the new index of the main item after attachments were removed
      const newMainIndex = arr.findIndex(
        (p) => ensurePermanentInstanceId(p) === ensurePermanentInstanceId(item)
      );
      if (newMainIndex === -1) return state;

      // Remove the main item
      arr.splice(newMainIndex, 1);

      // Update attachedTo indices for remaining permanents
      arr.forEach((perm, idx) => {
        if (perm.attachedTo && perm.attachedTo.at === at) {
          let newAttachIndex = perm.attachedTo.index;
          // Adjust for removed attachments
          for (const removedIdx of attachedIndices) {
            if (removedIdx < perm.attachedTo.index) {
              newAttachIndex--;
            }
          }
          // Adjust for removed main item
          if (index < perm.attachedTo.index) {
            newAttachIndex--;
          }
          if (newAttachIndex !== perm.attachedTo.index) {
            arr[idx] = {
              ...perm,
              attachedTo: { ...perm.attachedTo, index: newAttachIndex },
            };
          }
        }
      });

      per[at] = arr;
      const owner = seatFromOwner(item.owner);
      const zonesNext = { ...state.zones } as Record<PlayerKey, Zones>;
      const seatZones = { ...zonesNext[owner] };
      const movedCard = prepareCardForSeat(item.card, owner);
      const isToken = String(item.card?.type || "")
        .toLowerCase()
        .includes("token");
      const finalTarget =
        target === "graveyard" && isToken ? "banished" : target;
      if (finalTarget === "hand")
        seatZones.hand = [...seatZones.hand, movedCard];
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

      // Store the main item's zones first
      zonesNext[owner] = seatZones;

      // Send attachments to graveyard (tokens go to banished)
      // Each attachment goes to its owner's graveyard
      const removedIds: string[] = [];
      const removedId = ensurePermanentInstanceId(item);
      if (removedId) removedIds.push(removedId);

      for (const attached of attachedItems) {
        const attachOwner = seatFromOwner(attached.owner);
        const attachedCard = prepareCardForSeat(attached.card, attachOwner);
        const attachedIsToken = String(attached.card?.type || "")
          .toLowerCase()
          .includes("token");

        // Get the current zones for the attachment's owner (may have been updated already)
        const attachZones = { ...zonesNext[attachOwner] };

        if (attachedIsToken) {
          attachZones.banished = [...attachZones.banished, attachedCard];
        } else {
          // Non-token attachments (artifacts) go to graveyard
          attachZones.graveyard = [attachedCard, ...attachZones.graveyard];
        }
        zonesNext[attachOwner] = attachZones;

        const attachedId = ensurePermanentInstanceId(attached);
        if (attachedId) removedIds.push(attachedId);

        const attachPlayerNum = attachOwner === "p1" ? "1" : "2";
        get().log(
          `Attachment [p${attachPlayerNum}card:${
            attached.card.name
          }] sent to [p${attachPlayerNum}:PLAYER] ${
            attachedIsToken ? "banished" : "cemetery"
          }`
        );
      }
      const { x, y } = parseCellKey(at);
      const cellNo = getCellNumber(x, y, state.board.size.w);
      const playerNum = owner === "p1" ? "1" : "2";
      const zoneLabel =
        finalTarget === "hand"
          ? "hand"
          : finalTarget === "graveyard"
          ? "cemetery"
          : finalTarget === "banished"
          ? "banished"
          : finalTarget === "spellbook"
          ? "Spellbook"
          : "Atlas";
      get().log(
        `[p${playerNum}:PLAYER] moved [p${playerNum}card:${item.card.name}] from #${cellNo} to ${zoneLabel}`
      );
      // Broadcast toast to both players
      const toastMessage = `[p${playerNum}:PLAYER] moved [p${playerNum}card:${item.card.name}] to ${zoneLabel}`;
      const tr = get().transport;
      if (tr?.sendMessage) {
        try {
          tr.sendMessage({
            type: "toast",
            text: toastMessage,
            seat: owner,
          } as never);
        } catch {}
      } else {
        // Offline: show local toast
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", {
                detail: { message: toastMessage },
              })
            );
          }
        } catch {}
      }

      // Build delta patch for all removed permanents (main + attachments)
      const deltaPatch =
        removedIds.length > 0
          ? createPermanentDeltaPatch(
              removedIds.map((id) => ({
                at,
                entry: { instanceId: id },
                remove: true,
              }))
            )
          : null;
      const fallbackPatch = deltaPatch ? null : createPermanentsPatch(per, at);
      // Include all affected seats in the zone patch (owner + any attachment owners)
      const affectedSeats = new Set<PlayerKey>([owner]);
      for (const attached of attachedItems) {
        affectedSeats.add(seatFromOwner(attached.owner));
      }
      const zonePatch = createZonesPatchFor(
        zonesNext,
        Array.from(affectedSeats)
      );
      const patch: ServerPatchT = {};
      if (deltaPatch?.permanents) patch.permanents = deltaPatch.permanents;
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
      const newOwnerNum = newOwner === 1 ? "1" : "2";
      get().log(
        `Control of [p${newOwnerNum}card:${item.card.name}] at #${cellNo} transferred to P${newOwner}`
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
