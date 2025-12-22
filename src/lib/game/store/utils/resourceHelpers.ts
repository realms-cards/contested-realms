import { isElementalist } from "@/lib/game/avatarAbilities";
import {
  BACK_ROW_ONLY_SITES,
  CEMETERY_MANA_SITES,
  CITY_BONUS_SITES,
  CONDITIONAL_MANA_SITES,
  CONDITIONAL_THRESHOLD_SITES,
  ELEMENT_CHOICE_SITES,
  GENESIS_MANA_SITES,
  MANA_PROVIDER_BY_NAME,
  NON_MANA_SITE_IDENTIFIERS,
  SHARED_MANA_SITES,
  THRESHOLD_GRANT_BY_NAME,
  VOID_MANA_PROVIDERS,
} from "@/lib/game/mana-providers";
import { getAdjacentCells, parseCellKey } from "./boardHelpers";
import type {
  AvatarState,
  BoardState,
  CardRef,
  GameState,
  Permanents,
  Phase,
  PlayerKey,
  SpecialSiteState,
  Thresholds,
  Zones,
} from "../types";

const THRESHOLD_KEYS: (keyof Thresholds)[] = ["air", "water", "earth", "fire"];

export const phases: Phase[] = ["Setup", "Start", "Draw", "Main", "End"];

export const emptyThresholds = (): Thresholds => ({
  air: 0,
  water: 0,
  earth: 0,
  fire: 0,
});

// Note: Threshold cache is currently disabled to ensure accuracy with dynamic
// special site bonuses (bloom sites, valley choices, etc.). The cache can be
// re-enabled with proper invalidation when special site state changes.

export const playerKeyToOwner = (who: PlayerKey): 1 | 2 =>
  who === "p1" ? 1 : 2;

const accumulateThresholds = (
  acc: Thresholds,
  amount: Partial<Thresholds> | null | undefined
) => {
  if (!amount || typeof amount !== "object") return;
  for (const key of THRESHOLD_KEYS) {
    const value = Number((amount as Record<string, unknown>)[key] ?? 0);
    if (Number.isFinite(value) && value !== 0) {
      acc[key] += value;
    }
  }
};

// Check if a site is adjacent to the void
const isSiteAdjacentToVoid = (cellKey: string, board: BoardState): boolean => {
  const adjacent = getAdjacentCells(cellKey, board.size.w, board.size.h);
  for (const adjKey of adjacent) {
    if (!board.sites[adjKey]) return true; // No site = void
  }
  return false;
};

// Check if site is completely empty (no permanents)
const isSiteEmpty = (cellKey: string, permanents: Permanents): boolean => {
  const permsAtCell = permanents[cellKey];
  return !permsAtCell || permsAtCell.length === 0;
};

// Check if player controls an Angel or Ward nearby a site
const hasNearbyAngelOrWard = (
  cellKey: string,
  board: BoardState,
  permanents: Permanents,
  owner: 1 | 2
): boolean => {
  const adjacent = getAdjacentCells(cellKey, board.size.w, board.size.h);
  const cellsToCheck = [cellKey, ...adjacent];

  for (const checkKey of cellsToCheck) {
    const permsAtCell = permanents[checkKey];
    if (!permsAtCell) continue;

    for (const perm of permsAtCell) {
      if (perm.owner !== owner) continue;

      const subTypes = String(perm.card?.subTypes || "").toLowerCase();
      const name = String(perm.card?.name || "").toLowerCase();

      // Check for Angel subtype
      if (subTypes.includes("angel")) return true;

      // Check for Ward keyword in name or card having Ward status
      // Note: Ward is typically granted by effects, not easily detectable
      // For now, check if the permanent has "ward" in name or subtypes
      if (name.includes("ward") || subTypes.includes("ward")) return true;
    }

    // Also check if any site nearby has Ward
    const siteAtCell = board.sites[checkKey];
    if (siteAtCell && siteAtCell.owner === owner) {
      const siteName = String(siteAtCell.card?.name || "").toLowerCase();
      if (siteName.includes("ward")) return true;
    }
  }

  return false;
};

// Check if a conditional site provides mana/threshold
export const conditionalSiteProvides = (
  siteName: string,
  cellKey: string,
  board: BoardState,
  permanents: Permanents
): boolean => {
  const lc = siteName.toLowerCase();
  const condition =
    CONDITIONAL_MANA_SITES[lc as keyof typeof CONDITIONAL_MANA_SITES];
  if (!condition) return true; // Not a conditional site

  if (condition.condition === "empty") {
    return isSiteEmpty(cellKey, permanents);
  }

  if (condition.condition === "adjacent_to_void") {
    return isSiteAdjacentToVoid(cellKey, board);
  }

  return true;
};

export const computeThresholdTotals = (
  board: BoardState,
  permanents: Permanents,
  who: PlayerKey,
  avatar?: AvatarState | null,
  specialSiteState?: SpecialSiteState | null
): Thresholds => {
  const owner = playerKeyToOwner(who);
  const boardHeight = board?.size?.h ?? 4;
  const totals = emptyThresholds();

  // Elementalist avatar grants +1 to each threshold
  if (avatar && isElementalist(avatar.card?.name)) {
    totals.air += 1;
    totals.water += 1;
    totals.earth += 1;
    totals.fire += 1;
  }

  for (const [cellKey, tile] of Object.entries(board?.sites ?? {})) {
    // Check SHARED_MANA_SITES (Avalon) - provides threshold to BOTH players
    const siteName = String(tile?.card?.name || "").toLowerCase();
    const isShared = SHARED_MANA_SITES.has(siteName);

    // For non-shared sites, check ownership
    if (!isShared && (!tile || tile.owner !== owner)) continue;

    // Check back-row-only sites
    if (
      !backRowSiteProvidesMana(
        tile?.card ?? null,
        cellKey,
        tile?.owner ?? owner,
        boardHeight
      )
    )
      continue;

    // Check conditional sites (Pristine Paradise, Colour Out of Space)
    if (!conditionalSiteProvides(siteName, cellKey, board, permanents))
      continue;

    // Check if this is an element choice site (Valley of Delight)
    if (ELEMENT_CHOICE_SITES.has(siteName)) {
      // Look up the player's choice for this site
      const choice = specialSiteState?.valleyChoices.find(
        (c) =>
          c.cellKey === cellKey && c.owner === (isShared ? owner : tile?.owner)
      );
      if (choice) {
        totals[choice.element] += 1;
      }
      // If no choice made yet, site provides nothing
      continue;
    }

    // Check The Empyrean - provides (A)(E)(F)(W) if nearby Angel or Ward
    const empyreanConfig =
      CONDITIONAL_THRESHOLD_SITES[
        siteName as keyof typeof CONDITIONAL_THRESHOLD_SITES
      ];
    if (empyreanConfig) {
      if (
        hasNearbyAngelOrWard(cellKey, board, permanents, tile?.owner ?? owner)
      ) {
        accumulateThresholds(totals, empyreanConfig.thresholds);
      }
      continue;
    }

    // Standard threshold from site
    accumulateThresholds(totals, tile?.card?.thresholds ?? null);
  }

  // Add bloom bonuses (temporary threshold from Genesis this turn)
  if (specialSiteState?.bloomBonuses) {
    for (const bonus of specialSiteState.bloomBonuses) {
      if (bonus.owner === owner) {
        accumulateThresholds(totals, bonus.thresholds);
      }
    }
  }

  // Add threshold from permanents
  for (const arr of Object.values(permanents ?? {})) {
    const list = Array.isArray(arr) ? arr : [];
    for (const p of list) {
      try {
        if (!p || p.owner !== owner) continue;
        const nm = String(p.card?.name || "").toLowerCase();
        const grant = THRESHOLD_GRANT_BY_NAME[nm];
        if (grant) accumulateThresholds(totals, grant as Partial<Thresholds>);
      } catch {}
    }
  }

  return totals;
};

export const getCachedThresholdTotals = (
  state: GameState,
  who: PlayerKey
): Thresholds => {
  // Note: Cache is disabled when special site state changes frequently
  // For now, always recompute to ensure accuracy with bloom bonuses
  const avatarRef = state.avatars[who];

  return computeThresholdTotals(
    state.board,
    state.permanents,
    who,
    avatarRef,
    state.specialSiteState
  );
};

export const siteProvidesMana = (card: CardRef | null | undefined): boolean => {
  if (!card) return false;
  const slug = typeof card.slug === "string" ? card.slug.toLowerCase() : null;
  if (slug && NON_MANA_SITE_IDENTIFIERS.has(slug)) return false;
  const name = typeof card.name === "string" ? card.name.toLowerCase() : null;
  if (name && NON_MANA_SITE_IDENTIFIERS.has(name)) return false;
  return true;
};

// Check if a site is in the owner's back row.
// P1's back row is y=0, P2's back row is y=boardHeight-1 (typically y=3).
export const isInBackRow = (
  cellKey: string,
  owner: 1 | 2,
  boardHeight: number
): boolean => {
  const { y } = parseCellKey(cellKey);
  if (owner === 1) return y === 0;
  return y === boardHeight - 1;
};

// Check if a back-row-only site provides mana based on its position.
export const backRowSiteProvidesMana = (
  card: CardRef | null | undefined,
  cellKey: string,
  owner: 1 | 2,
  boardHeight: number
): boolean => {
  if (!card) return false;
  const name = typeof card.name === "string" ? card.name.toLowerCase() : null;
  if (!name || !BACK_ROW_ONLY_SITES.has(name)) return true; // Not a back-row-only site
  return isInBackRow(cellKey, owner, boardHeight);
};

// Count unique minions in a zone by rarity
const countUniqueMinionsInZone = (zone: CardRef[]): number => {
  let count = 0;
  for (const card of zone) {
    // Check if this is a Unique minion
    const type = String(card.type || "").toLowerCase();
    if (!type.includes("minion")) continue;

    // Note: We'd need rarity info from card meta to check Unique rarity
    // For now, use a heuristic based on naming conventions
    // In practice, this should be enhanced with metaByCardId lookup
    count += 1; // Simplified - count all minions, real impl needs rarity check
  }
  return count;
};

export const computeAvailableMana = (
  board: BoardState,
  permanents: Permanents,
  who: PlayerKey,
  zones?: Record<PlayerKey, Zones> | null,
  specialSiteState?: SpecialSiteState | null,
  thresholds?: Thresholds | null
): number => {
  const owner = playerKeyToOwner(who);
  const opponent: PlayerKey = who === "p1" ? "p2" : "p1";
  const boardHeight = board?.size?.h ?? 4;
  let mana = 0;

  for (const [cellKey, tile] of Object.entries(board?.sites ?? {})) {
    const siteName = String(tile?.card?.name || "").toLowerCase();

    // Check SHARED_MANA_SITES (Avalon) - provides mana to BOTH players
    const isShared = SHARED_MANA_SITES.has(siteName);

    // For non-shared sites, check ownership
    if (!isShared && (!tile || tile.owner !== owner)) continue;
    if (tile?.tapped) continue;
    if (!siteProvidesMana(tile?.card ?? null)) continue;

    // Check back-row-only sites
    if (
      !backRowSiteProvidesMana(
        tile?.card ?? null,
        cellKey,
        tile?.owner ?? owner,
        boardHeight
      )
    )
      continue;

    // Check conditional sites (Pristine Paradise, Colour Out of Space)
    if (!conditionalSiteProvides(siteName, cellKey, board, permanents))
      continue;

    // Check if this is an element choice site (Valley of Delight)
    // These provide mana only after a choice is made
    if (ELEMENT_CHOICE_SITES.has(siteName)) {
      const choice = specialSiteState?.valleyChoices.find(
        (c) => c.cellKey === cellKey
      );
      if (choice) {
        mana += 1; // Valley of Delight provides 1 mana after choice
      }
      continue;
    }

    // Check City bonus sites (+1 mana if you have the required threshold)
    const cityConfig = CITY_BONUS_SITES[siteName];
    if (cityConfig && thresholds) {
      const hasThreshold = (thresholds[cityConfig.requiredElement] || 0) >= 1;
      if (hasThreshold) {
        mana += 1 + cityConfig.extraMana; // Base 1 + extra
      } else {
        mana += 1; // Just base mana without bonus
      }
      continue;
    }

    // Check Myrrh's Trophy Room - extra mana per Unique in opponent's graveyard
    const cemeteryConfig = CEMETERY_MANA_SITES[siteName];
    if (cemeteryConfig && zones) {
      const oppGraveyard = zones[opponent]?.graveyard || [];
      const uniqueCount = countUniqueMinionsInZone(oppGraveyard);
      mana += 1 + uniqueCount * cemeteryConfig.perUnique;
      continue;
    }

    // The Empyrean - provides mana only if condition met
    const empyreanConfig =
      CONDITIONAL_THRESHOLD_SITES[
        siteName as keyof typeof CONDITIONAL_THRESHOLD_SITES
      ];
    if (empyreanConfig) {
      if (
        hasNearbyAngelOrWard(cellKey, board, permanents, tile?.owner ?? owner)
      ) {
        mana += 1;
      }
      continue;
    }

    // Ghost Town and other genesis mana sites provide base 0 mana
    // The temporary bonus is added below
    if (siteName in GENESIS_MANA_SITES) {
      // No base mana from Ghost Town
      continue;
    }

    // Standard mana from site
    mana += 1;
  }

  // Add genesis mana bonuses (temporary mana from Genesis this turn)
  if (specialSiteState?.genesisMana) {
    for (const bonus of specialSiteState.genesisMana) {
      if (bonus.owner === owner) {
        mana += bonus.manaAmount;
      }
    }
  }

  // Add mana from permanents
  for (const [cellKey, arr] of Object.entries(permanents ?? {})) {
    const list = Array.isArray(arr) ? arr : [];
    const isVoidCell = !board?.sites?.[cellKey]; // No site at this cell = void
    for (const p of list) {
      try {
        if (!p || p.owner !== owner) continue;
        const nm = String(p.card?.name || "").toLowerCase();
        // Check for void mana providers (e.g., Ether Core)
        if (isVoidCell && VOID_MANA_PROVIDERS[nm]) {
          mana += VOID_MANA_PROVIDERS[nm];
          continue;
        }
        // Regular mana providers
        if (MANA_PROVIDER_BY_NAME.has(nm)) mana += 1;
      } catch {}
    }
  }

  return mana;
};
