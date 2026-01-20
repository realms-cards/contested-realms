import type { StateCreator } from "zustand";
import { isAnimist } from "@/lib/game/avatarAbilities";
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
  owner: 1 | 2,
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
  get: () => GameState,
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
        `${siteName} Genesis: You control ${towerCount} copies - no bonus`,
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
  >,
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
  playSelectedTo: (x, y, offset) =>
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
        // Log warning but allow operation for game repair purposes
        get().log(
          `[Warning] Playing '${
            card.name
          }' out of turn: ${who.toUpperCase()} is not the current player`,
        );
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
            `[Warning] '${card.name}' missing thresholds (${miss.join(", ")})`,
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
              new CustomEvent("app:toast", { detail: { message } }),
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

      // Check for Animist playing a magic card - trigger choice dialog
      // Magic cards are spells that are not minions/creatures (no power stat)
      const isMagicType = type.includes("magic");
      if (isMagicType && !type.includes("token")) {
        // Check if player is an Animist (or masked as one)
        const avatar = state.avatars[who];
        const avatarName = avatar?.card?.name;
        const maskedState = state.imposterMasks[who];
        const effectiveAvatarName = maskedState?.maskAvatar?.name ?? avatarName;

        if (isAnimist(effectiveAvatarName)) {
          // Get mana cost for the card
          const manaCost = getManaCost(card, state.metaByCardId);
          const cellKey = toCellKey(x, y);

          // Trigger the Animist cast choice instead of proceeding
          setTimeout(() => {
            get().beginAnimistCast({
              card,
              manaCost,
              cellKey,
              handIndex: index,
              casterSeat: who,
            });
          }, 0);

          // Return state with card still selected, waiting for choice
          return {
            ...state,
            selectedCard: sel, // Keep selection for visual feedback
          } as GameState;
        }
      }

      get().pushHistory();
      const hand = [...state.zones[who].hand];
      hand.splice(index, 1);
      const key: CellKey = toCellKey(x, y);
      const cellNo = getCellNumber(x, y, state.board.size.w);
      if (type.includes("site")) {
        if (state.board.sites[key]) {
          get().log(
            `Cannot play site '${card.name}': #${cellNo} already occupied`,
          );
          return state;
        }
        const sites = {
          ...state.board.sites,
          [key]: { owner: ownerFromSeat(who), tapped: false, card },
        };
        const logPlayerNum = who === "p1" ? "1" : "2";
        get().log(
          `[p${logPlayerNum}:PLAYER] plays site [p${logPlayerNum}card:${card.name}] at #${cellNo}`,
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
                }),
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
          consumeInstantId,
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
      const isFaceDown = state.dragFaceDown;
      arr.push({
        owner: ownerFromSeat(who),
        card: cardWithId,
        offset: offset || null,
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId: cardWithId.instanceId ?? newPermanentInstanceId(),
        faceDown: isFaceDown || undefined,
      });
      // Reset dragFaceDown after use
      if (isFaceDown) {
        setTimeout(() => get().setDragFaceDown(false), 0);
      }
      per[key] = arr;
      const logPlayerNum = who === "p1" ? "1" : "2";
      // When played face-down, don't reveal card name to opponent
      const logCardName = isFaceDown
        ? "a card face-down"
        : `[p${logPlayerNum}card:${card.name}]`;
      get().log(`[p${logPlayerNum}:PLAYER] plays ${logCardName} at #${cellNo}`);
      // Broadcast toast to both players with player color and cell for highlighting
      const playerNum = who === "p1" ? "1" : "2";
      const toastCardName = isFaceDown
        ? "a card face-down"
        : `[p${playerNum}card:${card.name}]`;
      const toastMessage = `[p${playerNum}:PLAYER] played ${toastCardName} at #${cellNo}`;
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
              }),
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
      // Only send affected player's data to avoid overwriting opponent's state
      if (playersNext)
        combined.players = { [who]: playersNext[who] } as GameState["players"];
      if (Object.keys(combined).length > 0) get().trySendPatch(combined);
      // Check for special card abilities that need custom flows
      const cardNameLower = (card.name || "").toLowerCase();
      const isChaosTwister = cardNameLower.includes("chaos twister");
      const isBrowse = cardNameLower === "browse";
      const isCommonSense = cardNameLower === "common sense";
      const isCallToWar = cardNameLower === "call to war";
      const isSearingTruth = cardNameLower === "searing truth";
      const isAccusation = cardNameLower === "accusation";
      const isEarthquake = cardNameLower === "earthquake";
      const isMorgana = cardNameLower.includes("morgana le fay");
      const isPithImp = cardNameLower.includes("pith imp");
      const isOmphalos = cardNameLower.includes("omphalos");
      const isLilith = cardNameLower === "lilith";
      const isMotherNature = cardNameLower === "mother nature";
      const isBlackMass = cardNameLower === "black mass";
      const isHighlandPrincess = cardNameLower === "highland princess";
      const isAssortedAnimals = cardNameLower === "assorted animals";
      const isDholChants = cardNameLower === "dhol chants";
      const isAtlanteanFate = cardNameLower === "atlantean fate";
      const isMephistopheles = cardNameLower.includes("mephistopheles");
      const isRaiseDead = cardNameLower === "raise dead";
      console.log("[playActions] Card played:", {
        cardName: card.name,
        cardNameLower,
        isBrowse,
        isCommonSense,
        isCallToWar,
        isSearingTruth,
        isAccusation,
        isEarthquake,
        isMorgana,
        isPithImp,
        isOmphalos,
        isLilith,
        isMotherNature,
        isMephistopheles,
        isAtlanteanFate,
        type,
        typeIncludesMinion: type.includes("minion"),
      });

      // Check if resolvers are disabled - if so, skip all custom card logic
      const resolversDisabled = get().resolversDisabled;
      if (resolversDisabled) {
        console.log(
          "[playActions] Resolvers disabled - skipping custom card logic",
        );
        // Still trigger generic magic cast for Magic cards so they can be resolved manually
        if (type.includes("magic") && newest) {
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
        // Return the updated state without triggering custom resolvers
        const latestZones = get().zones;
        const mergedZones = {
          ...latestZones,
          [who]: {
            ...latestZones[who],
            hand: zonesNext[who].hand,
          },
        } as GameState["zones"];
        return {
          zones: mergedZones,
          permanents: per,
          selectedCard: null,
          selectedPermanent: null,
          ...(playersNext ? { players: playersNext } : {}),
        } as GameState;
      }

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
      // If this is Call to War, begin the search spell flow
      else if (isCallToWar && newest) {
        try {
          get().beginCallToWar({
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
      // If this is Searing Truth, begin the target player flow
      else if (isSearingTruth && newest) {
        try {
          get().beginSearingTruth({
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
      // If this is Accusation, begin the opponent hand reveal flow
      else if (isAccusation && newest) {
        try {
          get().beginAccusation({
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
      // If this is Earthquake, begin the site rearrangement flow
      else if (isEarthquake && newest) {
        try {
          get().beginEarthquake({
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
      // If this is Black Mass, begin the Evil minion search flow
      else if (isBlackMass && newest) {
        try {
          get().beginBlackMass({
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
      // If this is Assorted Animals (X-cost spell), begin the Beast search flow
      // X value is the total mana spent minus the base cost (which is 0 for this spell)
      else if (isAssortedAnimals && newest) {
        try {
          // For X spells, we need to determine X from the mana spent
          // The card's cost is null/undefined for X spells, so X = mana spent
          const manaCost =
            (newest.card as CardRef & { cost?: number }).cost ?? 0;
          const xValue = Math.max(0, manaCost); // X is the total cost paid
          get().beginAssortedAnimals({
            spell: {
              at: key,
              index: arr.length - 1,
              instanceId: newest.instanceId ?? null,
              owner: newest.owner,
              card: newest.card as CardRef,
            },
            casterSeat: who,
            xValue,
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
      // If this is Lilith minion, register for end-of-turn reveals
      if (isLilith && newest && type.includes("minion")) {
        console.log("[playActions] Registering Lilith:", {
          at: key,
          owner: newest.owner,
          ownerSeat: who,
        });
        try {
          get().registerLilith({
            instanceId: newest.instanceId ?? `lilith_${Date.now()}`,
            location: key,
            ownerSeat: who,
            cardName: card.name || "Lilith",
          });
        } catch (e) {
          console.error("[playActions] Error registering Lilith:", e);
        }
      }
      // If this is Mother Nature minion, register for start-of-turn reveals
      if (isMotherNature && newest && type.includes("minion")) {
        console.log("[playActions] Registering Mother Nature:", {
          at: key,
          owner: newest.owner,
          ownerSeat: who,
        });
        try {
          get().registerMotherNature({
            instanceId: newest.instanceId ?? `mother_nature_${Date.now()}`,
            location: key,
            ownerSeat: who,
            cardName: card.name || "Mother Nature",
          });
        } catch (e) {
          console.error("[playActions] Error registering Mother Nature:", e);
        }
      }
      // If this is Highland Princess minion, trigger Genesis (search for artifact ≤1)
      if (isHighlandPrincess && newest && type.includes("minion")) {
        console.log("[playActions] Triggering Highland Princess Genesis:", {
          at: key,
          owner: newest.owner,
          ownerSeat: who,
        });
        try {
          get().triggerHighlandPrincessGenesis({
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
          console.error("[playActions] Error triggering Highland Princess:", e);
        }
      }
      // If this is Dhol Chants, begin the ally tap selection flow
      else if (isDholChants && newest) {
        try {
          get().beginDholChants({
            spell: {
              at: key,
              index: arr.length - 1,
              instanceId: newest.instanceId ?? null,
              owner: newest.owner,
              card: newest.card as CardRef,
            },
            casterSeat: who,
          });
        } catch (e) {
          console.error("[playActions] Error triggering Dhol Chants:", e);
        }
      }
      // DISABLED: Atlantean Fate auto-resolver not working correctly
      // TODO: Re-enable when fixed
      // else if (isAtlanteanFate && newest) {
      //   try {
      //     get().beginAtlanteanFate({
      //       spell: {
      //         at: key,
      //         index: arr.length - 1,
      //         instanceId: newest.instanceId ?? null,
      //         owner: newest.owner,
      //         card: newest.card as CardRef,
      //       },
      //       casterSeat: who,
      //     });
      //   } catch (e) {
      //     console.error("[playActions] Error triggering Atlantean Fate:", e);
      //   }
      // }
      // If this is Raise Dead, begin the confirmation flow to summon random dead minion
      else if (isRaiseDead && newest) {
        try {
          get().beginRaiseDead({
            spell: {
              at: key,
              index: arr.length - 1,
              instanceId: newest.instanceId ?? null,
              owner: newest.owner,
              card: newest.card as CardRef,
            },
            casterSeat: who,
          });
        } catch (e) {
          console.error("[playActions] Error triggering Raise Dead:", e);
        }
      }
      // If this is Mephistopheles (Minion), begin the avatar replacement confirmation
      // Use standalone if (not else if) so it triggers regardless of other card checks
      if (isMephistopheles && newest && type.includes("minion")) {
        console.log("[playActions] Triggering Mephistopheles confirmation:", {
          at: key,
          owner: newest.owner,
          ownerSeat: who,
        });
        try {
          get().beginMephistopheles({
            spell: {
              at: key,
              index: arr.length - 1,
              instanceId: newest.instanceId ?? null,
              owner: newest.owner,
              card: newest.card as CardRef,
            },
            casterSeat: who,
          });
        } catch (e) {
          console.error("[playActions] Error triggering Mephistopheles:", e);
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
        consumeInstantId,
      );
      // IMPORTANT: Merge zone changes from multiple sources:
      // - zonesNext[who].hand: the hand update (card removed from hand)
      // - get().zones: any Genesis ability changes (e.g., Morgana's spellbook draw)
      // We use get().zones as base and override hand to preserve both updates
      const latestZones = get().zones;
      const mergedZones = {
        ...latestZones,
        [who]: {
          ...latestZones[who],
          hand: zonesNext[who].hand, // Preserve the hand update (played card removed)
        },
      } as GameState["zones"];
      return {
        zones: mergedZones,
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
        // Log warning but allow operation for game repair purposes
        get().log(
          `[Warning] Playing '${
            card.name
          }' from ${from} out of turn: ${who.toUpperCase()} is not the current player`,
        );
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
              new CustomEvent("app:toast", { detail: { message } }),
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
          `Cannot play '${card.name}' from ${from} during ${state.phase} phase`,
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
              c.name === card.name,
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
          `Cannot place token '${card.name}': #${cellNo} already occupied`,
        );
        return {
          dragFromPile: null,
          dragFromHand: false,
        } as Partial<GameState> as GameState;
      }
      if (type.includes("site")) {
        if (state.board.sites[key]) {
          get().log(
            `Cannot play site '${card.name}': #${cellNo} already occupied`,
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
            owner: ownerFromSeat(who),
            tapped: false,
            card: ensuredSiteCard,
          },
        };

        const logPlayerNum = who === "p1" ? "1" : "2";
        get().log(
          `[p${logPlayerNum}:PLAYER] plays site [p${logPlayerNum}card:${card.name}] from ${from} at #${cellNo}`,
        );

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
                }),
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

        const tr = get().transport;
        if (tr) {
          const zonePatch = createZonesPatchFor(zonesNext, who);
          const patch: ServerPatchT = {
            ...(zonePatch?.zones ? { zones: zonePatch.zones } : {}),
            board: { ...state.board, sites } as GameState["board"],
          };
          get().trySendPatch(patch);
        }
        // Site provides mana immediately - baseMana increases (site counted),
        // and availableMana = baseMana + offset, so both numbers increase automatically
        const nextInteractionLog = expireInteractionGrant(
          state,
          consumeInstantId,
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
      const isFaceDown = state.dragFaceDown;
      arr.push({
        owner: ownerFromSeat(who),
        card: cardWithId,
        offset: null,
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId: cardWithId.instanceId ?? newPermanentInstanceId(),
        faceDown: isFaceDown || undefined,
      });
      // Reset dragFaceDown after use
      if (isFaceDown) {
        setTimeout(() => get().setDragFaceDown(false), 0);
      }
      per[key] = arr;
      const logPlayerNum2 = who === "p1" ? "1" : "2";
      // When played face-down, don't reveal card name to opponent
      const logCardName2 = isFaceDown
        ? "a card face-down"
        : `[p${logPlayerNum2}card:${card.name}]`;
      get().log(
        `[p${logPlayerNum2}:PLAYER] plays ${logCardName2} from ${from} at #${cellNo}`,
      );
      // Broadcast toast to both players with player color and cell for highlighting (skip tokens)
      if (!type.includes("token")) {
        const playerNum = who === "p1" ? "1" : "2";
        const toastCardName = isFaceDown
          ? "a card face-down"
          : `[p${playerNum}card:${card.name}]`;
        const toastMessage = `[p${playerNum}:PLAYER] played ${toastCardName} at #${cellNo}`;
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
                }),
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
        consumeInstantId,
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
        // Log warning but allow operation for game repair purposes
        get().log(
          `[Warning] Drawing from ${from} out of turn: ${who.toUpperCase()} is not the current player`,
        );
      }
      // Collection-to-hand moves are only legal during the controlling player's own Main phase.
      // However, since phase tracking is not strictly enforced in this implementation,
      // we allow collection draws during Main, Start, or Draw phases (essentially any active gameplay).
      // Setup phase is still blocked as the game hasn't started yet.
      if (from === "collection" && state.phase === "Setup") {
        get().log(`Cannot draw from Collection during ${state.phase} phase`);
        return { dragFromPile: null } as Partial<GameState> as GameState;
      }

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

      const logPlayerNum = who === "p1" ? "1" : "2";
      get().log(`[p${logPlayerNum}:PLAYER] draws a card from ${from} to hand`);

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
              }),
            );
          }
        } catch {}
      }

      const zonesNext = {
        ...state.zones,
        [who]: { ...z, [pileName]: pile, hand },
      } as GameState["zones"];

      // Track if this is the free draw at start of turn (same logic as drawFrom in zoneState.ts)
      const isFreeDraw =
        (state.phase === "Start" || state.phase === "Draw") &&
        !state.hasDrawnThisTurn &&
        isCurrent;
      const shouldMarkDrawn =
        isFreeDraw && (from === "spellbook" || from === "atlas");

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
      if (position === "top") targetPile.unshift(ensuredCard);
      else targetPile.push(ensuredCard);
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
});
