import type { StateCreator } from "zustand";
import {
  isAnimist,
  isGeomancer,
  isHarbinger,
  isTemplar,
} from "@/lib/game/avatarAbilities";
import {
  BEACON_GENESIS_SITES,
  ELEMENT_CHOICE_SITES,
  GENESIS_BLOOM_SITES,
  GENESIS_MANA_SITES,
  TOWER_GENESIS_SITES,
} from "@/lib/game/mana-providers";
import { TOKEN_BY_NAME } from "@/lib/game/tokens";
import { isApexOfBabel, isBaseOfBabel } from "../babelTowerState";
import { isGardenOfEden } from "../gardenOfEdenState";
import { isPortalTile } from "../portalState";
import { isRiverGenesisSite } from "../riverGenesisState";
import { isMismanagedMortuary } from "../specialSiteState";
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
import { evaluateInstantPermission, expireInteractionGrant } from "./helpers";
import {
  getCellNumber,
  getNearbyCells,
  ownerFromSeat,
  seatFromOwner,
  toCellKey,
} from "../utils/boardHelpers";
import { prepareCardForSeat } from "../utils/cardHelpers";
import { newPermanentInstanceId } from "../utils/idHelpers";
import {
  createPermanentDeltaPatch,
  createPermanentsPatch,
} from "../utils/patchHelpers";
import { randomTilt } from "../utils/permanentHelpers";
import {
  computeAvailableMana,
  computeThresholdTotals,
} from "../utils/resourceHelpers";
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

  // Mismanaged Mortuary - register cemetery swap effect
  // "Treat your opponent's cemetery as yours, and vice versa."
  if (isMismanagedMortuary(siteName)) {
    state.registerMismanagedMortuary(cellKey, owner);
    return;
  }

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

  // Garden of Eden - register to track for draw limit
  if (isGardenOfEden(siteName)) {
    const ownerSeat = owner === 1 ? "p1" : "p2";
    state.registerGardenOfEden({
      site: {
        at: cellKey,
        card: { name: siteName, cardId: 0, type: "site" },
        owner,
      },
      ownerSeat,
    });
    return;
  }

  // River sites (Spring/Summer/Autumn/Winter River) - look at next spell, may put on bottom
  // "Genesis → Look at your next spell. You may put it on the bottom of your spellbook."
  if (isRiverGenesisSite(siteName)) {
    const ownerSeat = owner === 1 ? "p1" : "p2";
    // Check if resolvers are disabled
    if (!state.resolversDisabled) {
      state.beginRiverGenesis({
        siteName,
        cellKey,
        ownerSeat,
      });
    }
    return;
  }

  // Observatory - Genesis → Look at your next three spells. Put them back in any order.
  if (lc === "observatory") {
    const ownerSeat = owner === 1 ? "p1" : "p2";
    // Check if resolvers are disabled
    if (!state.resolversDisabled) {
      state.beginObservatory({
        siteName,
        cellKey,
        ownerSeat,
      });
    }
    return;
  }

  // Kelp Cavern - Genesis → Look at your bottom three spells. Put one on top of your spellbook.
  if (lc === "kelp cavern") {
    const ownerSeat = owner === 1 ? "p1" : "p2";
    // Check if resolvers are disabled
    if (!state.resolversDisabled) {
      state.beginKelpCavern({
        siteName,
        cellKey,
        ownerSeat,
      });
    }
    return;
  }

  // Crossroads - Genesis → Look at your next four sites. Put three on the bottom of your atlas.
  if (lc === "crossroads") {
    const ownerSeat = owner === 1 ? "p1" : "p2";
    // Check if resolvers are disabled
    if (!state.resolversDisabled) {
      state.beginCrossroads({
        siteName,
        cellKey,
        ownerSeat,
      });
    }
    return;
  }

  // Beacon - Genesis → Gain (1) for each nearby site with an enemy atop it.
  // "Nearby" means 8 directions (orthogonal + diagonals)
  if (BEACON_GENESIS_SITES.has(lc)) {
    const boardWidth = state.board.size.w;
    const boardHeight = state.board.size.h;
    const nearbyCells = getNearbyCells(cellKey, boardWidth, boardHeight);
    const enemyOwner = owner === 1 ? 2 : 1;

    let enemyOccupiedSites = 0;
    for (const nearbyCell of nearbyCells) {
      // Check if there's a site at this cell (not void)
      const site = state.board.sites[nearbyCell];
      if (!site) continue; // Skip void cells

      // Check for enemy minions/avatars at this site
      const permsAtCell = state.permanents[nearbyCell] || [];
      const hasEnemyMinion = permsAtCell.some((p) => {
        if (!p || p.owner !== enemyOwner) return false;
        const cardType = String(p.card?.type || "").toLowerCase();
        return cardType.includes("minion");
      });

      // Check for enemy avatar at this site
      const enemyAvatarKey = enemyOwner === 1 ? "p1" : "p2";
      const enemyAvatar = state.avatars[enemyAvatarKey];
      const hasEnemyAvatar =
        enemyAvatar?.pos &&
        `${enemyAvatar.pos[0]},${enemyAvatar.pos[1]}` === nearbyCell;

      if (hasEnemyMinion || hasEnemyAvatar) {
        enemyOccupiedSites++;
      }
    }

    if (enemyOccupiedSites > 0) {
      state.registerGenesisMana(cellKey, siteName, enemyOccupiedSites, owner);
      state.log(
        `${siteName} Genesis: ${enemyOccupiedSites} nearby enemy-occupied site(s) - gain (${enemyOccupiedSites}) this turn`,
      );
    } else {
      state.log(`${siteName} Genesis: No nearby enemy-occupied sites`);
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

const TEMPLAR_NAME_PATTERN = /\b(knight|sir|dame)\b/i;

const getEffectiveAvatarName = (state: GameState, who: PlayerKey) =>
  state.imposterMasks[who]?.maskAvatar?.name ?? state.avatars[who]?.card?.name;

const isTemplarDiscountCard = (card: CardRef): boolean => {
  const type = String(card.type || "").toLowerCase();
  if (!type.includes("minion") || type.includes("token")) return false;
  return TEMPLAR_NAME_PATTERN.test(String(card.name || ""));
};

const applyAvatarCostAdjustments = (input: {
  state: GameState;
  who: PlayerKey;
  card: CardRef;
  type: string;
  x: number;
  y: number;
  manaCost: number;
  log?: (message: string) => void;
}): {
  manaCost: number;
  harbingerPortalDiscountUsedNext:
    | GameState["harbingerPortalDiscountUsed"]
    | null;
  templarDiscountUsedNext: GameState["templarDiscountUsed"] | null;
} => {
  const { state, who, card, type, x, y, manaCost, log } = input;
  let adjustedManaCost = manaCost;
  let harbingerPortalDiscountUsedNext:
    | GameState["harbingerPortalDiscountUsed"]
    | null = null;
  let templarDiscountUsedNext: GameState["templarDiscountUsed"] | null = null;

  if (
    !type.includes("minion") ||
    type.includes("token") ||
    adjustedManaCost <= 0
  ) {
    return {
      manaCost: adjustedManaCost,
      harbingerPortalDiscountUsedNext,
      templarDiscountUsedNext,
    };
  }

  const effectiveAvatarName = getEffectiveAvatarName(state, who);

  if (
    isHarbinger(effectiveAvatarName) &&
    !state.harbingerPortalDiscountUsed[who]
  ) {
    const { isPortal, owner: portalOwner } = isPortalTile(
      x,
      y,
      state.portalState,
    );
    const playerOwner = who === "p1" ? "p1" : "p2";
    if (isPortal && portalOwner === playerOwner) {
      adjustedManaCost = Math.max(0, adjustedManaCost - 1);
      harbingerPortalDiscountUsedNext = {
        ...state.harbingerPortalDiscountUsed,
        [who]: true,
      };
      log?.(
        `[Harbinger Portal] ${card.name} cost reduced by 1 (portal discount)`,
      );
    }
  }

  if (
    adjustedManaCost > 0 &&
    isTemplar(effectiveAvatarName) &&
    !state.templarDiscountUsed[who] &&
    isTemplarDiscountCard(card)
  ) {
    adjustedManaCost = Math.max(0, adjustedManaCost - 1);
    templarDiscountUsedNext = {
      ...state.templarDiscountUsed,
      [who]: true,
    };
    log?.(`[Templar] ${card.name} cost reduced by 1`);
  }

  return {
    manaCost: adjustedManaCost,
    harbingerPortalDiscountUsedNext,
    templarDiscountUsedNext,
  };
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
      // Tutorial action gate — block invalid placements
      const gate = state.tutorialActionGate;
      if (gate.active && gate.validate) {
        if (!gate.validate("play", x, y, sel.card.name)) {
          gate.onReject?.("play", x, y, sel.card.name);
          return state;
        }
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
      if (!type.includes("site") && !type.includes("token")) {
        // Check threshold requirements
        const req = (card.thresholds || {}) as Partial<
          Record<keyof Thresholds, number>
        >;
        const have = computeThresholdTotals(
          state.board,
          state.permanents,
          who,
          state.avatars[who],
          state.specialSiteState,
          state.babelTowers,
        );
        const missingThresholds: string[] = [];
        for (const kk of Object.keys(req) as (keyof Thresholds)[]) {
          const need = Number(req[kk] ?? 0);
          const haveVal = Number(have[kk] ?? 0);
          if (need > haveVal) {
            missingThresholds.push(`${kk} ${need - haveVal}`);
          }
        }

        // Check mana cost using computeAvailableMana
        const cardManaCost = getManaCost(card, state.metaByCardId);
        const currentMana = computeAvailableMana(
          state.board,
          state.permanents,
          who,
          state.zones,
          state.specialSiteState,
          have,
          state.turn,
          state.etherCoresInVoidAtTurnStart,
          state.babelTowers,
          state.coresCarriedAtTurnStart,
        );
        const { manaCost: adjustedCardManaCost } = applyAvatarCostAdjustments({
          state,
          who,
          card,
          type,
          x,
          y,
          manaCost: cardManaCost,
        });
        const manaInsufficient = adjustedCardManaCost > currentMana;

        // Build structured missing thresholds data
        const missingThresholdData: Record<string, number> = {};
        for (const kk of Object.keys(req) as (keyof Thresholds)[]) {
          const need = Number(req[kk] ?? 0);
          const haveVal = Number(have[kk] ?? 0);
          if (need > haveVal) {
            missingThresholdData[kk] = need - haveVal;
          }
        }

        if (manaInsufficient || missingThresholds.length) {
          get().log(
            `[Warning] '${card.name}' ${manaInsufficient ? `costs ${adjustedCardManaCost} (you have ${currentMana})` : ""} ${missingThresholds.length ? `missing: ${missingThresholds.join(", ")}` : ""}`,
          );
          try {
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("app:toast", {
                  detail: {
                    type: "resource-warning",
                    cardName: card.name,
                    manaCost: manaInsufficient ? adjustedCardManaCost : null,
                    availableMana: manaInsufficient ? currentMana : null,
                    missingThresholds: missingThresholdData,
                  },
                }),
              );
            }
          } catch {}
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
        return { ...state, castPlacementMode: null, selectedCard: null };
      }
      // Block non-site/non-token cards outside of Main phase (and Start phase after drawing)
      // Sorcery phases: Start, Draw, Main, End (no combat phase)
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
          `Cannot play '${card.name}' during ${state.phase} phase – play cards during Main phase`,
        );
        return { ...state, castPlacementMode: null, selectedCard: null };
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
      const cellNo = getCellNumber(
        x,
        y,
        state.board.size.w,
        state.board.size.h,
      );
      if (type.includes("site")) {
        // Check for Apex of Babel special placement
        if (isApexOfBabel(card.name)) {
          // Check if dropping directly onto a Base of Babel - auto-merge
          const targetSite = state.board.sites[key];
          if (
            targetSite &&
            targetSite.owner === ownerFromSeat(who) &&
            isBaseOfBabel(targetSite.card?.name)
          ) {
            // Direct drop on Base - trigger merge immediately
            setTimeout(() => {
              get().mergeBabelTower(key, card, who, index);
            }, 0);
            return state;
          }

          // Find all valid void cells and Base of Babel cells for overlay
          const validVoidCells: CellKey[] = [];
          const validBaseCells: CellKey[] = [];

          for (let cy = 0; cy < state.board.size.h; cy++) {
            for (let cx = 0; cx < state.board.size.w; cx++) {
              const cellKey = toCellKey(cx, cy);
              const existingSite = state.board.sites[cellKey];
              if (!existingSite) {
                validVoidCells.push(cellKey);
              } else if (
                existingSite.owner === ownerFromSeat(who) &&
                isBaseOfBabel(existingSite.card?.name)
              ) {
                validBaseCells.push(cellKey);
              }
            }
          }

          // If there are Base of Babel cells, show the placement overlay
          if (validBaseCells.length > 0) {
            // Restore the hand (we removed too early)
            const restoredHand = [...state.zones[who].hand];
            restoredHand.splice(index, 0, card);

            // Trigger the babel placement flow
            setTimeout(() => {
              get().beginBabelPlacement({
                apex: card,
                casterSeat: who,
                handIndex: index,
                validVoidCells,
                validBaseCells,
              });
            }, 0);

            // Return state unchanged, waiting for player choice
            return {
              ...state,
              selectedCard: sel, // Keep selection for visual feedback
            } as GameState;
          }
          // No Base of Babel on board - fall through to normal site placement
        }

        if (state.board.sites[key]) {
          get().log(
            `Cannot play site '${card.name}': #${cellNo} already occupied`,
          );
          return state;
        }

        // Check for Rubble tokens on this tile and auto-banish them
        let permanentsNext = state.permanents;
        const rubbleBanished: {
          owner: 1 | 2;
          card: CardRef;
          instanceId: string;
        }[] = [];
        const cellPerms = state.permanents[key] || [];
        if (cellPerms.length > 0) {
          const rubbleIndices: number[] = [];
          cellPerms.forEach((perm, idx) => {
            const name = perm.card?.name?.toLowerCase() || "";
            if (name === "rubble") {
              rubbleIndices.push(idx);
              rubbleBanished.push({
                owner: perm.owner,
                card: perm.card,
                instanceId: perm.instanceId || perm.card?.instanceId || "",
              });
            }
          });
          if (rubbleIndices.length > 0) {
            permanentsNext = { ...state.permanents };
            const filteredPerms = cellPerms.filter(
              (_, idx) => !rubbleIndices.includes(idx),
            );
            if (filteredPerms.length === 0) {
              delete permanentsNext[key];
            } else {
              permanentsNext[key] = filteredPerms;
            }
            // Log the rubble banishment
            rubbleBanished.forEach((rb) => {
              const rbOwnerSeat = seatFromOwner(rb.owner);
              const rbPlayerNum = rbOwnerSeat === "p1" ? "1" : "2";
              get().log(
                `[p${rbPlayerNum}:PLAYER]'s [p${rbPlayerNum}card:Rubble] at #${cellNo} is banished`,
              );
            });
          }
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
          // Add banished rubble to the appropriate owners' zones
          rubbleBanished.forEach((rb) => {
            const rbOwnerSeat = seatFromOwner(rb.owner);
            if (!zonesNext[rbOwnerSeat]) {
              zonesNext[rbOwnerSeat] = { ...state.zones[rbOwnerSeat] };
            }
            zonesNext[rbOwnerSeat] = {
              ...zonesNext[rbOwnerSeat],
              banished: [...(zonesNext[rbOwnerSeat].banished || []), rb.card],
            };
          });
          const zonePatch = createZonesPatchFor(zonesNext, who);
          // Also include opponent zones if rubble was banished from them
          const affectedSeats = new Set([who]);
          rubbleBanished.forEach((rb) =>
            affectedSeats.add(seatFromOwner(rb.owner)),
          );
          let combinedZonePatch = zonePatch;
          affectedSeats.forEach((seat) => {
            if (seat !== who) {
              const otherPatch = createZonesPatchFor(zonesNext, seat);
              if (otherPatch?.zones) {
                combinedZonePatch = {
                  zones: { ...combinedZonePatch?.zones, ...otherPatch.zones },
                };
              }
            }
          });
          // Build permanents patch using delta removal for rubble
          let permanentsPatch: ServerPatchT["permanents"] | undefined;
          if (rubbleBanished.length > 0) {
            const deltaUpdates = rubbleBanished
              .filter((rb) => rb.instanceId)
              .map((rb) => ({
                at: key,
                entry: { instanceId: rb.instanceId },
                remove: true,
              }));
            if (deltaUpdates.length > 0) {
              const deltaPatch = createPermanentDeltaPatch(deltaUpdates);
              permanentsPatch = deltaPatch?.permanents;
            }
            // Fallback to full cell state if delta patch failed
            if (!permanentsPatch) {
              permanentsPatch = {
                [key]: permanentsNext[key] || [],
              } as ServerPatchT["permanents"];
            }
          }
          const sitesPatch: Record<string, unknown> = {
            [key]: sites[key] ?? null,
          };
          const patch: ServerPatchT = {
            ...(combinedZonePatch?.zones
              ? { zones: combinedZonePatch.zones }
              : {}),
            board: {
              ...state.board,
              sites: sitesPatch as GameState["board"]["sites"],
            } as GameState["board"],
            ...(permanentsPatch ? { permanents: permanentsPatch } : {}),
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

        // Trigger Mirror Realm transformation (Gothic expansion)
        // "When played, choose a nearby site to copy. Transform into that site."
        if (card.name?.toLowerCase().includes("mirror realm")) {
          setTimeout(() => {
            get().beginMirrorRealm({
              mirrorRealmCell: key,
              casterSeat: who,
            });
          }, 0);
        }

        // Geomancer ability 1: "If you played an earth site, fill a void adjacent to you with Rubble."
        if (isGeomancer(get().avatars[who]?.card?.name)) {
          const earthThreshold = Number(card.thresholds?.earth ?? 0);
          console.log("[GEOMANCER] Earth site check:", {
            cardName: card.name,
            thresholds: card.thresholds,
            earthThreshold,
            who,
          });
          if (earthThreshold > 0) {
            setTimeout(() => {
              get().beginGeomancerFill(who);
            }, 100); // Slight delay to let site placement state settle
          }
        }

        const nextInteractionLog = expireInteractionGrant(
          state,
          consumeInstantId,
        );
        // Build final zones with rubble banishment
        const finalZones = {
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
        // Add banished rubble to the appropriate owners' zones
        rubbleBanished.forEach((rb) => {
          const rbOwnerSeat = seatFromOwner(rb.owner);
          if (!finalZones[rbOwnerSeat]) {
            finalZones[rbOwnerSeat] = { ...state.zones[rbOwnerSeat] };
          }
          finalZones[rbOwnerSeat] = {
            ...finalZones[rbOwnerSeat],
            banished: [...(finalZones[rbOwnerSeat].banished || []), rb.card],
          };
        });
        return {
          zones: finalZones,
          board: { ...state.board, sites },
          permanents: permanentsNext,
          selectedCard: null,
          selectedPermanent: null,
          castPlacementMode: null,
          ...(nextInteractionLog ? { interactionLog: nextInteractionLog } : {}),
        } as Partial<GameState> as GameState;
      }
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[key] || [])];
      const cardWithId = prepareCardForSeat(card, who);
      const isFaceDown = state.dragFaceDown;
      const isSubsurface = state.castSubsurface;
      const permanentInstanceId =
        cardWithId.instanceId ?? newPermanentInstanceId();
      arr.push({
        owner: ownerFromSeat(who),
        card: cardWithId,
        offset: offset || null,
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId: permanentInstanceId,
        faceDown: isFaceDown || undefined,
        enteredOnTurn: state.turn, // Track when this permanent entered (for Savior ward ability)
      });
      // Reset dragFaceDown after use
      if (isFaceDown) {
        setTimeout(() => get().setDragFaceDown(false), 0);
      }
      // Build subsurface position/ability data synchronously (included in patch + state)
      const subsurfacePosition = isSubsurface
        ? {
            permanentId: permanentInstanceId,
            state: "burrowed" as const,
            position: { x: 0, y: -0.25, z: 0 },
          }
        : null;
      const subsurfaceAbility = isSubsurface
        ? {
            permanentId: permanentInstanceId,
            canBurrow: true,
            canSubmerge: false,
            requiresWaterSite: false,
            abilitySource: "Cast subsurface",
          }
        : null;
      if (isSubsurface) {
        setTimeout(() => get().setCastSubsurface(false), 0);
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
      const {
        manaCost,
        harbingerPortalDiscountUsedNext,
        templarDiscountUsedNext,
      } = applyAvatarCostAdjustments({
        state,
        who,
        card,
        type,
        x,
        y,
        manaCost: getManaCost(card, state.metaByCardId),
        log: (message) => get().log(message),
      });

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
      // Include Harbinger portal discount usage in patch
      if (harbingerPortalDiscountUsedNext)
        combined.harbingerPortalDiscountUsed = harbingerPortalDiscountUsedNext;
      if (templarDiscountUsedNext)
        combined.templarDiscountUsed = templarDiscountUsedNext;
      // Include subsurface position/ability in patch for opponent sync
      if (subsurfacePosition && subsurfaceAbility) {
        combined.permanentPositions = {
          ...state.permanentPositions,
          [permanentInstanceId]: subsurfacePosition,
        };
        combined.permanentAbilities = {
          ...state.permanentAbilities,
          [permanentInstanceId]: subsurfaceAbility,
        };
      }
      if (Object.keys(combined).length > 0) get().trySendPatch(combined);
      // Check for special card abilities that need custom flows
      const cardNameLower = (card.name || "").toLowerCase();
      const isChaosTwister = cardNameLower.includes("chaos twister");
      const isBrowse = cardNameLower === "browse";
      const isCommonSense = cardNameLower === "common sense";
      const isCorpseExplosion = cardNameLower === "corpse explosion";
      const isCallToWar = cardNameLower === "call to war";
      const isSearingTruth = cardNameLower === "searing truth";
      const isAccusation = cardNameLower === "accusation";
      const isEarthquake = cardNameLower === "earthquake";
      const isMorgana = cardNameLower.includes("morgana le fay");
      const isPithImp = cardNameLower.includes("pith imp");
      const isOmphalos = cardNameLower.includes("omphalos");
      const isLilith = cardNameLower === "lilith";
      const isMerlin = cardNameLower === "merlin";
      const isMotherNature = cardNameLower === "mother nature";
      const isBlackMass = cardNameLower === "black mass";
      const isHighlandPrincess = cardNameLower === "highland princess";
      const isAssortedAnimals = cardNameLower === "assorted animals";
      const isDholChants = cardNameLower === "dhol chants";
      const isAtlanteanFate = cardNameLower === "atlantean fate";
      const isMephistopheles = cardNameLower.includes("mephistopheles");
      const isRaiseDead = cardNameLower === "raise dead";
      const isLegionOfGall = cardNameLower === "legion of gall";
      const isBetrayal = cardNameLower === "betrayal";
      const isInfiltrate = cardNameLower === "infiltrate";
      const isShapeshift = cardNameLower === "shapeshift";
      const isTorshammarTrinket = cardNameLower === "torshammar trinket";
      const isTheInquisition = cardNameLower === "the inquisition";
      const isFeastForCrows = cardNameLower === "feast for crows";

      // If this is Torshammar Trinket, show a toast that it will return to hand automatically
      if (isTorshammarTrinket && newest && type.includes("artifact")) {
        const playerNum = who === "p1" ? "1" : "2";
        const trinketToast = `[p${playerNum}card:Torshammar Trinket] will return to hand at end of turn`;
        const tr = get().transport;
        if (tr?.sendMessage) {
          try {
            tr.sendMessage({
              type: "toast",
              text: trinketToast,
              cellKey: key,
              seat: who,
            } as never);
          } catch {}
        }
        // Also dispatch local toast
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("app:toast", {
              detail: { message: trinketToast, cellKey: key },
            }),
          );
        }
      }

      console.log("[playActions] Card played:", {
        cardName: card.name,
        cardNameLower,
        isBrowse,
        isCommonSense,
        isCallToWar,
        isSearingTruth,
        isAccusation,
        isCorpseExplosion,
        isEarthquake,
        isMorgana,
        isPithImp,
        isOmphalos,
        isLilith,
        isMerlin,
        isMotherNature,
        isMephistopheles,
        isAtlanteanFate,
        type,
        typeIncludesMinion: type.includes("minion"),
      });

      // Check if resolvers are disabled - if so, skip all custom card logic
      const resolversDisabled = get().resolversDisabled;
      if (resolversDisabled) {
        console.log("[playActions] Resolvers skipped - disabled");
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
          castPlacementMode: null,
          ...(playersNext ? { players: playersNext } : {}),
          ...(harbingerPortalDiscountUsedNext
            ? { harbingerPortalDiscountUsed: harbingerPortalDiscountUsedNext }
            : {}),
          ...(templarDiscountUsedNext
            ? { templarDiscountUsed: templarDiscountUsedNext }
            : {}),
          ...(subsurfacePosition
            ? {
                permanentPositions: {
                  ...state.permanentPositions,
                  [permanentInstanceId]: subsurfacePosition,
                },
              }
            : {}),
          ...(subsurfaceAbility
            ? {
                permanentAbilities: {
                  ...state.permanentAbilities,
                  [permanentInstanceId]: subsurfaceAbility,
                },
              }
            : {}),
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
      // If this is Shapeshift, begin the transformation spell flow
      else if (isShapeshift && newest) {
        try {
          get().beginShapeshift({
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
      // If this is Feast for Crows, begin the naming/search flow
      else if (isFeastForCrows && newest) {
        try {
          get().beginFeastForCrows({
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
      // If this is Corpse Explosion, begin the corpse assignment flow
      else if (isCorpseExplosion && newest) {
        try {
          get().beginCorpseExplosion({
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
      // If this is Merlin minion, register for Spellcaster passive ability
      if (isMerlin && newest && type.includes("minion")) {
        try {
          get().registerMerlin({
            instanceId: newest.instanceId ?? `merlin_${Date.now()}`,
            location: key,
            ownerSeat: who,
            cardName: card.name || "Merlin",
          });
        } catch (e) {
          console.error("[playActions] Error registering Merlin:", e);
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
      // If this is The Inquisition minion, trigger Genesis (reveal opponent hand, may banish)
      if (isTheInquisition && newest && type.includes("minion")) {
        console.log("[playActions] Triggering The Inquisition Genesis:", {
          at: key,
          owner: newest.owner,
          ownerSeat: who,
        });
        try {
          get().beginInquisition({
            minion: {
              at: key,
              index: arr.length - 1,
              instanceId: newest.instanceId ?? null,
              owner: newest.owner,
              card: newest.card as CardRef,
            },
            casterSeat: who,
          });
        } catch (e) {
          console.error("[playActions] Error triggering The Inquisition:", e);
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
      // If this is Atlantean Fate (Aura), begin the 4x4 area selection flow
      else if (isAtlanteanFate && newest) {
        try {
          get().beginAtlanteanFate({
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
          console.error("[playActions] Error triggering Atlantean Fate:", e);
        }
      }
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
      // If this is Legion of Gall, begin the collection inspection flow
      else if (isLegionOfGall && newest) {
        try {
          get().beginLegionOfGall({
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
          console.error("[playActions] Error triggering Legion of Gall:", e);
        }
      }
      // If this is Infiltrate, begin the enemy-minion control flow
      else if (isInfiltrate && newest) {
        try {
          get().beginInfiltrate({
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
          console.error("[playActions] Error triggering Infiltrate:", e);
        }
      } else if (isBetrayal && newest) {
        try {
          get().beginBetrayal({
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
          console.error("[playActions] Error triggering Betrayal:", e);
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
        castPlacementMode: null,
        ...(playersNext ? { players: playersNext } : {}),
        ...(nextInteractionLog ? { interactionLog: nextInteractionLog } : {}),
        // Subsurface cast: set position + ability synchronously in state
        ...(subsurfacePosition
          ? {
              permanentPositions: {
                ...state.permanentPositions,
                [permanentInstanceId]: subsurfacePosition,
              },
            }
          : {}),
        ...(subsurfaceAbility
          ? {
              permanentAbilities: {
                ...state.permanentAbilities,
                [permanentInstanceId]: subsurfaceAbility,
              },
            }
          : {}),
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
      // Sorcery phases: Start, Draw, Main, End (no combat phase)
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
          `Cannot play '${card.name}' from ${from} during ${state.phase} phase – play cards during Main phase`,
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
      const cellNo = getCellNumber(
        x,
        y,
        state.board.size.w,
        state.board.size.h,
      );
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
          const sitesPatch: Record<string, unknown> = {
            [key]: sites[key] ?? null,
          };
          const patch: ServerPatchT = {
            ...(zonePatch?.zones ? { zones: zonePatch.zones } : {}),
            board: {
              ...state.board,
              sites: sitesPatch as GameState["board"]["sites"],
            } as GameState["board"],
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
      const isSubsurfacePile = state.castSubsurface;
      const pilePermInstanceId =
        cardWithId.instanceId ?? newPermanentInstanceId();
      arr.push({
        owner: ownerFromSeat(who),
        card: cardWithId,
        offset: null,
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId: pilePermInstanceId,
        faceDown: isFaceDown || undefined,
        enteredOnTurn: state.turn, // Track when this permanent entered (for Savior ward ability)
      });
      // Reset dragFaceDown after use
      if (isFaceDown) {
        setTimeout(() => get().setDragFaceDown(false), 0);
      }
      // Build subsurface position/ability data synchronously (included in patch + state)
      const pileSubsurfacePosition = isSubsurfacePile
        ? {
            permanentId: pilePermInstanceId,
            state: "burrowed" as const,
            position: { x: 0, y: -0.25, z: 0 },
          }
        : null;
      const pileSubsurfaceAbility = isSubsurfacePile
        ? {
            permanentId: pilePermInstanceId,
            canBurrow: true,
            canSubmerge: false,
            requiresWaterSite: false,
            abilitySource: "Cast subsurface",
          }
        : null;
      if (isSubsurfacePile) {
        setTimeout(() => get().setCastSubsurface(false), 0);
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
      // Include subsurface position/ability in patch for opponent sync
      if (pileSubsurfacePosition && pileSubsurfaceAbility) {
        combined.permanentPositions = {
          ...state.permanentPositions,
          [pilePermInstanceId]: pileSubsurfacePosition,
        };
        combined.permanentAbilities = {
          ...state.permanentAbilities,
          [pilePermInstanceId]: pileSubsurfaceAbility,
        };
      }
      if (Object.keys(combined).length > 0) get().trySendPatch(combined);
      const cardNameLower = (card.name || "").toLowerCase();
      const isBetrayal = cardNameLower === "betrayal";
      const isInfiltrate = cardNameLower === "infiltrate";
      // If this is a Magic card, begin the magic casting flow after placing it
      try {
        if (isBetrayal && newest) {
          get().beginBetrayal({
            spell: {
              at: key,
              index: arr.length - 1,
              instanceId: newest.instanceId ?? null,
              owner: newest.owner,
              card: newest.card as CardRef,
            },
            casterSeat: who,
          });
        } else if (isInfiltrate && newest) {
          get().beginInfiltrate({
            spell: {
              at: key,
              index: arr.length - 1,
              instanceId: newest.instanceId ?? null,
              owner: newest.owner,
              card: newest.card as CardRef,
            },
            casterSeat: who,
          });
        } else if (type.includes("magic") && newest) {
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
        castPlacementMode: null,
        ...(nextInteractionLog ? { interactionLog: nextInteractionLog } : {}),
        // Subsurface cast: set position + ability synchronously in state
        ...(pileSubsurfacePosition
          ? {
              permanentPositions: {
                ...state.permanentPositions,
                [pilePermInstanceId]: pileSubsurfacePosition,
              },
            }
          : {}),
        ...(pileSubsurfaceAbility
          ? {
              permanentAbilities: {
                ...state.permanentAbilities,
                [pilePermInstanceId]: pileSubsurfaceAbility,
              },
            }
          : {}),
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
          // Debug: log graveyard/hand counts in the outgoing patch
          if (process.env.NODE_ENV !== "production" && from === "graveyard") {
            const pz = patch.zones as Record<
              string,
              { hand?: unknown[]; graveyard?: unknown[] }
            >;
            const seatZones = pz?.[who];
            console.log("[drawFromPileToHand] Sending zone patch:", {
              seat: who,
              from,
              cardName: card.name,
              patchHandCount: seatZones?.hand?.length,
              patchGraveyardCount: seatZones?.graveyard?.length,
              prevHandCount: state.zones[who]?.hand?.length,
              prevGraveyardCount: state.zones[who]?.graveyard?.length,
            });
          }
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
