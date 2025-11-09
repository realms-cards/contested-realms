
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
} from "../types";
import { TOKEN_BY_NAME } from "@/lib/game/tokens";
import { prepareCardForSeat } from "../utils/cardHelpers";
import {
  createPermanentDeltaPatch,
  createPermanentsPatch,
} from "../utils/patchHelpers";
import { randomTilt } from "../utils/permanentHelpers";
import { createZonesPatchFor } from "../utils/zoneHelpers";
import { computeThresholdTotals } from "../utils/resourceHelpers";
import { newPermanentInstanceId } from "../utils/idHelpers";
import {
  evaluateInstantPermission,
  expireInteractionGrant,
} from "./helpers";

export type PlayActionsSlice = Pick<
  GameState,
  | "playSelectedTo"
  | "playFromPileTo"
  | "drawFromPileToHand"
  | "moveCardFromHandToPile"
>;

export const createPlayActionsSlice: StateCreator<
  GameState,
  [],
  [],
  PlayActionsSlice
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
      const instantPermission = !isCurrent
        ? evaluateInstantPermission(state, who)
        : { allow: false, consumeId: null };
      const allowInstant = !isCurrent && instantPermission.allow;
      const consumeInstantId = allowInstant ? instantPermission.consumeId : null;
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
        const nextInteractionLog = expireInteractionGrant(
          state,
          consumeInstantId
        );
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
      const nextInteractionLog = expireInteractionGrant(
        state,
        consumeInstantId
      );
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
      const instantPermission = !isCurrent
        ? evaluateInstantPermission(state, who)
        : { allow: false, consumeId: null };
      const allowInstant = !isCurrent && instantPermission.allow;
      const consumeInstantId = allowInstant ? instantPermission.consumeId : null;
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
        const nextInteractionLog = expireInteractionGrant(
          state,
          consumeInstantId
        );
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
      const nextInteractionLog = expireInteractionGrant(
        state,
        consumeInstantId
      );
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
});
