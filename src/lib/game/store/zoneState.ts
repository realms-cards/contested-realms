import type { StateCreator } from "zustand";
import {
  TOKEN_BY_NAME,
  newTokenInstanceId,
  tokenSlug,
} from "@/lib/game/tokens";
import type {
  CardRef,
  GameState,
  PlayerKey,
  ServerPatchT,
  Zones,
} from "./types";
import { prepareCardForSeat } from "./utils/cardHelpers";
import { newZoneCardInstanceId } from "./utils/idHelpers";
import {
  createEmptyZonesRecord,
  createZonesPatchFor,
} from "./utils/zoneHelpers";

type ZoneSlice = Pick<
  GameState,
  | "zones"
  | "initLibraries"
  | "shuffleSpellbook"
  | "shuffleAtlas"
  | "drawFrom"
  | "drawFromBottom"
  | "scryTop"
  | "scryMany"
  | "drawOpening"
  | "drawFromPileToHand"
  | "moveCardFromHandToPile"
  | "addTokenToHand"
  | "addCardToHand"
  | "mulligans"
  | "mulligan"
  | "mulliganWithSelection"
  | "mulliganDrawn"
  | "finalizeMulligan"
  | "moveFromBanishedToZone"
>;

export const createInitialMulligans = (): GameState["mulligans"] => ({
  p1: 1,
  p2: 1,
});
export const createInitialMulliganDrawn = (): GameState["mulliganDrawn"] => ({
  p1: [],
  p2: [],
});

export const createZoneSlice: StateCreator<GameState, [], [], ZoneSlice> = (
  set,
  get
) => ({
  zones: createEmptyZonesRecord(),

  initLibraries: (who, spellbook, atlas, collection) =>
    set((state) => {
      const mapForSeat = (cards: CardRef[]) =>
        cards.map((card) => prepareCardForSeat(card, who));
      const sub: Zones = {
        ...state.zones[who],
        spellbook: mapForSeat(spellbook as CardRef[]),
        atlas: mapForSeat(atlas as CardRef[]),
        hand: [],
        graveyard: [],
        battlefield: [],
        collection: collection ? mapForSeat(collection as CardRef[]) : [],
        banished: [],
      };
      const zonesNext = { ...state.zones, [who]: sub } as GameState["zones"];
      const tr = get().transport;
      if (tr) {
        const zonePatch = createZonesPatchFor(zonesNext, who);
        if (zonePatch) get().trySendPatch(zonePatch);
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  shuffleSpellbook: (who) =>
    set((state) => {
      const pile = [...state.zones[who].spellbook].map((card) =>
        prepareCardForSeat(card, who)
      );
      for (let i = pile.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pile[i], pile[j]] = [pile[j], pile[i]];
      }
      get().log(`${who.toUpperCase()} shuffles Spellbook (${pile.length})`);
      const zonesNext = {
        ...state.zones,
        [who]: { ...state.zones[who], spellbook: pile },
      } as GameState["zones"];
      const tr = get().transport;
      if (tr) {
        const zonePatch = createZonesPatchFor(zonesNext, who);
        if (zonePatch) get().trySendPatch(zonePatch);
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  shuffleAtlas: (who) =>
    set((state) => {
      const pile = [...state.zones[who].atlas].map((card) =>
        prepareCardForSeat(card, who)
      );
      for (let i = pile.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pile[i], pile[j]] = [pile[j], pile[i]];
      }
      get().log(`${who.toUpperCase()} shuffles Atlas (${pile.length})`);
      const zonesNext = {
        ...state.zones,
        [who]: { ...state.zones[who], atlas: pile },
      } as GameState["zones"];
      const tr = get().transport;
      if (tr) {
        const zonePatch = createZonesPatchFor(zonesNext, who);
        if (zonePatch) get().trySendPatch(zonePatch);
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  drawFrom: (who, from, count = 1) =>
    set((state) => {
      const isCurrent = (who === "p1" ? 1 : 2) === state.currentPlayer;
      if (!isCurrent || (state.phase !== "Draw" && state.phase !== "Main"))
        return state;

      get().pushHistory();

      const pile =
        from === "spellbook"
          ? [...state.zones[who].spellbook].map((card) =>
              prepareCardForSeat(card, who)
            )
          : [...state.zones[who].atlas].map((card) =>
              prepareCardForSeat(card, who)
            );
      const hand = [...state.zones[who].hand];
      for (let i = 0; i < count; i++) {
        const c = pile.shift();
        if (!c) break;
        hand.push(prepareCardForSeat(c, who));
      }
      const updated =
        from === "spellbook" ? { spellbook: pile } : { atlas: pile };
      get().log(`${who.toUpperCase()} draws ${count} from ${from}`);

      const zonesNext = {
        ...state.zones,
        [who]: { ...state.zones[who], ...updated, hand },
      } as GameState["zones"];

      const tr = get().transport;
      if (tr) {
        const zonePatch = createZonesPatchFor(zonesNext, who);
        if (zonePatch) get().trySendPatch(zonePatch);
      }

      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  drawFromBottom: (who, from, count = 1) =>
    set((state) => {
      const isCurrent = (who === "p1" ? 1 : 2) === state.currentPlayer;
      if (!isCurrent || (state.phase !== "Draw" && state.phase !== "Main"))
        return state;

      get().pushHistory();

      const pile =
        from === "spellbook"
          ? [...state.zones[who].spellbook].map((card) =>
              prepareCardForSeat(card, who)
            )
          : [...state.zones[who].atlas].map((card) =>
              prepareCardForSeat(card, who)
            );
      const hand = [...state.zones[who].hand];

      for (let i = 0; i < count; i++) {
        const c = pile.pop();
        if (!c) break;
        hand.push(prepareCardForSeat(c, who));
      }

      const updated =
        from === "spellbook" ? { spellbook: pile } : { atlas: pile };
      get().log(`${who.toUpperCase()} draws ${count} from bottom of ${from}`);

      const zonesNext = {
        ...state.zones,
        [who]: { ...state.zones[who], ...updated, hand },
      } as GameState["zones"];

      const tr = get().transport;
      if (tr) {
        const zonePatch = createZonesPatchFor(zonesNext, who);
        if (zonePatch) get().trySendPatch(zonePatch);
      }

      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  scryTop: (who, from, decision) =>
    set((state) => {
      const secondSeat: PlayerKey = state.currentPlayer === 1 ? "p2" : "p1";
      if (who !== secondSeat) return state;
      if (state.phase !== "Start") return state;
      const pile =
        from === "spellbook"
          ? [...state.zones[who].spellbook]
          : [...state.zones[who].atlas];
      if (pile.length === 0) return state;
      const top = pile[0];
      let nextPile = pile;
      if (decision === "bottom" && top) {
        nextPile = pile.slice(1);
        nextPile.push(prepareCardForSeat(top, who));
      }
      const zonesNext = {
        ...state.zones,
        [who]: {
          ...state.zones[who],
          ...(from === "spellbook"
            ? { spellbook: nextPile }
            : { atlas: nextPile }),
        },
      } as GameState["zones"];
      get().log(
        `${who.toUpperCase()} scries ${from} (${
          decision === "bottom" ? "bottom" : "top"
        }${top?.name ? ": " + top.name : ""})`
      );
      const tr = get().transport;
      if (tr) {
        const zonePatch = createZonesPatchFor(zonesNext, who);
        if (zonePatch) get().trySendPatch(zonePatch);
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  scryMany: (who, from, count, bottomIndexes) =>
    set((state) => {
      const pile0 =
        from === "spellbook"
          ? state.zones[who].spellbook
          : state.zones[who].atlas;
      const pile = [...pile0];
      const k = Math.max(0, Math.min(pile.length, Math.floor(count || 0)));
      if (k <= 0 || pile.length === 0) return state;
      const top = pile.slice(0, k).map((c) => prepareCardForSeat(c, who));
      const rest = pile.slice(k).map((c) => prepareCardForSeat(c, who));
      const setBottom = new Set(
        Array.isArray(bottomIndexes)
          ? bottomIndexes.filter((i) => Number.isInteger(i) && i >= 0 && i < k)
          : []
      );
      const keepers = top.filter((_, i) => !setBottom.has(i));
      const movers = top.filter((_, i) => setBottom.has(i));
      const nextPile = [...keepers, ...rest, ...movers];
      const zonesNext = {
        ...state.zones,
        [who]: {
          ...state.zones[who],
          ...(from === "spellbook"
            ? { spellbook: nextPile }
            : { atlas: nextPile }),
        },
      } as GameState["zones"];
      get().log(
        `${who.toUpperCase()} scries ${k} from ${from} (${
          movers.length
        } to bottom)`
      );
      const tr = get().transport;
      if (tr) {
        const zonePatch = createZonesPatchFor(zonesNext, who);
        if (zonePatch) get().trySendPatch(zonePatch);
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  drawOpening: (who, spellbookCount, atlasCount) =>
    set((state) => {
      get().pushHistory();

      const avatarName = (state.avatars[who]?.card?.name || "").toLowerCase();
      const isSpellslinger = avatarName === "spellslinger";
      const isPathfinder = avatarName === "pathfinder";
      const isMagician = avatarName.includes("magician");
      const isDuplicator = avatarName.includes("duplicator");

      // Determine draw counts based on avatar abilities:
      // - Magician: 7 cards from spellbook, 0 from atlas (no atlas)
      // - Duplicator: 2 spells and 2 sites
      // - Spellslinger: 4 spells, 3 sites (legacy)
      // - Pathfinder: 3 spells, 0 sites (legacy)
      // - Default: 3 spells, 3 sites
      let sbCount: number;
      let atCount: number;

      if (spellbookCount !== undefined) {
        sbCount = spellbookCount;
      } else if (isMagician) {
        sbCount = 7;
      } else if (isDuplicator) {
        sbCount = 2;
      } else if (isSpellslinger) {
        sbCount = 4;
      } else {
        sbCount = 3;
      }

      if (atlasCount !== undefined) {
        atCount = atlasCount;
      } else if (isMagician) {
        atCount = 0; // Magician has no atlas
      } else if (isDuplicator) {
        atCount = 2;
      } else if (isPathfinder) {
        atCount = 0;
      } else {
        atCount = 3;
      }
      const sb = [...state.zones[who].spellbook];
      const at = [...state.zones[who].atlas];
      const hand = [...state.zones[who].hand];
      for (let i = 0; i < sbCount; i++) {
        const c = sb.shift();
        if (!c) break;
        hand.push(prepareCardForSeat(c, who));
      }
      for (let i = 0; i < atCount; i++) {
        const c = at.shift();
        if (!c) break;
        hand.push(prepareCardForSeat(c, who));
      }
      get().log(
        `${who.toUpperCase()} draws opening hand (${sbCount} SB + ${atCount} AT)`
      );
      const zonesNext = {
        ...state.zones,
        [who]: { ...state.zones[who], spellbook: sb, atlas: at, hand },
      } as GameState["zones"];
      const tr = get().transport;
      if (tr) {
        const zonePatch = createZonesPatchFor(zonesNext, who);
        if (zonePatch) get().trySendPatch(zonePatch);
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
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
          `Cannot draw '${
            card.name
          }' from ${from}: ${who.toUpperCase()} is not the current player`
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
      get().log(
        `${who.toUpperCase()} draws '${card.name}' from ${from} to hand`
      );

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

      if (position === "top") {
        targetPile.unshift(ensuredCard);
      } else {
        targetPile.push(ensuredCard);
      }

      get().log(
        `${who.toUpperCase()} moves '${
          ensuredCard.name
        }' from hand to ${position} of ${pile}`
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

  addTokenToHand: (who, name) =>
    set((state) => {
      const def = TOKEN_BY_NAME[(name || "").toLowerCase()];
      if (!def) return state as GameState;
      const hand = [...state.zones[who].hand];
      const baseToken: CardRef = {
        cardId: newTokenInstanceId(def),
        variantId: null,
        name: def.name,
        type: "Token",
        slug: tokenSlug(def),
        thresholds: null,
        instanceId: newZoneCardInstanceId(),
      };
      const card = prepareCardForSeat(baseToken, who);
      hand.push(card);
      get().log(`${who.toUpperCase()} adds token '${def.name}' to hand`);
      const zonesNext = {
        ...state.zones,
        [who]: { ...state.zones[who], hand },
      } as GameState["zones"];
      const tr = get().transport;
      if (tr) {
        const zonePatch = createZonesPatchFor(zonesNext, who);
        if (zonePatch) get().trySendPatch(zonePatch);
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  addCardToHand: (who: PlayerKey, card: CardRef) =>
    set((state) => {
      const hand = [...state.zones[who].hand];
      const preparedCard = prepareCardForSeat(
        {
          ...card,
          instanceId: newZoneCardInstanceId(),
        },
        who
      );
      hand.push(preparedCard);
      get().log(`${who.toUpperCase()} adds '${card.name}' to hand`);
      const zonesNext = {
        ...state.zones,
        [who]: { ...state.zones[who], hand },
      } as GameState["zones"];
      const tr = get().transport;
      if (tr) {
        const zonePatch = createZonesPatchFor(zonesNext, who);
        if (zonePatch) get().trySendPatch(zonePatch);
      }
      return { zones: zonesNext } as Partial<GameState> as GameState;
    }),

  mulligans: createInitialMulligans(),
  mulliganDrawn: createInitialMulliganDrawn(),

  mulligan: (who) =>
    set((state) => {
      if (state.mulligans[who] <= 0) return state;
      const hand = [...state.zones[who].hand];
      const sb = [...state.zones[who].spellbook];
      const at = [...state.zones[who].atlas];
      for (const c of hand) {
        const isSite = (c.type || "").toLowerCase().includes("site");
        if (isSite) at.push(c);
        else sb.push(c);
      }
      for (let i = sb.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sb[i], sb[j]] = [sb[j], sb[i]];
      }
      for (let i = at.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [at[i], at[j]] = [at[j], at[i]];
      }
      const newHand: CardRef[] = [];
      const drawN = (pile: CardRef[], n: number) => {
        for (let i = 0; i < n; i++) {
          const c = pile.shift();
          if (!c) break;
          newHand.push(c);
        }
      };
      const avatarName = (state.avatars[who]?.card?.name || "").toLowerCase();
      const isSpellslinger = avatarName === "spellslinger";
      const isPathfinder = avatarName === "pathfinder";
      const sbCount = isSpellslinger ? 4 : 3;
      const atCount = isPathfinder ? 0 : 3;
      drawN(sb, sbCount);
      drawN(at, atCount);
      const mulligansNext = {
        ...state.mulligans,
        [who]: state.mulligans[who] - 1,
      } as GameState["mulligans"];
      get().log(
        `${who.toUpperCase()} mulligans (draws ${sbCount} SB + ${atCount} AT)`
      );
      const zonesNext = {
        ...state.zones,
        [who]: { ...state.zones[who], spellbook: sb, atlas: at, hand: newHand },
      } as GameState["zones"];
      const mulliganDrawnNext = {
        ...state.mulliganDrawn,
        [who]: newHand,
      } as GameState["mulliganDrawn"];
      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {
          zones: zonesNext,
          mulligans: mulligansNext,
          mulliganDrawn: mulliganDrawnNext,
        };
        get().trySendPatch(patch);
      }
      return {
        zones: zonesNext,
        mulligans: mulligansNext,
        mulliganDrawn: mulliganDrawnNext,
      } as Partial<GameState> as GameState;
    }),

  mulliganWithSelection: (who, indices) =>
    set((state) => {
      if (state.mulligans[who] <= 0) return state;
      const hand = [...state.zones[who].hand];
      if (!indices || indices.length === 0) return state;
      const idxSet = new Set(indices);
      const kept: CardRef[] = [];
      const toReturn: CardRef[] = [];
      hand.forEach((c, i) => {
        if (idxSet.has(i)) toReturn.push(c);
        else kept.push(c);
      });

      const sb = [...state.zones[who].spellbook];
      const at = [...state.zones[who].atlas];
      let backSpell = 0;
      let backAtlas = 0;
      for (const c of toReturn) {
        const isSite = (c.type || "").toLowerCase().includes("site");
        if (isSite) {
          at.push(c);
          backAtlas++;
        } else {
          sb.push(c);
          backSpell++;
        }
      }

      const drawn: CardRef[] = [];
      const drawN = (pile: CardRef[], n: number) => {
        for (let i = 0; i < n; i++) {
          const c = pile.shift();
          if (!c) break;
          kept.push(c);
          drawn.push(c);
        }
      };
      drawN(sb, backSpell);
      drawN(at, backAtlas);

      const mulligansNext = {
        ...state.mulligans,
        [who]: state.mulligans[who] - 1,
      } as GameState["mulligans"];
      get().log(
        `${who.toUpperCase()} mulligans ${
          toReturn.length
        } card(s) (${backAtlas} site(s), ${backSpell} other)`
      );
      if (drawn.length)
        get().log(
          `${who.toUpperCase()} draws ${drawn.length} replacement card(s)`
        );
      const zonesNext = {
        ...state.zones,
        [who]: { ...state.zones[who], spellbook: sb, atlas: at, hand: kept },
      } as GameState["zones"];
      const mulliganDrawnNext = {
        ...state.mulliganDrawn,
        [who]: drawn,
      } as GameState["mulliganDrawn"];
      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {
          zones: { [who]: zonesNext[who] } as unknown as GameState["zones"],
          mulligans: {
            [who]: mulligansNext[who],
          } as unknown as GameState["mulligans"],
          mulliganDrawn: {
            [who]: mulliganDrawnNext[who],
          } as unknown as GameState["mulliganDrawn"],
        };
        get().trySendPatch(patch);
      }
      return {
        zones: zonesNext,
        mulligans: mulligansNext,
        mulliganDrawn: mulliganDrawnNext,
      } as Partial<GameState> as GameState;
    }),

  finalizeMulligan: () =>
    set(() => {
      const next = { p1: [], p2: [] } as Record<PlayerKey, CardRef[]>;
      const tr = get().transport;
      if (tr) {
        const who = get().actorKey;
        if (who === "p1" || who === "p2") {
          const patch: ServerPatchT = {
            mulliganDrawn: {
              [who]: [],
            } as unknown as GameState["mulliganDrawn"],
          };
          get().trySendPatch(patch);
        }
        try {
          tr.mulliganDone();
        } catch {}
      }
      return { mulliganDrawn: next } as Partial<GameState> as GameState;
    }),

  moveFromBanishedToZone: (who, instanceId, target) =>
    set((state) => {
      get().pushHistory();
      if (!instanceId) return state;
      if (state.transport && state.actorKey && state.actorKey !== who) {
        get().log("Cannot modify opponent banished without consent");
        return state;
      }
      const zonesNext = { ...state.zones } as Record<PlayerKey, Zones>;
      const seatZones = { ...zonesNext[who] } as Zones;
      const banished = [...seatZones.banished];
      const idx = banished.findIndex((c) => c && c.instanceId === instanceId);
      if (idx < 0) return state;
      const card = banished.splice(idx, 1)[0];
      if (!card) return state;
      if (target === "hand") {
        seatZones.hand = [...seatZones.hand, card];
      } else {
        seatZones.graveyard = [card, ...seatZones.graveyard];
      }
      seatZones.banished = banished;
      zonesNext[who] = seatZones;
      get().log(
        `Returned '${card.name}' from banished to ${
          target === "hand" ? "hand" : "graveyard"
        } (${who.toUpperCase()})`
      );
      const patch = createZonesPatchFor(zonesNext as GameState["zones"], who);
      if (patch) get().trySendPatch(patch);
      return {
        zones: zonesNext as GameState["zones"],
      } as Partial<GameState> as GameState;
    }),
});
