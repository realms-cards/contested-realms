import type { StateCreator } from "zustand";
import type {
  CardRef,
  CellKey,
  GameState,
  Permanents,
  PermanentItem,
  PlayerKey,
  ServerPatchT,
  Thresholds,
  Zones,
} from "./types";
import {
  TOKEN_BY_NAME,
} from "@/lib/game/tokens";
import {
  prepareCardForSeat,
} from "./utils/cardHelpers";
import {
  createPermanentDeltaPatch,
  createPermanentsPatch,
  buildMoveDeltaPatch,
} from "./utils/patchHelpers";
import {
  movePermanentCore,
  bumpPermanentVersion,
  ensurePermanentInstanceId,
  randomTilt,
} from "./utils/permanentHelpers";
import {
  createZonesPatchFor,
  removeCardInstanceFromAllZones,
  createEmptyPlayerZones,
} from "./utils/zoneHelpers";
import { computeThresholdTotals } from "./utils/resourceHelpers";
import { newPermanentInstanceId } from "./utils/idHelpers";

type GameActionsSlice = Pick<
  GameState,
  | "playSelectedTo"
  | "playFromPileTo"
  | "drawFromPileToHand"
  | "moveCardFromHandToPile"
  | "moveSelectedPermanentTo"
  | "moveSelectedPermanentToWithOffset"
  | "movePermanentToZone"
  | "transferPermanentControl"
>;

export const createGameActionsSlice: StateCreator<
  GameState,
  [],
  [],
  GameActionsSlice
> = (set, get) => ({
  playSelectedTo: (x, y) =>
    set((state) => {
      const sel = state.selectedCard;
      if (!sel) {
        get().log("No selected card to play");
        return state;
      }
      const { who, index, card } = sel;
      const typeEarly = (card.type || "").toLowerCase();
      const isCurrent = (who === "p1" ? 1 : 2) === state.currentPlayer;
      let consumeInstantId: string | null = null;
      const allowInstant =
        !isCurrent &&
        !!state.transport &&
        (() => {
          const myId = state.localPlayerId;
          for (const [rid, entry] of Object.entries(state.interactionLog)) {
            if (!entry || entry.status !== "approved") continue;
            if (entry.request.kind !== "instantSpell") continue;
            const g = entry.grant;
            if (!g) continue;
            const isMe = myId ? g.grantedTo === myId : entry.direction === "outbound";
            if (!isMe) continue;
            const exp = typeof g.expiresAt === "number" ? g.expiresAt : null;
            if (exp !== null && exp <= Date.now()) continue;
            if (g.singleUse) consumeInstantId = rid;
            return true;
          }
          return false;
        })();
      if (!isCurrent && !allowInstant && !typeEarly.includes("token")) {
        get().log(
          `Cannot play '${card.name}': ${who.toUpperCase()} is not the current player`
        );
        return state;
      }
      const type = typeEarly;
      if (!type.includes("site")) {
        const req = (card.thresholds || {}) as Partial<
          Record<keyof Thresholds, number>
        >;
        const have = computeThresholdTotals(state.board, state.permanents, who);
        const miss: string[] = [];
        for (const kk of Object.keys(req) as (keyof Thresholds)[]) {
          const need = Number(req[kk] ?? 0);
          const haveVal = Number(have[kk] ?? 0);
          if (need > haveVal) {
            miss.push(`${kk} ${need - haveVal}`);
          }
        }
        if (miss.length) {
          get().log(
            `[Warning] '${card.name}' missing thresholds (${miss.join(", ")})`
          );
        }
      }
      if (
        !type.includes("site") &&
        !type.includes("token") &&
        state.phase !== "Main" &&
        !allowInstant
      ) {
        get().log(`Cannot play '${card.name}' during ${state.phase} phase`);
        return state;
      }
      get().pushHistory();
      const hand = [...state.zones[who].hand];
      hand.splice(index, 1);
      const key: CellKey = `${x},${y}`;
      const cellNo = y * state.board.size.w + x + 1;
      const isRubble =
        type.includes("token") &&
        TOKEN_BY_NAME[(card.name || "").toLowerCase()]?.siteReplacement;
      if (type.includes("site")) {
        if (state.board.sites[key]) {
          get().log(
            `Cannot play site '${card.name}': #${cellNo} already occupied`
          );
          return state;
        }
        const sites = {
          ...state.board.sites,
          [key]: { owner: (who === "p1" ? 1 : 2) as 1 | 2, tapped: false, card },
        };
        get().log(`${who.toUpperCase()} plays site '${card.name}' at #${cellNo}`);
        const tr = get().transport;
        if (tr) {
          const zonesNext = {
            ...state.zones,
            [who]: { ...state.zones[who], hand },
          } as GameState["zones"];
          const zonePatch = createZonesPatchFor(zonesNext, who);
          const patch: ServerPatchT = {
            ...(zonePatch?.zones ? { zones: zonePatch.zones } : {}),
            board: { ...state.board, sites } as GameState["board"],
          };
          get().trySendPatch(patch);
        }
        if (!state.avatars[who]?.tapped) {
          try {
            get().toggleTapAvatar(who);
          } catch {}
        }
        let nextInteractionLog: GameState["interactionLog"] | undefined;
        if (consumeInstantId) {
          nextInteractionLog = {
            ...(state.interactionLog as GameState["interactionLog"]),
          };
          const e0 = nextInteractionLog[consumeInstantId];
          if (e0) {
            nextInteractionLog[consumeInstantId] = {
              ...e0,
              status: "expired",
              updatedAt: Date.now(),
            } as typeof e0;
          }
        }
        return {
          zones: {
            ...state.zones,
            [who]: { ...state.zones[who], hand },
          } as GameState["zones"],
          board: { ...state.board, sites },
          selectedCard: null,
          selectedPermanent: null,
          ...(nextInteractionLog ? { interactionLog: nextInteractionLog } : {}),
        } as Partial<GameState> as GameState;
      }
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[key] || [])];
      const cardWithId = prepareCardForSeat(card, who);
      arr.push({
        owner: (who === "p1" ? 1 : 2) as 1 | 2,
        card: cardWithId,
        offset: null,
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId: cardWithId.instanceId ?? newPermanentInstanceId(),
      });
      per[key] = arr;
      get().log(`${who.toUpperCase()} plays '${card.name}' at #${cellNo}`);
      const zonesNext = {
        ...state.zones,
        [who]: { ...state.zones[who], hand },
      } as GameState["zones"];
      const newest = arr[arr.length - 1];
      const deltaPatch = newest
        ? createPermanentDeltaPatch([
            {
              at: key,
              entry: { ...(newest as PermanentItem) },
            },
          ])
        : null;
      const fallbackPatch = deltaPatch ? null : createPermanentsPatch(per, key);
      const zonePatch = createZonesPatchFor(zonesNext, who);
      const combined: ServerPatchT = {};
      if (deltaPatch) Object.assign(combined, deltaPatch);
      else if (fallbackPatch?.permanents)
        combined.permanents = fallbackPatch.permanents;
      if (zonePatch?.zones) combined.zones = zonePatch.zones;
      if (Object.keys(combined).length > 0) get().trySendPatch(combined);
      let nextInteractionLog: GameState["interactionLog"] | undefined;
      if (consumeInstantId) {
        nextInteractionLog = {
          ...(state.interactionLog as GameState["interactionLog"]),
        };
        const e0 = nextInteractionLog[consumeInstantId];
        if (e0) {
          nextInteractionLog[consumeInstantId] = {
            ...e0,
            status: "expired",
            updatedAt: Date.now(),
          } as typeof e0;
        }
      }
      return {
        zones: zonesNext,
        permanents: per,
        selectedCard: null,
        selectedPermanent: null,
        ...(nextInteractionLog ? { interactionLog: nextInteractionLog } : {}),
      } as Partial<GameState> as GameState;
    }),

  playFromPileTo: (x, y) =>
    set((state) => {
      const info = state.dragFromPile;
      if (!info || !info.card) return state;
      const who = info.who;
      const from = info.from;
      const card = info.card;
      const type = (card.type || "").toLowerCase();
      if (
        from !== "tokens" &&
        state.transport &&
        state.actorKey &&
        state.actorKey !== who
      ) {
        get().log(`Cannot play from opponent's ${from}`);
        return {
          dragFromPile: null,
          dragFromHand: false,
        } as Partial<GameState> as GameState;
      }
      const isCurrent = (who === "p1" ? 1 : 2) === state.currentPlayer;
      let consumeInstantId: string | null = null;
      const allowInstant =
        !isCurrent &&
        !!state.transport &&
        (() => {
          const myId = state.localPlayerId;
          for (const [rid, entry] of Object.entries(state.interactionLog)) {
            if (!entry || entry.status !== "approved") continue;
            if (entry.request.kind !== "instantSpell") continue;
            const g = entry.grant;
            if (!g) continue;
            const isMe = myId ? g.grantedTo === myId : entry.direction === "outbound";
            if (!isMe) continue;
            const exp = typeof g.expiresAt === "number" ? g.expiresAt : null;
            if (exp !== null && exp <= Date.now()) continue;
            if (g.singleUse) consumeInstantId = rid;
            return true;
          }
          return false;
        })();
      if (!isCurrent && !allowInstant && !type.includes("token")) {
        get().log(
          `Cannot play '${card.name}' from ${from}: ${who.toUpperCase()} is not the current player`
        );
        return {
          dragFromPile: null,
          dragFromHand: false,
        } as Partial<GameState> as GameState;
      }
      if (
        !type.includes("site") &&
        !type.includes("token") &&
        state.phase !== "Main" &&
        !allowInstant
      ) {
        get().log(
          `Cannot play '${card.name}' from ${from} during ${state.phase} phase`
        );
        return {
          dragFromPile: null,
          dragFromHand: false,
        } as Partial<GameState> as GameState;
      }
      get().pushHistory();
      const z = { ...state.zones[who] };
      let pileName: keyof Zones | null = null;
      let pile: CardRef[] = [];
      if (from !== "tokens") {
        pileName = from as keyof Zones;
        pile = [...(z[pileName] as CardRef[])];
        let removedIndex = pile.findIndex((c) => c === card);
        if (removedIndex < 0) {
          removedIndex = pile.findIndex(
            (c) =>
              c.cardId === card.cardId &&
              c.variantId === card.variantId &&
              c.name === card.name
          );
        }
        if (removedIndex < 0) {
          get().log(`Card to play from ${from} was not found`);
          return {
            dragFromPile: null,
            dragFromHand: false,
          } as Partial<GameState> as GameState;
        }
        const removed = pile.splice(removedIndex, 1)[0];
        if (!removed) {
          get().log(`Card to play from ${from} was not found`);
          return {
            dragFromPile: null,
            dragFromHand: false,
          } as Partial<GameState> as GameState;
        }
      }
      const key: CellKey = `${x},${y}`;
      const cellNo = y * state.board.size.w + x + 1;
      const isRubble =
        type.includes("token") &&
        TOKEN_BY_NAME[(card.name || "").toLowerCase()]?.siteReplacement;
      if (isRubble && state.board.sites[key]) {
        get().log(
          `Cannot place token '${card.name}': #${cellNo} already occupied`
        );
        return {
          dragFromPile: null,
          dragFromHand: false,
        } as Partial<GameState> as GameState;
      }
      if (type.includes("site")) {
        if (state.board.sites[key]) {
          get().log(
            `Cannot play site '${card.name}': #${cellNo} already occupied`
          );
          return {
            dragFromPile: null,
            dragFromHand: false,
          } as Partial<GameState> as GameState;
        }
        const ensuredSiteCard = prepareCardForSeat(card, who);
        const sites = {
          ...state.board.sites,
          [key]: {
            owner: (who === "p1" ? 1 : 2) as 1 | 2,
            tapped: false,
            card: ensuredSiteCard,
          },
        };
        get().log(
          `${who.toUpperCase()} plays site '${card.name}' from ${from} at #${cellNo}`
        );
        const zonesNext =
          pileName !== null
            ? ({
                ...state.zones,
                [who]: { ...z, [pileName]: pile },
              } as GameState["zones"])
            : state.zones;
        const tr = get().transport;
        if (tr) {
          const zonePatch = createZonesPatchFor(zonesNext, who);
          const patch: ServerPatchT = {
            ...(zonePatch?.zones ? { zones: zonePatch.zones } : {}),
            board: { ...state.board, sites } as GameState["board"],
          };
          get().trySendPatch(patch);
        }
        let nextInteractionLog: GameState["interactionLog"] | undefined;
        if (consumeInstantId) {
          nextInteractionLog = {
            ...(state.interactionLog as GameState["interactionLog"]),
          };
          const e0 = nextInteractionLog[consumeInstantId];
          if (e0) {
            nextInteractionLog[consumeInstantId] = {
              ...e0,
              status: "expired",
              updatedAt: Date.now(),
            } as typeof e0;
          }
        }
        return {
          zones: zonesNext,
          board: { ...state.board, sites },
          dragFromPile: null,
          dragFromHand: false,
          ...(nextInteractionLog ? { interactionLog: nextInteractionLog } : {}),
        } as Partial<GameState> as GameState;
      }
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[key] || [])];
      const cardWithId = prepareCardForSeat(card, who);
      arr.push({
        owner: (who === "p1" ? 1 : 2) as 1 | 2,
        card: cardWithId,
        offset: null,
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId: cardWithId.instanceId ?? newPermanentInstanceId(),
      });
      per[key] = arr;
      get().log(
        `${who.toUpperCase()} plays '${card.name}' from ${from} at #${cellNo}`
      );
      const zonesNext =
        pileName !== null
          ? ({
              ...state.zones,
              [who]: { ...z, [pileName]: pile },
            } as GameState["zones"])
          : null;
      const newest = arr[arr.length - 1];
      const deltaPatch = newest
        ? createPermanentDeltaPatch([
            {
              at: key,
              entry: { ...(newest as PermanentItem) },
            },
          ])
        : null;
      const fallbackPatch = deltaPatch ? null : createPermanentsPatch(per, key);
      const zonePatch = zonesNext
        ? createZonesPatchFor(zonesNext, who)
        : null;
      const combined: ServerPatchT = {};
      if (deltaPatch) Object.assign(combined, deltaPatch);
      else if (fallbackPatch?.permanents)
        combined.permanents = fallbackPatch.permanents;
      if (zonePatch?.zones) combined.zones = zonePatch.zones;
      if (Object.keys(combined).length > 0) get().trySendPatch(combined);
      let nextInteractionLog: GameState["interactionLog"] | undefined;
      if (consumeInstantId) {
        nextInteractionLog = {
          ...(state.interactionLog as GameState["interactionLog"]),
        };
        const e0 = nextInteractionLog[consumeInstantId];
        if (e0) {
          nextInteractionLog[consumeInstantId] = {
            ...e0,
            status: "expired",
            updatedAt: Date.now(),
          } as typeof e0;
        }
      }
      return {
        zones: zonesNext ?? state.zones,
        permanents: per,
        dragFromPile: null,
        dragFromHand: false,
        ...(nextInteractionLog ? { interactionLog: nextInteractionLog } : {}),
      } as Partial<GameState> as GameState;
    }),

  drawFromPileToHand: () =>
    set((state) => {
      const info = state.dragFromPile;
      if (!info || !info.card) return state;
      const who = info.who;
      const from = info.from;
      const card = info.card;
      if (state.transport && state.actorKey && state.actorKey !== who) {
        get().log(`Cannot draw from opponent's ${from}`);
        return { dragFromPile: null } as Partial<GameState> as GameState;
      }
      const isCurrent = (who === "p1" ? 1 : 2) === state.currentPlayer;
      if (!isCurrent) {
        get().log(
          `Cannot draw '${card.name}' from ${from}: ${who.toUpperCase()} is not the current player`
        );
        return { dragFromPile: null } as Partial<GameState> as GameState;
      }
      get().pushHistory();
      const z = { ...state.zones[who] };
      const pileName = from as keyof Zones;
      const pile = [...(z[pileName] as CardRef[])].map((pileCard) =>
        prepareCardForSeat(pileCard, who)
      );
      let removedIndex = pile.findIndex((c) => c === card);
      if (removedIndex < 0) {
        removedIndex = pile.findIndex(
          (c) =>
            c.cardId === card.cardId &&
            c.variantId === card.variantId &&
            c.name === card.name
        );
      }
      if (removedIndex < 0) {
        get().log(`Card to draw from ${from} was not found`);
        return { dragFromPile: null } as Partial<GameState> as GameState;
      }
      const removed = pile.splice(removedIndex, 1)[0];
      if (!removed) {
        get().log(`Card to draw from ${from} was not found`);
        return { dragFromPile: null } as Partial<GameState> as GameState;
      }
      const ensured = prepareCardForSeat(removed, who);
      const hand = [...z.hand, ensured];
      get().log(`${who.toUpperCase()} draws '${card.name}' from ${from} to hand`);
      const zonesNext = {
        ...state.zones,
        [who]: { ...z, [pileName]: pile, hand },
      } as GameState["zones"];
      const tr = get().transport;
      if (tr) {
        const zonePatch = createZonesPatchFor(zonesNext, who);
        if (zonePatch) get().trySendPatch(zonePatch);
      }
      return {
        zones: zonesNext,
        dragFromPile: null,
      } as Partial<GameState> as GameState;
    }),

  moveCardFromHandToPile: (who, pile, position) =>
    set((state) => {
      const selectedCard = state.selectedCard;
      if (!selectedCard || selectedCard.who !== who) return state;
      const isCurrent = (who === "p1" ? 1 : 2) === state.currentPlayer;
      if (!isCurrent) {
        get().log(
          `Cannot move card to ${pile}: ${who.toUpperCase()} is not the current player`
        );
        return state;
      }
      get().pushHistory();
      const zones = { ...state.zones[who] };
      const hand = [...zones.hand];
      const targetPile = [...(zones[pile] as CardRef[])].map((card) =>
        prepareCardForSeat(card, who)
      );
      const cardToMove = hand.splice(selectedCard.index, 1)[0];
      if (!cardToMove) {
        get().log(`Card at index ${selectedCard.index} not found in hand`);
        return state;
      }
      const ensuredCard = prepareCardForSeat(cardToMove, who);
      if (position === "top") targetPile.unshift(ensuredCard);
      else targetPile.push(ensuredCard);
      get().log(
        `${who.toUpperCase()} moves '${ensuredCard.name}' from hand to ${position} of ${pile}`
      );
      const zonesNext = {
        ...state.zones,
        [who]: { ...zones, hand, [pile]: targetPile },
      } as GameState["zones"];
      const tr = get().transport;
      if (tr) {
        const zonePatch = createZonesPatchFor(zonesNext, who);
        if (zonePatch) get().trySendPatch(zonePatch);
      }
      return {
        zones: zonesNext,
        selectedCard: null,
      } as Partial<GameState> as GameState;
    }),

  moveSelectedPermanentTo: (x, y) =>
    set((state) => {
      const sel = state.selectedPermanent;
      if (!sel) return state;
      get().pushHistory();
      const fromKey: CellKey = sel.at;
      const toKey: CellKey = `${x},${y}`;
      const exists = (state.permanents[fromKey] || [])[sel.index];
      if (!exists) return state;
      const { per, movedName, removed, added, updated, newIndex } = movePermanentCore(
        state.permanents,
        fromKey,
        sel.index,
        toKey,
        null
      );
      const cellNo = y * state.board.size.w + x + 1;
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

  moveSelectedPermanentToWithOffset: (x, y, offset) =>
    set((state) => {
      const sel = state.selectedPermanent;
      if (!sel) return state;
      get().pushHistory();
      const fromKey: CellKey = sel.at;
      const toKey: CellKey = `${x},${y}`;
      const exists = (state.permanents[fromKey] || [])[sel.index];
      if (!exists) return state;
      const { per, movedName, removed, added, updated, newIndex } = movePermanentCore(
        state.permanents,
        fromKey,
        sel.index,
        toKey,
        offset
      );
      const cellNo = y * state.board.size.w + x + 1;
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
        setTimeout(() => {
          get().trySendPatch(patch);
        }, 50);
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
      const ownerKey = (item.owner === 1 ? "p1" : "p2") as PlayerKey;
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
      const owner: PlayerKey = item.owner === 1 ? "p1" : "p2";
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
      const cell = at.split(",");
      const x = Number(cell[0] || 0);
      const y = Number(cell[1] || 0);
      const cellNo = y * state.board.size.w + x + 1;
      get().log(
        `Moved '${item.card.name}' from #${cellNo} to ${owner.toUpperCase()} ${finalTarget}`
      );
      const fallbackPatch = createPermanentsPatch(per, at);
      const zonePatch = createZonesPatchFor(zonesNext, owner);
      const patch: ServerPatchT = {};
      if (fallbackPatch?.permanents)
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
        const ownerSeat = item.owner === 1 ? "p1" : "p2";
        if (state.actorKey !== ownerSeat) {
          get().log("Cannot transfer opponent permanent");
          return state as GameState;
        }
      }
      const fromOwner = item.owner;
      const newOwner: 1 | 2 = to ?? (fromOwner === 1 ? 2 : 1);
      const newOwnerSeat: PlayerKey = newOwner === 1 ? "p1" : "p2";
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
      const cell = at.split(",");
      const x = Number(cell[0] || 0);
      const y = Number(cell[1] || 0);
      const cellNo = y * state.board.size.w + x + 1;
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
          fromOwner === 1 ? "p1" : "p2",
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
