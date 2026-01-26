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
  | "moveFromGraveyardToBanished"
  | "banishEntireGraveyard"
  | "handlePeekedCard"
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
  get,
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
        prepareCardForSeat(card, who),
      );
      for (let i = pile.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pile[i], pile[j]] = [pile[j], pile[i]];
      }
      const playerNum = who === "p1" ? "1" : "2";
      get().log(`[p${playerNum}:PLAYER] shuffles Spellbook (${pile.length})`);
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
        prepareCardForSeat(card, who),
      );
      for (let i = pile.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pile[i], pile[j]] = [pile[j], pile[i]];
      }
      const playerNum = who === "p1" ? "1" : "2";
      get().log(`[p${playerNum}:PLAYER] shuffles Atlas (${pile.length})`);
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
      if (
        !isCurrent ||
        (state.phase !== "Draw" &&
          state.phase !== "Main" &&
          state.phase !== "Start")
      )
        return state;

      // Drawing from atlas is always allowed - card effects can grant draws from atlas
      // Avatar tapping is only required when PLAYING a site from atlas, not drawing
      // Track if this is the free draw at start of turn
      const isFreeDraw =
        (state.phase === "Start" || state.phase === "Draw") &&
        !state.hasDrawnThisTurn;

      get().pushHistory();

      const pile =
        from === "spellbook"
          ? [...state.zones[who].spellbook].map((card) =>
              prepareCardForSeat(card, who),
            )
          : [...state.zones[who].atlas].map((card) =>
              prepareCardForSeat(card, who),
            );
      const hand = [...state.zones[who].hand];
      for (let i = 0; i < count; i++) {
        const c = pile.shift();
        if (!c) break;
        hand.push(prepareCardForSeat(c, who));
      }
      const updated =
        from === "spellbook" ? { spellbook: pile } : { atlas: pile };

      const playerNum = who === "p1" ? "1" : "2";
      const pileLabel = from === "spellbook" ? "Spellbook" : "Atlas";
      get().log(`[p${playerNum}:PLAYER] draws ${count} from ${pileLabel}`);

      // Broadcast toast for draw action to both players
      const toastMessage = `[p${playerNum}:PLAYER] drew from ${pileLabel}`;
      const toastTr = get().transport;
      if (toastTr?.sendMessage) {
        try {
          toastTr.sendMessage({
            type: "toast",
            text: toastMessage,
            seat: who,
          } as never);
        } catch {}
      } else {
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

      const zonesNext = {
        ...state.zones,
        [who]: { ...state.zones[who], ...updated, hand },
      } as GameState["zones"];

      // Mark that player has drawn this turn (for Draw phase enforcement)
      const shouldMarkDrawn = isFreeDraw;

      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {};
        const zonePatch = createZonesPatchFor(zonesNext, who);
        if (zonePatch) {
          patch.zones = zonePatch.zones;
        }
        if (shouldMarkDrawn) {
          patch.hasDrawnThisTurn = true;
          patch.phase = "Main"; // Transition to Main phase after free draw
        }
        if (Object.keys(patch).length > 0) {
          get().trySendPatch(patch);
        }
      }

      return {
        zones: zonesNext,
        ...(shouldMarkDrawn
          ? { hasDrawnThisTurn: true, phase: "Main" as const }
          : {}),
      } as Partial<GameState> as GameState;
    }),

  drawFromBottom: (who, from, count = 1) =>
    set((state) => {
      const isCurrent = (who === "p1" ? 1 : 2) === state.currentPlayer;
      // Log warning but allow operation for game repair purposes
      if (!isCurrent) {
        get().log(
          `[Warning] Drawing from bottom of ${from} out of turn: ${who.toUpperCase()} is not the current player`,
        );
      }
      if (
        state.phase !== "Draw" &&
        state.phase !== "Main" &&
        state.phase !== "Start"
      ) {
        get().log(
          `[Warning] Drawing from bottom of ${from} during ${state.phase} phase`,
        );
      }

      // Drawing from atlas is always allowed - card effects can grant draws from atlas
      // Avatar tapping is only required when PLAYING a site from atlas, not drawing
      // Track if this is the free draw at start of turn
      const isFreeDraw =
        (state.phase === "Start" || state.phase === "Draw") &&
        !state.hasDrawnThisTurn;

      get().pushHistory();

      const pile =
        from === "spellbook"
          ? [...state.zones[who].spellbook].map((card) =>
              prepareCardForSeat(card, who),
            )
          : [...state.zones[who].atlas].map((card) =>
              prepareCardForSeat(card, who),
            );
      const hand = [...state.zones[who].hand];

      for (let i = 0; i < count; i++) {
        const c = pile.pop();
        if (!c) break;
        hand.push(prepareCardForSeat(c, who));
      }

      const updated =
        from === "spellbook" ? { spellbook: pile } : { atlas: pile };

      const playerNum = who === "p1" ? "1" : "2";
      const pileLabel = from === "spellbook" ? "Spellbook" : "Atlas";
      get().log(
        `[p${playerNum}:PLAYER] draws ${count} from bottom of ${pileLabel}`,
      );

      // Broadcast toast for draw action to both players
      const toastMessage = `[p${playerNum}:PLAYER] drew from ${pileLabel}`;
      const toastTr = get().transport;
      if (toastTr?.sendMessage) {
        try {
          toastTr.sendMessage({
            type: "toast",
            text: toastMessage,
            seat: who,
          } as never);
        } catch {}
      } else {
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

      const zonesNext = {
        ...state.zones,
        [who]: { ...state.zones[who], ...updated, hand },
      } as GameState["zones"];

      // Mark that player has drawn this turn (for Draw phase enforcement)
      const shouldMarkDrawn = isFreeDraw;

      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {};
        const zonePatch = createZonesPatchFor(zonesNext, who);
        if (zonePatch) {
          patch.zones = zonePatch.zones;
        }
        if (shouldMarkDrawn) {
          patch.hasDrawnThisTurn = true;
          patch.phase = "Main"; // Transition to Main phase after free draw
        }
        if (Object.keys(patch).length > 0) {
          get().trySendPatch(patch);
        }
      }

      return {
        zones: zonesNext,
        ...(shouldMarkDrawn
          ? { hasDrawnThisTurn: true, phase: "Main" as const }
          : {}),
      } as Partial<GameState> as GameState;
    }),

  scryTop: (who, from, decision) =>
    set((state) => {
      // Validate the player can scry (must be second seat based on currentPlayer)
      const expectedSecondSeat: PlayerKey =
        state.currentPlayer === 1 ? "p2" : "p1";
      if (who !== expectedSecondSeat) {
        console.warn(
          `[scryTop] Rejected: who=${who} but expectedSecondSeat=${expectedSecondSeat} (currentPlayer=${state.currentPlayer})`,
        );
        return state;
      }
      // Allow scry during Setup (mulligan/seer phase) or Start phase
      if (state.phase !== "Start" && state.phase !== "Setup") {
        console.warn(
          `[scryTop] Rejected: phase=${state.phase} (expected Setup or Start)`,
        );
        return state;
      }

      const pile =
        from === "spellbook"
          ? [...state.zones[who].spellbook]
          : [...state.zones[who].atlas];

      console.log(
        `[scryTop] Processing: who=${who}, from=${from}, decision=${decision}, pile.length=${pile.length}`,
      );

      if (pile.length === 0) {
        console.warn(`[scryTop] Pile ${from} is empty for ${who}`);
        return state;
      }

      const top = pile[0];
      let nextPile = pile;

      // Only modify pile if putting card on bottom
      if (decision === "bottom" && top) {
        nextPile = pile.slice(1);
        nextPile.push(prepareCardForSeat(top, who));
        console.log(`[scryTop] Moving ${top.name} to bottom of ${from}`);
      } else {
        console.log(`[scryTop] Keeping ${top?.name} on top of ${from}`);
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
        }${top?.name ? ": " + top.name : ""})`,
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
          : [],
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
        } to bottom)`,
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
        `${who.toUpperCase()} draws opening hand (${sbCount} SB + ${atCount} AT)`,
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
      // Log warning but allow operation for game repair purposes
      const isCurrent = (who === "p1" ? 1 : 2) === state.currentPlayer;
      if (!isCurrent) {
        get().log(
          `[Warning] Drawing from ${from} out of turn: ${who.toUpperCase()} is not the current player`,
        );
      }

      // Drawing from atlas is always allowed - card effects can grant draws from atlas
      // Avatar tapping is only required when PLAYING a site from atlas, not drawing
      get().pushHistory();

      const z = { ...state.zones[who] };
      const pileName = from as keyof Zones;
      const pile = [...(z[pileName] as CardRef[])].map((pileCard) =>
        prepareCardForSeat(pileCard, who),
      );
      let removedIndex = pile.findIndex((c) => c === card);
      if (removedIndex < 0) {
        removedIndex = pile.findIndex(
          (c) =>
            c.cardId === card.cardId &&
            c.variantId === card.variantId &&
            c.name === card.name,
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

      const playerNum = who === "p1" ? "1" : "2";
      get().log(`[p${playerNum}:PLAYER] draws a card from ${from} to hand`);

      const zonesNext = {
        ...state.zones,
        [who]: { ...z, [pileName]: pile, hand },
      } as GameState["zones"];

      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {};
        const zonePatch = createZonesPatchFor(zonesNext, who);
        if (zonePatch) {
          patch.zones = zonePatch.zones;
        }
        if (Object.keys(patch).length > 0) {
          get().trySendPatch(patch);
        }
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

      // Log warning but allow operation for game repair purposes
      const isCurrent = (who === "p1" ? 1 : 2) === state.currentPlayer;
      if (!isCurrent) {
        get().log(
          `[Warning] Moving card to ${pile} out of turn: ${who.toUpperCase()} is not the current player`,
        );
      }

      get().pushHistory();

      const zones = { ...state.zones[who] };
      const hand = [...zones.hand];
      const targetPile = [...(zones[pile] as CardRef[])].map((card) =>
        prepareCardForSeat(card, who),
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
        }' from hand to ${position} of ${pile}`,
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
      const playerNum = who === "p1" ? "1" : "2";
      get().log(
        `[p${playerNum}:PLAYER] adds token [p${playerNum}card:${def.name}] to hand`,
      );
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
        who,
      );
      hand.push(preparedCard);
      const playerNum = who === "p1" ? "1" : "2";
      get().log(
        `[p${playerNum}:PLAYER] adds [p${playerNum}card:${card.name}] to hand`,
      );
      // Create deep copy of all zones to ensure patch contains correct state
      const zonesNext = {
        ...state.zones,
        [who]: {
          spellbook: [...state.zones[who].spellbook],
          atlas: [...state.zones[who].atlas],
          hand,
          graveyard: [...state.zones[who].graveyard],
          battlefield: [...state.zones[who].battlefield],
          collection: [...state.zones[who].collection],
          banished: [...(state.zones[who].banished || [])],
        },
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

      const avatarName = (state.avatars[who]?.card?.name || "").toLowerCase();
      const isMagicianAvatar = avatarName.includes("magician");
      const isDuplicatorAvatar = avatarName.includes("duplicator");
      const isSpellslinger = avatarName === "spellslinger";
      const isPathfinder = avatarName === "pathfinder";

      // Return cards to piles
      // Magician: all cards go to spellbook (no atlas)
      for (const c of hand) {
        const isSite = (c.type || "").toLowerCase().includes("site");
        if (isMagicianAvatar) {
          sb.push(c); // Magician: all cards in spellbook
        } else if (isSite) {
          at.push(c);
        } else {
          sb.push(c);
        }
      }
      for (let i = sb.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sb[i], sb[j]] = [sb[j], sb[i]];
      }
      if (!isMagicianAvatar) {
        for (let i = at.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [at[i], at[j]] = [at[j], at[i]];
        }
      }
      const newHand: CardRef[] = [];
      const drawN = (pile: CardRef[], n: number) => {
        for (let i = 0; i < n; i++) {
          const c = pile.shift();
          if (!c) break;
          newHand.push(c);
        }
      };

      // Determine draw counts based on avatar abilities:
      // - Magician: 7 cards from spellbook, 0 from atlas (no atlas)
      // - Duplicator: 2 spells and 2 sites
      // - Spellslinger: 4 spells, 3 sites (legacy)
      // - Pathfinder: 3 spells, 0 sites (legacy)
      // - Default: 3 spells, 3 sites
      let sbCount: number;
      let atCount: number;
      if (isMagicianAvatar) {
        sbCount = 7;
        atCount = 0;
      } else if (isDuplicatorAvatar) {
        sbCount = 2;
        atCount = 2;
      } else if (isSpellslinger) {
        sbCount = 4;
        atCount = 3;
      } else if (isPathfinder) {
        sbCount = 3;
        atCount = 0;
      } else {
        sbCount = 3;
        atCount = 3;
      }
      drawN(sb, sbCount);
      drawN(at, atCount);
      const mulligansNext = {
        ...state.mulligans,
        [who]: state.mulligans[who] - 1,
      } as GameState["mulligans"];
      get().log(
        `${who.toUpperCase()} mulligans (draws ${sbCount} SB + ${atCount} AT)`,
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
      // Build toReturn in the order indices were provided (click order)
      // so cards go to bottom of deck in the order they were selected
      const toReturn: CardRef[] = indices.map((i) => hand[i]);
      hand.forEach((c, i) => {
        if (!idxSet.has(i)) kept.push(c);
      });

      const avatarName = (state.avatars[who]?.card?.name || "").toLowerCase();
      const isMagicianAvatar = avatarName.includes("magician");

      const sb = [...state.zones[who].spellbook];
      const at = [...state.zones[who].atlas];
      let backSpell = 0;
      let backAtlas = 0;
      for (const c of toReturn) {
        const isSite = (c.type || "").toLowerCase().includes("site");
        // Magician: all cards go to spellbook (no atlas)
        if (isMagicianAvatar) {
          sb.push(c);
          backSpell++;
        } else if (isSite) {
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
      // Magician has no atlas, so skip atlas draws
      if (!isMagicianAvatar) {
        drawN(at, backAtlas);
      }

      const mulligansNext = {
        ...state.mulligans,
        [who]: state.mulligans[who] - 1,
      } as GameState["mulligans"];
      get().log(
        `${who.toUpperCase()} mulligans ${
          toReturn.length
        } card(s) (${backAtlas} site(s), ${backSpell} other)`,
      );
      if (drawn.length)
        get().log(
          `${who.toUpperCase()} draws ${drawn.length} replacement card(s)`,
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
        // Cards always go to owner's graveyard
        // (Mortuary only affects searches/fetches, not card placement)
        seatZones.graveyard = [card, ...seatZones.graveyard];
      }
      seatZones.banished = banished;
      zonesNext[who] = seatZones;
      const playerNum = who === "p1" ? "1" : "2";
      get().log(
        `Returned [p${playerNum}card:${card.name}] from banished to ${
          target === "hand" ? "hand" : "cemetery"
        }`,
      );
      const patch = createZonesPatchFor(zonesNext as GameState["zones"], who);
      if (patch) get().trySendPatch(patch);
      return {
        zones: zonesNext as GameState["zones"],
      } as Partial<GameState> as GameState;
    }),

  moveFromGraveyardToBanished: (who, instanceId) =>
    set((state) => {
      get().pushHistory();
      if (!instanceId) return state;
      // Apply locally and send patch for both own and opponent's cemetery
      // The server will apply and broadcast the authoritative state
      const zonesNext = { ...state.zones } as Record<PlayerKey, Zones>;
      const seatZones = { ...zonesNext[who] } as Zones;
      const graveyard = [...seatZones.graveyard];
      const idx = graveyard.findIndex((c) => c && c.instanceId === instanceId);
      if (idx < 0) return state;
      const card = graveyard.splice(idx, 1)[0];
      if (!card) return state;
      seatZones.banished = [...seatZones.banished, card];
      seatZones.graveyard = graveyard;
      zonesNext[who] = seatZones;
      const playerNum = who === "p1" ? "1" : "2";
      get().log(`Banished [p${playerNum}card:${card.name}] from cemetery`);
      const patch = createZonesPatchFor(zonesNext as GameState["zones"], who);
      if (patch) get().trySendPatch(patch);
      return {
        zones: zonesNext as GameState["zones"],
      } as Partial<GameState> as GameState;
    }),

  banishEntireGraveyard: (who) =>
    set((state) => {
      get().pushHistory();
      const graveyard = state.zones[who]?.graveyard || [];
      if (graveyard.length === 0) return state;
      const zonesNext = { ...state.zones } as Record<PlayerKey, Zones>;
      const seatZones = { ...zonesNext[who] } as Zones;
      // Move all cards from graveyard to banished
      seatZones.banished = [...seatZones.banished, ...graveyard];
      seatZones.graveyard = [];
      zonesNext[who] = seatZones;
      const playerNum = who === "p1" ? "1" : "2";
      get().log(
        `[p${playerNum}:PLAYER] banished entire cemetery (${graveyard.length} cards)`,
      );
      const patch = createZonesPatchFor(zonesNext as GameState["zones"], who);
      if (patch) get().trySendPatch(patch);
      return {
        zones: zonesNext as GameState["zones"],
      } as Partial<GameState> as GameState;
    }),

  handlePeekedCard: (who, pile, instanceId, action) =>
    set((state) => {
      get().pushHistory();
      // Allow hand peek actions (user has consent to view opponent's hand)
      // Block only spellbook/atlas modifications without being the owner
      const isHandPeek = pile === "hand";
      if (
        state.transport &&
        state.actorKey &&
        state.actorKey !== who &&
        !isHandPeek
      ) {
        get().log("Cannot modify opponent pile without consent");
        return state;
      }
      // Get source array based on pile type
      const sourcePile =
        pile === "spellbook"
          ? [...state.zones[who].spellbook]
          : pile === "atlas"
            ? [...state.zones[who].atlas]
            : [...state.zones[who].hand];

      // Find card by instanceId first, then try cardId as fallback
      let cardIndex = sourcePile.findIndex((c) => c.instanceId === instanceId);
      if (cardIndex === -1) {
        // Try matching by cardId (instanceId might be stringified cardId)
        const numericId = parseInt(instanceId, 10);
        if (!isNaN(numericId)) {
          cardIndex = sourcePile.findIndex((c) => c.cardId === numericId);
        }
      }
      if (cardIndex === -1) {
        console.log(
          "[handlePeekedCard] Card not found by instanceId:",
          instanceId,
          "pile length:",
          sourcePile.length,
        );
        console.log(
          "[handlePeekedCard] Available instanceIds:",
          sourcePile.map((c) => c.instanceId),
        );
        console.log(
          "[handlePeekedCard] Available cardIds:",
          sourcePile.map((c) => c.cardId),
        );
        return state;
      }
      const card = sourcePile[cardIndex];
      if (!card) return state;

      // Remove card from source pile
      sourcePile.splice(cardIndex, 1);
      const preparedCard = prepareCardForSeat(card, who);

      // Build new zones based on action
      const zonesNext = { ...state.zones } as Record<PlayerKey, Zones>;
      // Create deep copy of all zone arrays to avoid mutation
      const seatZones: Zones = {
        spellbook: [...state.zones[who].spellbook],
        atlas: [...state.zones[who].atlas],
        hand: [...state.zones[who].hand],
        graveyard: [...state.zones[who].graveyard],
        battlefield: [...state.zones[who].battlefield],
        collection: [...state.zones[who].collection],
        banished: [...(state.zones[who].banished || [])],
      };

      // Update source pile
      if (pile === "spellbook") {
        seatZones.spellbook = sourcePile;
      } else if (pile === "atlas") {
        seatZones.atlas = sourcePile;
      } else {
        seatZones.hand = sourcePile;
      }

      let actionDesc = "";
      const pileName =
        pile === "spellbook"
          ? "Spellbook"
          : pile === "atlas"
            ? "Atlas"
            : "Hand";
      // For steal action, we need the actor's seat (the viewer)
      const actorKey = state.actorKey;
      const otherSeat: PlayerKey = who === "p1" ? "p2" : "p1";
      const viewerSeat = actorKey || otherSeat;

      // Track affected seats for zone patch
      const affectedSeats: PlayerKey[] = [who];

      switch (action) {
        case "top":
          // Put back on top (re-insert at same position or front) - only for piles
          if (pile === "spellbook") {
            seatZones.spellbook = [preparedCard, ...sourcePile];
          } else if (pile === "atlas") {
            seatZones.atlas = [preparedCard, ...sourcePile];
          }
          actionDesc = "kept on top";
          break;
        case "bottom":
          // Put on bottom - only for piles
          if (pile === "spellbook") {
            seatZones.spellbook = [...sourcePile, preparedCard];
          } else if (pile === "atlas") {
            seatZones.atlas = [...sourcePile, preparedCard];
          }
          actionDesc = "put on bottom";
          break;
        case "hand":
          seatZones.hand = [...seatZones.hand, preparedCard];
          actionDesc = "drawn to hand";
          break;
        case "graveyard":
          // Cards always go to owner's graveyard
          // (Mortuary only affects searches/fetches, not card placement)
          seatZones.graveyard = [preparedCard, ...seatZones.graveyard];
          actionDesc = "sent to cemetery";
          break;
        case "banish":
          seatZones.banished = [preparedCard, ...(seatZones.banished || [])];
          actionDesc = "banished";
          break;
        case "steal":
          // Move card from opponent's hand to viewer's hand
          if (pile === "hand" && viewerSeat !== who) {
            const viewerZones: Zones = {
              spellbook: [...state.zones[viewerSeat].spellbook],
              atlas: [...state.zones[viewerSeat].atlas],
              hand: [...state.zones[viewerSeat].hand],
              graveyard: [...state.zones[viewerSeat].graveyard],
              battlefield: [...state.zones[viewerSeat].battlefield],
              collection: [...state.zones[viewerSeat].collection],
              banished: [...(state.zones[viewerSeat].banished || [])],
            };
            const stolenCard = prepareCardForSeat(card, viewerSeat);
            viewerZones.hand = [...viewerZones.hand, stolenCard];
            zonesNext[viewerSeat] = viewerZones;
            affectedSeats.push(viewerSeat);
            actionDesc = `taken by ${viewerSeat.toUpperCase()}`;
          }
          break;
        case "topOfSpellbook":
          // Move card from hand to top of owner's spellbook
          if (pile === "hand") {
            seatZones.spellbook = [preparedCard, ...seatZones.spellbook];
            actionDesc = "put on top of spellbook";
          }
          break;
        case "bottomOfSpellbook":
          // Move card from hand to bottom of owner's spellbook
          if (pile === "hand") {
            seatZones.spellbook = [...seatZones.spellbook, preparedCard];
            actionDesc = "put on bottom of spellbook";
          }
          break;
        default:
      }

      // Update owner's zones (card removed from source pile)
      zonesNext[who] = seatZones;
      get().log(
        `${who.toUpperCase()} peeked '${
          card.name
        }' from ${pileName} → ${actionDesc}`,
      );
      // Send single combined patch for all affected seats
      const zonePatch = createZonesPatchFor(
        zonesNext as GameState["zones"],
        affectedSeats,
      );
      // Send zones patch - DO NOT use __replaceKeys here!
      // The patch only contains partial zones (affected seats), so using __replaceKeys
      // would wipe the other player's zones. The client's deepMergeReplaceArrays
      // will correctly merge partial zone updates.
      // IMPORTANT: For hand peek actions on opponent zones, DON'T send zone patch!
      // The patch gets filtered by trySendPatch (security), but the server round-trip
      // causes stale data to overwrite our local changes. Use custom message instead.
      const isModifyingOpponentZones = isHandPeek && state.actorKey !== who;
      if (zonePatch && !isModifyingOpponentZones) {
        get().trySendPatch(zonePatch);
      }

      // Send custom message to notify opponent about hand peek action
      // This ensures the opponent's client updates properly for online play
      // IMPORTANT: Zone patches for opponent seats are filtered out by trySendPatch
      // (security feature), so we need to send zone changes via custom message
      const transport = get().transport;
      if (transport?.sendMessage && isHandPeek) {
        try {
          // Include the updated zones in the message so opponent can apply them
          transport.sendMessage({
            type: "handPeekAction",
            who,
            pile,
            instanceId,
            action,
            cardName: card.name,
            // Include zone data for opponent to apply
            zones: {
              [who]: {
                hand: seatZones.hand,
                spellbook: seatZones.spellbook,
                atlas: seatZones.atlas,
                graveyard: seatZones.graveyard,
                banished: seatZones.banished,
                battlefield: seatZones.battlefield,
                collection: seatZones.collection,
              },
            },
            ts: Date.now(),
          } as unknown as import("@/lib/net/transport").CustomMessage);
        } catch (e) {
          console.error("[handlePeekedCard] Failed to send message:", e);
        }
      }

      return {
        zones: zonesNext as GameState["zones"],
      } as Partial<GameState> as GameState;
    }),
});
