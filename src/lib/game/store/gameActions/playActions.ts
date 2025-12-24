import type { StateCreator } from "zustand";
import {
  ELEMENT_CHOICE_SITES,
  GENESIS_BLOOM_SITES,
  GENESIS_MANA_SITES,
  TOWER_GENESIS_SITES,
} from "@/lib/game/mana-providers";
import { TOKEN_BY_NAME } from "@/lib/game/tokens";
import type {
  CardRef,
  CellKey,
  GameState,
  Permanents,
  PermanentItem,
  ServerPatchT,
  Thresholds,
  Zones,
} from "../types";
import { evaluateInstantPermission, expireInteractionGrant } from "./helpers";
import { getCellNumber, ownerFromSeat, toCellKey } from "../utils/boardHelpers";
import { prepareCardForSeat } from "../utils/cardHelpers";
import { newPermanentInstanceId } from "../utils/idHelpers";
import {
  createPermanentDeltaPatch,
  createPermanentsPatch,
} from "../utils/patchHelpers";
import { randomTilt } from "../utils/permanentHelpers";
import { computeThresholdTotals } from "../utils/resourceHelpers";
import { createZonesPatchFor } from "../utils/zoneHelpers";

// Count how many copies of a site the player controls
const countPlayerSitesByName = (
  state: GameState,
  siteName: string,
  owner: 1 | 2
): number => {
  const lc = siteName.toLowerCase();
  let count = 0;
  for (const tile of Object.values(state.board.sites ?? {})) {
    if (!tile || tile.owner !== owner) continue;
    const tileName = String(tile.card?.name || "").toLowerCase();
    if (tileName === lc) count++;
  }
  return count;
};

// Detect and trigger special site Genesis abilities
const triggerSiteGenesis = (
  siteName: string,
  cellKey: CellKey,
  owner: 1 | 2,
  get: () => GameState
): void => {
  const lc = siteName.toLowerCase();
  const state = get();

  // Valley of Delight - trigger element choice overlay
  if (ELEMENT_CHOICE_SITES.has(lc)) {
    state.triggerElementChoice(cellKey, siteName, owner);
    return;
  }

  // Bloom sites - register temporary threshold bonus
  const bloomBonus = GENESIS_BLOOM_SITES[lc];
  if (bloomBonus) {
    state.registerBloomBonus(cellKey, siteName, bloomBonus, owner);
    return;
  }

  // Genesis mana sites (Ghost Town) - register temporary mana bonus
  const manaBonus = GENESIS_MANA_SITES[lc];
  if (manaBonus) {
    state.registerGenesisMana(cellKey, siteName, manaBonus, owner);
    return;
  }

  // Tower genesis sites (Dark Tower, Lone Tower, etc.)
  // Genesis → If you control only one [Tower Name], gain (1) this turn.
  if (TOWER_GENESIS_SITES.has(lc)) {
    const towerCount = countPlayerSitesByName(state, lc, owner);
    if (towerCount === 1) {
      state.registerGenesisMana(cellKey, siteName, 1, owner);
      state.log(`${siteName} Genesis: Only one copy - gain (1) this turn`);
    } else {
      state.log(
        `${siteName} Genesis: You control ${towerCount} copies - no bonus`
      );
    }
    return;
  }
};

/** Get mana cost from card (uses cost field, falls back to metaByCardId cache) */
const getManaCost = (
  card: CardRef,
  metaByCardId: Record<
    number,
    { attack: number | null; defence: number | null; cost: number | null }
  >
): number => {
  // First try the card's cost field
  if (typeof card.cost === "number") return card.cost;
  // Fall back to metaByCardId cache
  const meta = metaByCardId[card.cardId];
  if (meta && typeof meta.cost === "number") return meta.cost;
  return 0;
};

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
      const consumeInstantId = allowInstant
        ? instantPermission.consumeId
        : null;
      if (
        !isCurrent &&
        !allowInstant &&
        !typeEarly.includes("token") &&
        !typeEarly.includes("site")
      ) {
        get().log(
          `Cannot play '${
            card.name
          }': ${who.toUpperCase()} is not the current player`
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
      // Guard: Must draw a card before playing during Start/Draw phase
      // (Start phase is where the turn begins, player must draw first)
      // Exception: Turn 1 - the first player does NOT draw on their first turn
      const isFirstTurn = state.turn === 1;
      if (
        (state.phase === "Start" || state.phase === "Draw") &&
        !state.hasDrawnThisTurn &&
        isCurrent &&
        !isFirstTurn
      ) {
        const message = `Must draw a card before playing. Draw from Spellbook or Atlas first.`;
        get().log(message);
        // Show toast to user
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", { detail: { message } })
            );
          }
        } catch {}
        return state;
      }
      // Block non-site/non-token cards outside of Main phase (and Start phase after drawing)
      const canPlayInCurrentPhase =
        state.phase === "Main" ||
        ((state.phase === "Start" || state.phase === "Draw") &&
          state.hasDrawnThisTurn);
      if (
        !type.includes("site") &&
        !type.includes("token") &&
        !canPlayInCurrentPhase &&
        !allowInstant
      ) {
        get().log(`Cannot play '${card.name}' during ${state.phase} phase`);
        return state;
      }
      get().pushHistory();
      const hand = [...state.zones[who].hand];
      hand.splice(index, 1);
      const key: CellKey = toCellKey(x, y);
      const cellNo = getCellNumber(x, y, state.board.size.w);
      if (type.includes("site")) {
        if (state.board.sites[key]) {
          get().log(
            `Cannot play site '${card.name}': #${cellNo} already occupied`
          );
          return state;
        }
        const sites = {
          ...state.board.sites,
          [key]: { owner: ownerFromSeat(who), tapped: false, card },
        };
        const logPlayerNum = who === "p1" ? "1" : "2";
        get().log(
          `[p${logPlayerNum}:PLAYER] plays site [p${logPlayerNum}card:${card.name}] at #${cellNo}`
        );
        // Broadcast toast to both players with player color and cell for highlighting
        const playerNum = who === "p1" ? "1" : "2";
        const toastMessage = `[p${playerNum}:PLAYER] played [p${playerNum}card:${card.name}] at #${cellNo}`;
        const tr = get().transport;
        if (tr?.sendMessage) {
          try {
            tr.sendMessage({
              type: "toast",
              text: toastMessage,
              cellKey: key,
              seat: who,
            } as never);
          } catch {}
        } else {
          // Offline: show local toast
          try {
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("app:toast", {
                  detail: { message: toastMessage, cellKey: key },
                })
              );
            }
          } catch {}
        }
        if (tr) {
          // Create deep copy of all zones to ensure proper immutable updates
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
        // Site provides mana immediately - baseMana increases (site counted),
        // and availableMana = baseMana + offset, so both numbers increase automatically

        // Trigger Genesis effects for special sites (after state update via setTimeout)
        setTimeout(() => {
          triggerSiteGenesis(card.name, key, ownerFromSeat(who), get);
        }, 0);

        const nextInteractionLog = expireInteractionGrant(
          state,
          consumeInstantId
        );
        return {
          zones: {
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
        owner: ownerFromSeat(who),
        card: cardWithId,
        offset: null,
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId: cardWithId.instanceId ?? newPermanentInstanceId(),
      });
      per[key] = arr;
      const logPlayerNum = who === "p1" ? "1" : "2";
      get().log(
        `[p${logPlayerNum}:PLAYER] plays [p${logPlayerNum}card:${card.name}] at #${cellNo}`
      );
      // Broadcast toast to both players with player color and cell for highlighting
      const playerNum = who === "p1" ? "1" : "2";
      const toastMessage = `[p${playerNum}:PLAYER] played [p${playerNum}card:${card.name}] at #${cellNo}`;
      const tr = get().transport;
      if (tr?.sendMessage) {
        try {
          tr.sendMessage({
            type: "toast",
            text: toastMessage,
            cellKey: key,
            seat: who,
          } as never);
        } catch {}
      } else {
        // Offline: show local toast
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", {
                detail: { message: toastMessage, cellKey: key },
              })
            );
          }
        } catch {}
      }
      // Subtract mana cost from available mana when playing non-site cards from hand
      const manaCost = getManaCost(card, state.metaByCardId);
      const currentMana = Number(state.players[who]?.mana || 0);
      const nextMana =
        manaCost > 0 && !type.includes("token")
          ? currentMana - manaCost
          : currentMana;
      const playersNext =
        nextMana !== currentMana
          ? {
              ...state.players,
              [who]: { ...state.players[who], mana: nextMana },
            }
          : null;
      // Create deep copy of all zones to ensure proper immutable updates
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
      if (playersNext) combined.players = playersNext;
      if (Object.keys(combined).length > 0) get().trySendPatch(combined);
      // Check for special card abilities that need custom flows
      const cardNameLower = (card.name || "").toLowerCase();
      const isChaosTwister = cardNameLower.includes("chaos twister");
      const isBrowse = cardNameLower === "browse";
      const isCommonSense = cardNameLower === "common sense";
      const isMorgana = cardNameLower.includes("morgana le fay");
      const isPithImp = cardNameLower.includes("pith imp");
      const isOmphalos = cardNameLower.includes("omphalos");
      console.log("[playActions] Card played:", {
        cardName: card.name,
        cardNameLower,
        isBrowse,
        isCommonSense,
        isMorgana,
        isPithImp,
        isOmphalos,
        type,
      });

      // If this is Chaos Twister, begin the dexterity minigame flow
      if (isChaosTwister && newest) {
        try {
          get().beginChaosTwister({
            spell: {
              at: key,
              index: arr.length - 1,
              instanceId: newest.instanceId ?? null,
              owner: newest.owner,
              card: newest.card as CardRef,
            },
            casterSeat: who,
          });
        } catch {}
      }
      // If this is Browse, begin the browse spell flow
      else if (isBrowse && newest) {
        try {
          get().beginBrowse({
            spell: {
              at: key,
              index: arr.length - 1,
              instanceId: newest.instanceId ?? null,
              owner: newest.owner,
              card: newest.card as CardRef,
            },
            casterSeat: who,
          });
        } catch {}
      }
      // If this is Common Sense, begin the search spell flow
      else if (isCommonSense && newest) {
        try {
          get().beginCommonSense({
            spell: {
              at: key,
              index: arr.length - 1,
              instanceId: newest.instanceId ?? null,
              owner: newest.owner,
              card: newest.card as CardRef,
            },
            casterSeat: who,
          });
        } catch {}
      }
      // If this is Morgana le Fay (minion with Genesis), trigger her ability
      else if (isMorgana && newest && type.includes("minion")) {
        try {
          get().triggerMorganaGenesis({
            minion: {
              at: key,
              index: arr.length - 1,
              instanceId: newest.instanceId ?? null,
              owner: newest.owner,
              card: newest.card as CardRef,
            },
            ownerSeat: who,
          });
        } catch {}
      }
      // If this is Pith Imp (minion with Genesis), trigger steal ability
      else if (isPithImp && newest && type.includes("minion")) {
        console.log("[playActions] Triggering Pith Imp genesis for:", {
          at: key,
          owner: newest.owner,
          ownerSeat: who,
        });
        try {
          get().triggerPithImpGenesis({
            minion: {
              at: key,
              index: arr.length - 1,
              instanceId: newest.instanceId ?? null,
              owner: newest.owner,
              card: newest.card as CardRef,
            },
            ownerSeat: who,
          });
        } catch (e) {
          console.error("[playActions] Error triggering Pith Imp genesis:", e);
        }
      }
      // If this is an Omphalos artifact, register it for end-of-turn draws
      else if (isOmphalos && newest && type.includes("artifact")) {
        console.log("[playActions] Registering Omphalos:", {
          at: key,
          owner: newest.owner,
          ownerSeat: who,
        });
        try {
          get().registerOmphalos({
            artifact: {
              at: key,
              index: arr.length - 1,
              instanceId: newest.instanceId ?? null,
              owner: newest.owner,
              card: newest.card as CardRef,
            },
            ownerSeat: who,
          });
        } catch (e) {
          console.error("[playActions] Error registering Omphalos:", e);
        }
      }
      // If this is a Magic card (but not one with special handling), begin the magic casting flow
      else if (type.includes("magic") && newest) {
        try {
          get().beginMagicCast({
            tile: { x, y },
            spell: {
              at: key,
              index: arr.length - 1,
              instanceId: newest.instanceId ?? null,
              owner: newest.owner,
              card: newest.card as CardRef,
            },
          });
        } catch {}
      }
      const nextInteractionLog = expireInteractionGrant(
        state,
        consumeInstantId
      );
      return {
        zones: zonesNext,
        permanents: per,
        selectedCard: null,
        selectedPermanent: null,
        ...(playersNext ? { players: playersNext } : {}),
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
      const consumeInstantId = allowInstant
        ? instantPermission.consumeId
        : null;
      if (
        !isCurrent &&
        !allowInstant &&
        !type.includes("token") &&
        !type.includes("site")
      ) {
        get().log(
          `Cannot play '${
            card.name
          }' from ${from}: ${who.toUpperCase()} is not the current player`
        );
        return {
          dragFromPile: null,
          dragFromHand: false,
        } as Partial<GameState> as GameState;
      }
      // Guard: Must draw a card before playing during Start/Draw phase
      // Exception: Playing a site from atlas IS the draw action (counts as free draw)
      // Exception: Turn 1 - the first player does NOT draw on their first turn
      const isPlayingSiteFromAtlas = type.includes("site") && from === "atlas";
      const isFirstTurnPile = state.turn === 1;
      if (
        (state.phase === "Start" || state.phase === "Draw") &&
        !state.hasDrawnThisTurn &&
        isCurrent &&
        !isPlayingSiteFromAtlas &&
        !isFirstTurnPile
      ) {
        const message = `Must draw a card before playing. Draw from Spellbook or Atlas first.`;
        get().log(message);
        // Show toast to user
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", { detail: { message } })
            );
          }
        } catch {}
        return {
          dragFromPile: null,
          dragFromHand: false,
        } as Partial<GameState> as GameState;
      }
      // Block non-site/non-token cards outside of Main phase (and Start phase after drawing)
      const canPlayInCurrentPhase =
        state.phase === "Main" ||
        ((state.phase === "Start" || state.phase === "Draw") &&
          state.hasDrawnThisTurn);
      if (
        !type.includes("site") &&
        !type.includes("token") &&
        !canPlayInCurrentPhase &&
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
      const key: CellKey = toCellKey(x, y);
      const cellNo = getCellNumber(x, y, state.board.size.w);
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

        // Playing a site from atlas requires tapping the avatar UNLESS it's the free draw
        // (Avatar ability: "Tap → Play or draw a site")
        // The free draw happens during Start/Draw phase when hasDrawnThisTurn is false
        const isFreeDraw =
          (state.phase === "Start" || state.phase === "Draw") &&
          !state.hasDrawnThisTurn;
        const shouldTapAvatar = from === "atlas" && !isFreeDraw;

        // Check if avatar is already tapped when we need to tap it
        if (shouldTapAvatar) {
          const avatar = state.avatars[who];
          if (avatar?.tapped) {
            get().log(
              `Cannot play site from Atlas: ${who.toUpperCase()}'s Avatar is already tapped`
            );
            return {
              dragFromPile: null,
              dragFromHand: false,
            } as Partial<GameState> as GameState;
          }
        }

        const ensuredSiteCard = prepareCardForSeat(card, who);
        const sites = {
          ...state.board.sites,
          [key]: {
            owner: ownerFromSeat(who),
            tapped: false,
            card: ensuredSiteCard,
          },
        };

        // Build avatar update if we need to tap
        let avatarsNext = state.avatars;
        if (shouldTapAvatar) {
          avatarsNext = {
            ...state.avatars,
            [who]: { ...state.avatars[who], tapped: true },
          } as GameState["avatars"];
          const logPlayerNum = who === "p1" ? "1" : "2";
          get().log(
            `[p${logPlayerNum}:PLAYER] taps Avatar to play site [p${logPlayerNum}card:${card.name}] from ${from} at #${cellNo}`
          );
        } else {
          const logPlayerNum = who === "p1" ? "1" : "2";
          get().log(
            `[p${logPlayerNum}:PLAYER] plays site [p${logPlayerNum}card:${card.name}] from ${from} at #${cellNo}`
          );
        }

        // Broadcast toast to both players with player color and cell for highlighting
        const playerNum = who === "p1" ? "1" : "2";
        const toastMessage = `[p${playerNum}:PLAYER] played [p${playerNum}card:${card.name}] at #${cellNo}`;
        const toastTr = get().transport;
        if (toastTr?.sendMessage) {
          try {
            toastTr.sendMessage({
              type: "toast",
              text: toastMessage,
              cellKey: key,
              seat: who,
            } as never);
          } catch {}
        } else {
          // Offline: show local toast
          try {
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("app:toast", {
                  detail: { message: toastMessage, cellKey: key },
                })
              );
            }
          } catch {}
        }

        const zonesNext =
          pileName !== null
            ? ({
                ...state.zones,
                [who]: { ...z, [pileName]: pile },
              } as GameState["zones"])
            : state.zones;

        // Playing a site from atlas counts as the draw action for the turn
        // Mark drawn if this is the free draw (isFreeDraw is true means we're using the free draw)
        const shouldMarkDrawn = isFreeDraw;

        const tr = get().transport;
        if (tr) {
          const zonePatch = createZonesPatchFor(zonesNext, who);
          const patch: ServerPatchT = {
            ...(zonePatch?.zones ? { zones: zonePatch.zones } : {}),
            board: { ...state.board, sites } as GameState["board"],
          };
          if (shouldTapAvatar) {
            patch.avatars = {
              [who]: { tapped: true },
            } as GameState["avatars"];
          }
          if (shouldMarkDrawn) {
            patch.hasDrawnThisTurn = true;
            patch.phase = "Main"; // Transition to Main phase after free draw
          }
          get().trySendPatch(patch);
        }
        // Site provides mana immediately - baseMana increases (site counted),
        // and availableMana = baseMana + offset, so both numbers increase automatically
        const nextInteractionLog = expireInteractionGrant(
          state,
          consumeInstantId
        );
        return {
          zones: zonesNext,
          board: { ...state.board, sites },
          avatars: avatarsNext,
          dragFromPile: null,
          dragFromHand: false,
          ...(shouldMarkDrawn
            ? { hasDrawnThisTurn: true, phase: "Main" as const }
            : {}),
          ...(nextInteractionLog ? { interactionLog: nextInteractionLog } : {}),
        } as Partial<GameState> as GameState;
      }
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[key] || [])];
      const cardWithId = prepareCardForSeat(card, who);
      arr.push({
        owner: ownerFromSeat(who),
        card: cardWithId,
        offset: null,
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId: cardWithId.instanceId ?? newPermanentInstanceId(),
      });
      per[key] = arr;
      const logPlayerNum2 = who === "p1" ? "1" : "2";
      get().log(
        `[p${logPlayerNum2}:PLAYER] plays [p${logPlayerNum2}card:${card.name}] from ${from} at #${cellNo}`
      );
      // Broadcast toast to both players with player color and cell for highlighting (skip tokens)
      if (!type.includes("token")) {
        const playerNum = who === "p1" ? "1" : "2";
        const toastMessage = `[p${playerNum}:PLAYER] played [p${playerNum}card:${card.name}] at #${cellNo}`;
        const toastTr = get().transport;
        if (toastTr?.sendMessage) {
          try {
            toastTr.sendMessage({
              type: "toast",
              text: toastMessage,
              cellKey: key,
              seat: who,
            } as never);
          } catch {}
        } else {
          // Offline: show local toast
          try {
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("app:toast", {
                  detail: { message: toastMessage, cellKey: key },
                })
              );
            }
          } catch {}
        }
      }
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
      const zonePatch = zonesNext ? createZonesPatchFor(zonesNext, who) : null;
      const combined: ServerPatchT = {};
      if (deltaPatch) Object.assign(combined, deltaPatch);
      else if (fallbackPatch?.permanents)
        combined.permanents = fallbackPatch.permanents;
      if (zonePatch?.zones) combined.zones = zonePatch.zones;
      if (Object.keys(combined).length > 0) get().trySendPatch(combined);
      // If this is a Magic card, begin the magic casting flow after placing it
      try {
        if (type.includes("magic") && newest) {
          get().beginMagicCast({
            tile: { x, y },
            spell: {
              at: key,
              index: arr.length - 1,
              instanceId: newest.instanceId ?? null,
              owner: newest.owner,
              card: newest.card as CardRef,
            },
          });
        }
      } catch {}
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
          `Cannot draw '${
            card.name
          }' from ${from}: ${who.toUpperCase()} is not the current player`
        );
        return { dragFromPile: null } as Partial<GameState> as GameState;
      }
      // Collection-to-hand moves are only legal during the controlling player's own Main phase.
      // However, since phase tracking is not strictly enforced in this implementation,
      // we allow collection draws during Main, Start, or Draw phases (essentially any active gameplay).
      // Setup phase is still blocked as the game hasn't started yet.
      if (from === "collection" && state.phase === "Setup") {
        get().log(
          `Cannot draw '${card.name}' from Collection during ${state.phase} phase`
        );
        return { dragFromPile: null } as Partial<GameState> as GameState;
      }

      // Drawing from atlas is always allowed - card effects can grant draws from atlas
      // Avatar tapping is only required when PLAYING a site from atlas, not drawing
      // Track if this is the free draw at start of turn
      const isFreeDraw =
        (state.phase === "Start" || state.phase === "Draw") &&
        !state.hasDrawnThisTurn;

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

      const logPlayerNum = who === "p1" ? "1" : "2";
      get().log(
        `[p${logPlayerNum}:PLAYER] draws [p${logPlayerNum}card:${card.name}] from ${from} to hand`
      );

      // Show toast for draw action (skip graveyard)
      if (from !== "graveyard") {
        const pileLabel =
          from === "spellbook"
            ? "Spellbook"
            : from === "atlas"
            ? "Atlas"
            : from === "collection"
            ? "Collection"
            : from;
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", {
                detail: { message: `Drew from ${pileLabel}` },
              })
            );
          }
        } catch {}
      }

      const zonesNext = {
        ...state.zones,
        [who]: { ...z, [pileName]: pile, hand },
      } as GameState["zones"];

      // Mark that player has drawn this turn (for Draw phase enforcement)
      // This applies when it's the free draw (Start/Draw phase, not yet drawn)
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
        dragFromPile: null,
        ...(shouldMarkDrawn
          ? { hasDrawnThisTurn: true, phase: "Main" as const }
          : {}),
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
});
