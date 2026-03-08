import type { StateCreator } from "zustand";
import { isMonumentByName, isAutomatonByName } from "../omphalosState";
import type {
  CellKey,
  GameState,
  PermanentItem,
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
import { newPermanentInstanceId } from "../utils/idHelpers";
import {
  createPermanentDeltaPatch,
  createPermanentsPatch,
  buildMoveDeltaPatch,
} from "../utils/patchHelpers";
import {
  movePermanentCore,
  bumpPermanentVersion,
  ensurePermanentInstanceId,
  randomTilt,
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
  | "copyPermanent"
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
      // Tutorial action gate — block invalid movements
      const gate = state.tutorialActionGate;
      if (gate.active && gate.validate) {
        const permCard = (state.permanents[sel.at] || [])[sel.index];
        const cardName = permCard?.card?.name ?? "";
        if (!gate.validate("move", x, y, cardName)) {
          gate.onReject?.("move", x, y, cardName);
          return state;
        }
      }
      get().pushHistory();
      const fromKey: CellKey = sel.at;
      const toKey: CellKey = toCellKey(x, y);
      const exists = (state.permanents[fromKey] || [])[sel.index];
      if (!exists) return state;
      // Block Hyperparasite movement while carrying a minion
      const existsInstanceId =
        exists.instanceId ?? exists.card?.instanceId ?? null;
      if (
        existsInstanceId &&
        (exists.card?.name || "").toLowerCase() === "hyperparasite"
      ) {
        const cellPerms = state.permanents[fromKey] || [];
        const hasCarried = cellPerms.some(
          (p) =>
            p.isCarried &&
            p.attachedTo?.at === fromKey &&
            p.attachedTo?.index === sel.index,
        );
        if (hasCarried) {
          get().log(
            "Hyperparasite cannot move while carrying a minion. Drop it first.",
          );
          return state;
        }
      }
      // Only enforce ownership checks in online mode when actorKey is set
      // In hotseat mode (actorKey is null), allow all actions
      // Active player can move opponent's permanents (for combat, effects, etc.)
      if (state.transport && state.localPlayerId && state.actorKey) {
        const ownerSeat = seatFromOwner(exists.owner);
        const isActingPlayer =
          (state.actorKey === "p1" && state.currentPlayer === 1) ||
          (state.actorKey === "p2" && state.currentPlayer === 2);
        if (state.actorKey !== ownerSeat && !isActingPlayer) {
          return state;
        }
      }
      console.log(
        "[moveSelectedPermanentTo] Moving",
        exists.card.name,
        "from",
        fromKey,
        "to",
        toKey,
      );
      const { per, movedName, removed, added, updated, newIndex } =
        movePermanentCore(state.permanents, fromKey, sel.index, toKey, null);
      const cellNo = getCellNumber(x, y, state.board.size.w, state.board.size.h);
      const ownerKey = seatFromOwner(exists.owner);
      const ownerPlayerNum = ownerKey === "p1" ? "1" : "2";
      let finalPer = per;
      const finalUpdated = updated;
      let finalAdded = added;
      // When combat interactions are ON (both players opted in), don't tap on move - tap happens after selecting combat option
      // When combat interactions are OFF, tap normally on move (unless autoTapOnMove is disabled)
      // Use combatGuidesActive (requires both players to opt in) instead of local-only interactionGuides
      const shouldTapOnMove = state.autoTapOnMove && !state.combatGuidesActive;
      if (fromKey !== toKey && newIndex >= 0) {
        const movedUnit = finalPer[toKey]?.[newIndex];
        if (shouldTapOnMove && movedUnit && !movedUnit.tapped) {
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
              ensurePermanentInstanceId(item) === movedId ? tappedUnit : item,
            );
          }
          get().log(
            `Moved [p${ownerPlayerNum}card:${movedName}] to #${cellNo} (tapped)`,
          );
        } else {
          get().log(
            `Moved [p${ownerPlayerNum}card:${movedName}] to #${cellNo}`,
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
          })),
        );
        console.log(
          "[moveSelectedPermanentTo] After movement - finalPer[toKey]:",
          finalPer[toKey]?.map((p) => ({
            name: p.card.name,
            tapped: p.tapped,
            owner: p.owner,
            attachedTo: p.attachedTo,
          })),
        );
        const patch = buildMoveDeltaPatch(
          fromKey,
          toKey,
          removed,
          finalUpdated,
          finalAdded,
          finalPer,
          state.permanents,
        );
        // Include permanentPositions for moved permanent to preserve burrowed/submerged state
        const movedInstanceId = ensurePermanentInstanceId(exists);
        if (movedInstanceId && state.permanentPositions[movedInstanceId]) {
          (patch as ServerPatchT).permanentPositions = {
            [movedInstanceId]: state.permanentPositions[movedInstanceId],
          };
        }
        get().trySendPatch(patch);
      }
      // Move carried avatar with the carrier
      if (fromKey !== toKey && existsInstanceId) {
        setTimeout(() => {
          const s = get();
          const freshAvatars = { ...s.avatars };
          let avatarMoved = false;
          for (const seat of ["p1", "p2"] as const) {
            const av = freshAvatars[seat];
            if (av?.carriedBy?.instanceId === existsInstanceId) {
              const dest = parseCellKey(toKey);
              freshAvatars[seat] = {
                ...av,
                pos: [dest.x, dest.y],
                carriedBy: { ...av.carriedBy, at: toKey },
              };
              avatarMoved = true;
            }
          }
          if (avatarMoved) {
            set({ avatars: freshAvatars } as Partial<GameState> as GameState);
            s.trySendPatch({ avatars: freshAvatars });
          }
        }, 0);
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
      // Only enforce ownership checks in online mode when actorKey is set
      // In hotseat mode (actorKey is null), allow all actions
      // Active player can move opponent's permanents (for combat, effects, etc.)
      if (state.transport && state.localPlayerId && state.actorKey) {
        const ownerSeat = seatFromOwner(exists.owner);
        const isActingPlayer =
          (state.actorKey === "p1" && state.currentPlayer === 1) ||
          (state.actorKey === "p2" && state.currentPlayer === 2);
        if (state.actorKey !== ownerSeat && !isActingPlayer) {
          return state;
        }
      }
      const { per, movedName, removed, added, updated, newIndex } =
        movePermanentCore(state.permanents, fromKey, sel.index, toKey, offset);
      const cellNo = getCellNumber(x, y, state.board.size.w, state.board.size.h);
      const ownerKey = seatFromOwner(exists.owner);
      const ownerPlayerNum = ownerKey === "p1" ? "1" : "2";
      let finalPer = per;
      const finalUpdated = updated;
      let finalAdded = added;
      // When combat interactions are ON (both players opted in), don't tap on move - tap happens after selecting combat option
      // When combat interactions are OFF, tap normally on move (unless autoTapOnMove is disabled)
      // Use combatGuidesActive (requires both players to opt in) instead of local-only interactionGuides
      const shouldTapOnMove = state.autoTapOnMove && !state.combatGuidesActive;
      if (fromKey !== toKey && newIndex >= 0) {
        const movedUnit = finalPer[toKey]?.[newIndex];
        if (shouldTapOnMove && movedUnit && !movedUnit.tapped) {
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
              ensurePermanentInstanceId(item) === movedId ? tappedUnit : item,
            );
          }
          get().log(
            `Moved [p${ownerPlayerNum}card:${movedName}] to #${cellNo} (tapped)`,
          );
        } else {
          get().log(
            `Moved [p${ownerPlayerNum}card:${movedName}] to #${cellNo}`,
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
          state.permanents,
        );
        // Include permanentPositions for moved permanent to preserve burrowed/submerged state
        const movedInstanceId = ensurePermanentInstanceId(exists);
        if (movedInstanceId && state.permanentPositions[movedInstanceId]) {
          (patch as ServerPatchT).permanentPositions = {
            [movedInstanceId]: state.permanentPositions[movedInstanceId],
          };
        }
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
      // Auto-drop carried avatar when carrier is destroyed
      const itemForDrop = (state.permanents[at] || [])[index];
      if (itemForDrop) {
        const dropInstanceId =
          itemForDrop.instanceId ?? itemForDrop.card?.instanceId ?? null;
        if (dropInstanceId) {
          // Drop any avatar carried by this permanent
          setTimeout(() => {
            get().carryDropAvatar(dropInstanceId);
          }, 0);
          // Force-drop Hyperparasite carried minion
          setTimeout(() => {
            get().forceDropHyperparasiteCarried(dropInstanceId, "destroy");
          }, 0);
        }
      }
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[at] || [])];
      const item = arr[index];
      if (!item) return state;
      const ownerKey = seatFromOwner(item.owner);
      // Only enforce ownership checks in online mode when actorKey is set
      // In hotseat mode (actorKey is null), allow all actions
      if (state.transport && state.localPlayerId && state.actorKey) {
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

      // Separate attachments into carryable artifacts (stay on tile) and others (go to zones)
      const attachmentsToKeep: Array<{ idx: number; item: (typeof arr)[0] }> =
        [];
      const attachmentsToRemove: Array<{ idx: number; item: (typeof arr)[0] }> =
        [];

      for (const idx of attachedIndices) {
        const attached = arr[idx];
        const attachType = (attached.card.type || "").toLowerCase();
        const attachSubTypes = (attached.card.subTypes || "").toLowerCase();
        const attachName = attached.card.name || "";
        const isArtifact = attachType.includes("artifact");
        const isMonument =
          attachSubTypes.includes("monument") || isMonumentByName(attachName);
        const isAutomaton =
          attachSubTypes.includes("automaton") || isAutomatonByName(attachName);
        const isCarryableArtifact = isArtifact && !isMonument && !isAutomaton;

        const isCarriedUnit = attached.isCarried === true;

        if (isCarryableArtifact || isCarriedUnit) {
          // Carryable artifacts and carried units stay on the tile, detached
          attachmentsToKeep.push({ idx, item: attached });
        } else {
          // Tokens and other attachments go to zones
          attachmentsToRemove.push({ idx, item: attached });
        }
      }

      // Remove attachments from permanents array (in reverse order to preserve indices)
      const allToRemoveFromArray = [...attachmentsToRemove].sort(
        (a, b) => b.idx - a.idx,
      );
      allToRemoveFromArray.forEach(({ idx }) => {
        arr.splice(idx, 1);
      });

      // Now find the new index of the main item after some attachments were removed
      const newMainIndex = arr.findIndex(
        (p) => ensurePermanentInstanceId(p) === ensurePermanentInstanceId(item),
      );
      if (newMainIndex === -1) return state;

      // Remove the main item
      arr.splice(newMainIndex, 1);

      // Detach carryable artifacts that stay on the tile
      // They need their attachedTo cleared and indices updated
      const removedIndices = attachmentsToRemove.map((a) => a.idx);
      arr.forEach((perm, idx) => {
        const permId = ensurePermanentInstanceId(perm);
        const isKeptArtifact = attachmentsToKeep.some(
          (a) => ensurePermanentInstanceId(a.item) === permId,
        );

        if (isKeptArtifact) {
          // Clear attachedTo (and isCarried) for artifacts/carried units that stay on tile
          arr[idx] = bumpPermanentVersion({
            ...perm,
            attachedTo: null,
            isCarried: false,
          });
        } else if (perm.attachedTo && perm.attachedTo.at === at) {
          // Update attachedTo indices for other remaining permanents
          let newAttachIndex = perm.attachedTo.index;
          // Adjust for removed attachments
          for (const removedIdx of removedIndices) {
            if (removedIdx < perm.attachedTo.index) {
              newAttachIndex--;
            }
          }
          // Adjust for removed main item
          if (newMainIndex < perm.attachedTo.index) {
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

      // Create deep copy of all zone arrays to avoid mutation
      const seatZones: Zones = {
        spellbook: [...state.zones[owner].spellbook],
        atlas: [...state.zones[owner].atlas],
        hand: [...state.zones[owner].hand],
        graveyard: [...state.zones[owner].graveyard],
        battlefield: [...state.zones[owner].battlefield],
        collection: [...state.zones[owner].collection],
        banished: [...(state.zones[owner].banished || [])],
      };
      const movedCard = prepareCardForSeat(item.card, owner);
      const isToken = String(item.card?.type || "")
        .toLowerCase()
        .includes("token");
      const isCopy = !!item.isCopy;
      // Tokens and copies go to banished instead of graveyard
      const finalTarget =
        target === "graveyard" && (isToken || isCopy) ? "banished" : target;
      if (finalTarget === "hand")
        seatZones.hand = [...seatZones.hand, movedCard];
      else if (finalTarget === "graveyard") {
        // Cards always go to owner's graveyard
        // (Mortuary only affects searches/fetches, not card placement)
        seatZones.graveyard = [movedCard, ...seatZones.graveyard];
      } else if (target === "spellbook") {
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

      // Send token attachments to banished (carryable artifacts stay on tile)
      const removedIds: string[] = [];
      const removedId = ensurePermanentInstanceId(item);
      if (removedId) removedIds.push(removedId);

      for (const { item: attached } of attachmentsToRemove) {
        const attachOwner = seatFromOwner(attached.owner);
        const attachedCard = prepareCardForSeat(attached.card, attachOwner);
        const attachedIsToken = String(attached.card?.type || "")
          .toLowerCase()
          .includes("token");

        // Create deep copy of owner's zones if not already updated
        let attachZones: Zones;
        if (zonesNext[attachOwner] === state.zones[attachOwner]) {
          // Not yet updated - create deep copy
          attachZones = {
            spellbook: [...state.zones[attachOwner].spellbook],
            atlas: [...state.zones[attachOwner].atlas],
            hand: [...state.zones[attachOwner].hand],
            graveyard: [...state.zones[attachOwner].graveyard],
            battlefield: [...state.zones[attachOwner].battlefield],
            collection: [...state.zones[attachOwner].collection],
            banished: [...(state.zones[attachOwner].banished || [])],
          };
        } else {
          // Already updated - shallow copy is fine since arrays are already new
          attachZones = { ...zonesNext[attachOwner] };
        }

        if (attachedIsToken) {
          attachZones.banished = [...attachZones.banished, attachedCard];
        } else {
          // Non-token, non-carryable-artifact attachments go to owner's graveyard
          attachZones.graveyard = [attachedCard, ...attachZones.graveyard];
        }
        zonesNext[attachOwner] = attachZones;

        const attachedId = ensurePermanentInstanceId(attached);
        if (attachedId) removedIds.push(attachedId);

        const attachPlayerNum = attachOwner === "p1" ? "1" : "2";
        get().log(
          `Attachment [p${attachPlayerNum}card:${attached.card.name}] sent to ${
            attachedIsToken ? "banished" : "cemetery"
          }`,
        );
      }

      // Log carryable artifacts that stay on tile
      for (const { item: attached } of attachmentsToKeep) {
        const attachOwner = seatFromOwner(attached.owner);
        const attachPlayerNum = attachOwner === "p1" ? "1" : "2";
        get().log(
          `Artifact [p${attachPlayerNum}card:${attached.card.name}] dropped at tile`,
        );
      }

      const { x, y } = parseCellKey(at);
      const cellNo = getCellNumber(x, y, state.board.size.w, state.board.size.h);
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
        `[p${playerNum}:PLAYER] moved [p${playerNum}card:${item.card.name}] from #${cellNo} to ${zoneLabel}`,
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
              }),
            );
          }
        } catch {}
      }

      // Build delta patch for removed permanents and updated artifacts
      const deltaEntries: Array<{
        at: string;
        entry: { instanceId?: string; attachedTo?: null; version?: number };
        remove?: boolean;
      }> = [];

      // Add removed permanents (main + token attachments)
      for (const id of removedIds) {
        deltaEntries.push({ at, entry: { instanceId: id }, remove: true });
      }

      // Add updated artifacts (detached, staying on tile)
      for (const { item: attached } of attachmentsToKeep) {
        const updatedArtifact = arr.find(
          (p) =>
            ensurePermanentInstanceId(p) ===
            ensurePermanentInstanceId(attached),
        );
        if (updatedArtifact?.instanceId) {
          deltaEntries.push({
            at,
            entry: {
              instanceId: updatedArtifact.instanceId,
              attachedTo: null,
              version: updatedArtifact.version,
            },
          });
        }
      }

      const deltaPatch =
        deltaEntries.length > 0
          ? createPermanentDeltaPatch(deltaEntries)
          : null;
      const fallbackPatch = deltaPatch ? null : createPermanentsPatch(per, at);
      // Include all affected seats in the zone patch (owner + any attachment owners)
      const affectedSeats = new Set<PlayerKey>([owner]);
      for (const { item: attached } of attachmentsToRemove) {
        affectedSeats.add(seatFromOwner(attached.owner));
      }
      for (const { item: attached } of attachmentsToKeep) {
        affectedSeats.add(seatFromOwner(attached.owner));
      }

      // Build and send patch
      const zonePatch = createZonesPatchFor(
        zonesNext,
        Array.from(affectedSeats),
      );
      const patch: ServerPatchT = {};
      if (deltaPatch?.permanents) patch.permanents = deltaPatch.permanents;
      else if (fallbackPatch?.permanents)
        patch.permanents = fallbackPatch.permanents;
      if (zonePatch?.zones) {
        patch.zones = zonePatch.zones;
        // Include __allowZoneSeats to allow actor to update opponent zones
        // (e.g., when destroying opponent's cards)
        if (affectedSeats.size > 0) {
          (patch as Record<string, unknown>).__allowZoneSeats =
            Array.from(affectedSeats);
        }
      }
      // DEBUG: Log patch being sent for zone updates
      if (patch.zones) {
        console.log("[movePermanentToZone] Sending patch with zones:", {
          zoneKeys: Object.keys(patch.zones),
          allowZoneSeats: (patch as Record<string, unknown>).__allowZoneSeats,
          affectedSeats: Array.from(affectedSeats),
          ownerSeat: owner,
          actorKey: state.actorKey,
        });
      }
      if (Object.keys(patch).length > 0) get().trySendPatch(patch);

      // Cleanup for special minions/artifacts leaving the realm
      const cardNameLower = (item.card?.name || "").toLowerCase();

      // Atlantean Fate: remove flood aura when leaving the board
      // This cleans up flooded tokens and restores submerged minions
      if (cardNameLower.includes("atlantean fate")) {
        try {
          // Find the aura associated with this permanent
          const currentState = get().specialSiteState;
          const auraToRemove = currentState.atlanteanFateAuras.find(
            (aura) => aura.permanentAt === at && aura.permanentIndex === index,
          );
          if (auraToRemove) {
            // Use removeAtlanteanFateAura which handles full cleanup
            // (removes flooded tokens, restores submerged minions)
            get().removeAtlanteanFateAura(auraToRemove.id);
          }
        } catch {}
      }

      // Pith Imp: return stolen cards when leaving (uses private hand approach)
      // Trigger after state update with setTimeout to ensure state is committed
      // (otherwise zones update from removePithImpHand gets overwritten by this set() return)
      if (cardNameLower.includes("pith imp")) {
        const pithImpInstanceId = item.instanceId ?? null;
        const pithImpAt = at;
        setTimeout(() => {
          try {
            get().removePithImpHand(pithImpInstanceId, pithImpAt);
          } catch {}
        }, 0);
      }

      // Morgana le Fay: discard private hand when leaving
      // Trigger after state update with setTimeout to ensure state is committed
      // (otherwise zones update from removeMorganaHand gets overwritten by this set() return)
      if (cardNameLower.includes("morgana le fay")) {
        const morganaInstanceId = item.instanceId ?? null;
        const morganaAt = at;
        setTimeout(() => {
          try {
            get().removeMorganaHand(morganaInstanceId, morganaAt);
          } catch {}
        }, 0);
      }

      // Omphalos: discard private hand when leaving
      // Trigger after state update with setTimeout to ensure state is committed
      // (otherwise zones update from removeOmphalosHand gets overwritten by this set() return)
      if (cardNameLower.includes("omphalos")) {
        const omphalosInstanceId = item.instanceId ?? null;
        const omphalosAt = at;
        setTimeout(() => {
          try {
            get().removeOmphalosHand(omphalosInstanceId, omphalosAt);
          } catch {}
        }, 0);
      }

      // Deathrite triggers when going to graveyard:
      // - "Pigs of the Sounder" → summons "Grand Old Boars"
      // - "Squeakers" → summons "Pigs of the Sounder"
      const deathriteCards = ["pigs of the sounder", "squeakers"];
      if (
        deathriteCards.includes(cardNameLower) &&
        finalTarget === "graveyard"
      ) {
        const triggerName = item.card.name || cardNameLower;
        // Trigger after state update with setTimeout to ensure state is committed
        setTimeout(() => {
          try {
            get().triggerPigsDeathrite({
              ownerSeat: owner,
              deathLocation: at,
              triggerCardName: triggerName,
            });
          } catch {}
        }, 100);
      }

      return {
        permanents: per,
        zones: zonesNext,
      } as Partial<GameState> as GameState;
    }),
  transferPermanentControl: (at, index, to) =>
    set((state) => {
      get().pushHistory();
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[at] || [])];
      const item = arr[index];
      if (!item) return state;
      // Only enforce ownership checks in online mode when actorKey is set
      // In hotseat mode (actorKey is null), allow all actions
      // Active player can transfer control of opponent's permanents (steal effects)
      if (state.transport && state.actorKey) {
        const ownerSeat = seatFromOwner(item.owner);
        const isActingPlayer =
          (state.actorKey === "p1" && state.currentPlayer === 1) ||
          (state.actorKey === "p2" && state.currentPlayer === 2);
        if (state.actorKey !== ownerSeat && !isActingPlayer) {
          get().log("Cannot transfer opponent permanent");
          return state as GameState;
        }
      }
      const fromOwner = item.owner;
      const newOwner: 1 | 2 = to ?? (fromOwner === 1 ? 2 : 1);
      const newOwnerSeat = seatFromOwner(newOwner);
      // Adjust offset to keep permanent at same absolute position
      // Rendering uses: worldZ = zBase + offZ
      // zBase for owner 1: -TILE_SIZE * 0.5 + marginZ (roughly -0.8)
      // zBase for owner 2: +TILE_SIZE * 0.5 - marginZ (roughly +0.8)
      // To keep same worldZ: newOffZ = oldZBase + oldOffZ - newZBase
      const TILE_SIZE = 2.0;
      const MARGIN_Z = TILE_SIZE * 0.1;
      const oldZBase =
        fromOwner === 1
          ? -TILE_SIZE * 0.5 + MARGIN_Z
          : TILE_SIZE * 0.5 - MARGIN_Z;
      const newZBase =
        newOwner === 1
          ? -TILE_SIZE * 0.5 + MARGIN_Z
          : TILE_SIZE * 0.5 - MARGIN_Z;
      const oldOffZ = item.offset?.[1] ?? 0;
      const newOffZ = oldZBase + oldOffZ - newZBase;
      const adjustedOffset: [number, number] = [item.offset?.[0] ?? 0, newOffZ];
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
      const cellNo = getCellNumber(x, y, state.board.size.w, state.board.size.h);
      const newOwnerNum = newOwner === 1 ? "1" : "2";
      get().log(
        `Control of [p${newOwnerNum}card:${item.card.name}] at #${cellNo} transferred to P${newOwner}`,
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
          seatsForZone,
        );
        if (zonePatch?.zones) {
          (patch as Record<string, unknown>).__allowZoneSeats = seatsForZone;
          patch.zones = zonePatch.zones;
        }
      }
      if (Object.keys(patch).length > 0) get().trySendPatch(patch);

      // Transfer resolver registries when card ownership changes
      const cardNameLower = (item.card?.name || "").toLowerCase();
      const itemInstanceId = item.instanceId ?? null;

      // Pith Imp: transfer stolen card ownership when Pith Imp's control changes
      if (cardNameLower.includes("pith imp")) {
        setTimeout(() => {
          try {
            get().transferPithImpOwnership(itemInstanceId, at, newOwnerSeat);
          } catch {}
        }, 0);
      }

      // Omphalos: transfer private hand registry when Omphalos control changes
      if (cardNameLower.includes("omphalos")) {
        setTimeout(() => {
          try {
            const hands = get().omphalosHands;
            const updated = hands.map((o) =>
              (itemInstanceId && o.artifact.instanceId === itemInstanceId) ||
              o.artifact.at === at
                ? { ...o, ownerSeat: newOwnerSeat, artifact: { ...o.artifact, owner: newOwner } }
                : o,
            );
            if (updated !== hands) {
              set({ omphalosHands: updated } as Partial<GameState> as GameState);
              get().trySendPatch({ omphalosHands: updated });
            }
          } catch {}
        }, 0);
      }

      // Lilith: transfer minion registry when Lilith control changes
      if (cardNameLower === "lilith") {
        setTimeout(() => {
          try {
            const minions = get().lilithMinions;
            const updated = minions.map((m) =>
              m.instanceId === itemInstanceId
                ? { ...m, ownerSeat: newOwnerSeat }
                : m,
            );
            if (updated !== minions) {
              set({ lilithMinions: updated } as Partial<GameState> as GameState);
            }
          } catch {}
        }, 0);
      }

      // Mother Nature: transfer minion registry when Mother Nature control changes
      if (cardNameLower === "mother nature") {
        setTimeout(() => {
          try {
            const minions = get().motherNatureMinions;
            const updated = minions.map((m) =>
              m.instanceId === itemInstanceId
                ? { ...m, ownerSeat: newOwnerSeat }
                : m,
            );
            if (updated !== minions) {
              set({ motherNatureMinions: updated } as Partial<GameState> as GameState);
            }
          } catch {}
        }, 0);
      }

      // Headless Haunt: transfer registry when Headless Haunt control changes
      if (cardNameLower.includes("headless haunt")) {
        setTimeout(() => {
          try {
            const haunts = get().headlessHaunts;
            const updated = haunts.map((h) =>
              h.instanceId === itemInstanceId
                ? { ...h, ownerSeat: newOwnerSeat }
                : h,
            );
            if (updated !== haunts) {
              set({ headlessHaunts: updated } as Partial<GameState> as GameState);
            }
          } catch {}
        }, 0);
      }

      return {
        permanents: per,
        ...(zonesNext !== state.zones ? { zones: zonesNext } : {}),
      } as Partial<GameState> as GameState;
    }),
  copyPermanent: (at, index) =>
    set((state) => {
      get().pushHistory();
      const arr = state.permanents[at] || [];
      const item = arr[index];
      if (!item) return state;

      const ownerKey = seatFromOwner(item.owner);
      // Only allow copying in online mode for owner or active player
      if (state.transport && state.localPlayerId && state.actorKey) {
        const isActingPlayer =
          (state.actorKey === "p1" && state.currentPlayer === 1) ||
          (state.actorKey === "p2" && state.currentPlayer === 2);
        if (state.actorKey !== ownerKey && !isActingPlayer) {
          get().log("Cannot copy opponent's permanent");
          return state as GameState;
        }
      }

      // Create a copy with a new instanceId and isCopy flag
      const copyInstanceId = newPermanentInstanceId();
      const copyCard: CardRef = {
        ...item.card,
        instanceId: copyInstanceId,
      };

      const copyPermanent: PermanentItem = {
        owner: item.owner,
        card: copyCard,
        offset: [(item.offset?.[0] ?? 0) + 0.15, (item.offset?.[1] ?? 0) + 0.1], // Slight offset from original
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId: copyInstanceId,
        isCopy: true, // Mark as copy - goes to banished when leaving
      };

      // Add copy to permanents
      const permanentsNext = { ...state.permanents };
      const newArr = [...arr, copyPermanent];
      permanentsNext[at] = newArr;

      // Log the action
      const { x, y } = parseCellKey(at);
      const cellNo = getCellNumber(x, y, state.board.size.w, state.board.size.h);
      const playerNum = ownerKey === "p1" ? "1" : "2";
      get().log(
        `[p${playerNum}:PLAYER] created a token copy of [p${playerNum}card:${item.card.name}] at #${cellNo}`,
      );

      // Send patch to server
      const tr = state.transport;
      if (tr) {
        const patch: ServerPatchT = {
          permanents: permanentsNext,
        };
        get().trySendPatch(patch);

        // Send toast notification
        try {
          tr.sendMessage?.({
            type: "toast",
            text: `[p${playerNum}:PLAYER] created a token copy of [p${playerNum}card:${item.card.name}]`,
            seat: ownerKey,
          } as never);
        } catch {}
      }

      return {
        permanents: permanentsNext,
      } as Partial<GameState> as GameState;
    }),
});
