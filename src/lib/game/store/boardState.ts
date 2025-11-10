import type { StateCreator } from "zustand";
import type {
  GameState,
  PlayerKey,
  ServerPatchT,
  Zones,
} from "./types";
import { createZonesPatchFor } from "./utils/zoneHelpers";
import { prepareCardForSeat } from "./utils/cardHelpers";
import { removeCardInstanceFromAllZones } from "./utils/zoneHelpers";
import {
  getCellNumber,
  ownerLabel,
  seatFromOwner,
  toCellKey,
} from "./utils/boardHelpers";

export const createInitialBoard = (): GameState["board"] => ({
  size: { w: 5, h: 4 },
  sites: {},
});

type BoardSlice = Pick<
  GameState,
  | "board"
  | "toggleTapSite"
  | "moveSiteToZone"
  | "transferSiteControl"
>;

export const createBoardSlice: StateCreator<
  GameState,
  [],
  [],
  BoardSlice
> = (set, get) => ({
  board: createInitialBoard(),

  toggleTapSite: () =>
    set((state) => {
      get().log("Sites do not tap.");
      return state as GameState;
    }),

  moveSiteToZone: (x, y, target, position) =>
    set((state) => {
      get().pushHistory();
      const key = toCellKey(x, y);
      const site = state.board.sites[key];
      if (!site || !site.card) return state;
      if (state.transport) {
        if (!state.actorKey) {
          get().log("Cannot move sites until seat ownership is established");
          return state as GameState;
        }
        const ownerKey = seatFromOwner(site.owner);
        if (state.actorKey !== ownerKey) {
          get().log("Cannot move opponent's site to a zone");
          return state as GameState;
        }
      }
      const owner = seatFromOwner(site.owner);
      const sites = { ...state.board.sites };
      delete sites[key];
      const zones = { ...state.zones } as Record<PlayerKey, Zones>;
      const z = { ...zones[owner] };
      const movedSiteCard = site.card
        ? prepareCardForSeat(site.card, owner)
        : site.card;
      if (target === "hand" && movedSiteCard) {
        z.hand = [...z.hand, movedSiteCard];
      } else if (target === "graveyard" && movedSiteCard) {
        z.graveyard = [movedSiteCard, ...z.graveyard];
      } else if (target === "atlas" && movedSiteCard) {
        const pile = [...z.atlas];
        if (position === "top") pile.unshift(movedSiteCard);
        else pile.push(movedSiteCard);
        z.atlas = pile;
      } else if (movedSiteCard) {
        z.banished = [...z.banished, movedSiteCard];
      }
      zones[owner] = z;
      const cellNo = getCellNumber(x, y, state.board.size.w);
      const label =
        target === "hand"
          ? "hand"
          : target === "graveyard"
          ? "graveyard"
          : target === "atlas"
          ? "atlas"
          : "banished";
      get().log(
        `Moved site '${site.card.name}' from #${cellNo} to ${ownerLabel(
          owner
        )} ${label}`
      );
      const boardNext = { ...state.board, sites } as GameState["board"];
      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {
          board: boardNext,
          zones: zones as GameState["zones"],
        };
        get().trySendPatch(patch);
      }
      return {
        board: boardNext,
        zones,
      } as Partial<GameState> as GameState;
    }),

  transferSiteControl: (x, y, to) =>
    set((state) => {
      get().pushHistory();
      if (state.transport && !state.actorKey) {
        get().log("Cannot transfer control until seat is established");
        return state as GameState;
      }
      const key = toCellKey(x, y);
      const site = state.board.sites[key];
      if (!site) return state;
      if (state.transport && state.actorKey) {
        const ownerSeat = seatFromOwner(site.owner);
        if (state.actorKey !== ownerSeat) {
          get().log("Cannot transfer opponent site");
          return state as GameState;
        }
      }
      const fromOwner = site.owner;
      const newOwner: 1 | 2 = to ?? (fromOwner === 1 ? 2 : 1);
      const newOwnerSeat = seatFromOwner(newOwner);
      const updatedSiteCard = site.card
        ? prepareCardForSeat(site.card, newOwnerSeat)
        : site.card;
      const sites = {
        ...state.board.sites,
        [key]: { ...site, owner: newOwner, card: updatedSiteCard },
      };
      let zonesNext = state.zones;
      let changedSeats: PlayerKey[] = [];
      if (updatedSiteCard?.instanceId) {
        const removal = removeCardInstanceFromAllZones(
          state.zones,
          updatedSiteCard.instanceId
        );
        if (removal) {
          zonesNext = removal.zones;
          changedSeats = removal.seats;
        }
      }
      const zonePatch = createZonesPatchFor(
        zonesNext as GameState["zones"],
        changedSeats.length ? changedSeats : [newOwnerSeat]
      );
      const boardNext = { ...state.board, sites } as GameState["board"];
      get().log(
        `Site at #${getCellNumber(
          x,
          y,
          state.board.size.w
        )} transfers to P${newOwner}`
      );
      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {
          board: boardNext,
          ...(zonePatch?.zones ? { zones: zonePatch.zones } : {}),
        };
        get().trySendPatch(patch);
      }
      return {
        board: boardNext,
        ...(zonePatch?.zones ? { zones: zonesNext } : {}),
      } as Partial<GameState> as GameState;
    }),
});
