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
  MULTI_THRESHOLD_SITES,
  NON_MANA_SITE_IDENTIFIERS,
  SHARED_MANA_SITES,
  THRESHOLD_GRANT_BY_NAME,
  VOID_MANA_PROVIDERS,
} from "@/lib/game/mana-providers";
import { isBaseOfBabel, isTowerOfBabel } from "../babelTowerState";
import { getAdjacentCells, parseCellKey } from "./boardHelpers";
import type {
  AvatarState,
  BabelTowerMerge,
  BoardState,
  CardRef,
  CellKey,
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
  amount: Partial<Thresholds> | null | undefined,
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
  owner: 1 | 2,
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
  permanents: Permanents,
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

// Check if an Atlantean Fate aura has a Silenced token on it
// (placed at the aura's permanent location)
export const auraHasSilencedToken = (
  auraPermanentAt: string,
  permanents: Permanents,
): boolean => {
  const permsAtCell = permanents[auraPermanentAt];
  if (!permsAtCell) return false;
  for (const perm of permsAtCell) {
    const name = String(perm.card?.name || "").toLowerCase();
    if (name === "silenced") return true;
  }
  return false;
};

// Check if a site is flooded by Atlantean Fate
// A silenced Atlantean Fate aura does NOT flood sites
const isSiteFloodedByAtlanteanFate = (
  cellKey: string,
  specialSiteState?: SpecialSiteState | null,
  permanents?: Permanents,
): boolean => {
  if (!specialSiteState?.atlanteanFateAuras) return false;
  for (const aura of specialSiteState.atlanteanFateAuras) {
    if (aura.floodedSites.includes(cellKey)) {
      // Check if this aura is silenced - silenced auras don't apply their effect
      if (permanents && auraHasSilencedToken(aura.permanentAt, permanents)) {
        continue; // Skip this aura, it's silenced
      }
      return true;
    }
  }
  return false;
};

// Check if a site has a Flooded token on it (from context menu flood action)
export const siteHasFloodedToken = (
  cellKey: string,
  permanents: Permanents,
): boolean => {
  const permsAtCell = permanents[cellKey];
  if (!permsAtCell) return false;
  for (const perm of permsAtCell) {
    const name = String(perm.card?.name || "").toLowerCase();
    if (name === "flooded") return true;
  }
  return false;
};

// Check if a site has a Silenced token on it
// NOTE: Silenced sites lose their textbox ability but STILL provide mana and threshold
export const siteHasSilencedToken = (
  cellKey: string,
  permanents: Permanents,
): boolean => {
  const permsAtCell = permanents[cellKey];
  if (!permsAtCell) return false;
  for (const perm of permsAtCell) {
    const name = String(perm.card?.name || "").toLowerCase();
    if (name === "silenced") return true;
  }
  return false;
};

// Check if a site has a Disabled token on it
// NOTE: Disabled sites lose their textbox ability AND provide neither mana nor threshold
export const siteHasDisabledToken = (
  cellKey: string,
  permanents: Permanents,
): boolean => {
  const permsAtCell = permanents[cellKey];
  if (!permsAtCell) return false;
  for (const perm of permsAtCell) {
    const name = String(perm.card?.name || "").toLowerCase();
    if (name === "disabled") return true;
  }
  return false;
};

export const computeThresholdTotals = (
  board: BoardState,
  permanents: Permanents,
  who: PlayerKey,
  avatar?: AvatarState | null,
  specialSiteState?: SpecialSiteState | null,
  babelTowers?: BabelTowerMerge[],
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

    // Check if site is flooded by Atlantean Fate - flooded sites only provide water
    // A silenced Atlantean Fate aura does NOT flood sites
    if (isSiteFloodedByAtlanteanFate(cellKey, specialSiteState, permanents)) {
      totals.water += 1;
      continue; // Skip normal threshold calculation for flooded sites
    }

    // Check if site has a Flooded token - adds water threshold
    if (siteHasFloodedToken(cellKey, permanents)) {
      totals.water += 1;
      // Flooded sites still provide their normal threshold, plus the water bonus
      // So we don't continue here - let it fall through to normal calculation
    }

    // Check if site is disabled - disabled sites provide no threshold
    // (Silenced sites still provide threshold, they only lose textbox abilities)
    if (siteHasDisabledToken(cellKey, permanents)) {
      continue; // Skip threshold calculation for disabled sites
    }

    // Check back-row-only sites
    if (
      !backRowSiteProvidesMana(
        tile?.card ?? null,
        cellKey,
        tile?.owner ?? owner,
        boardHeight,
      )
    )
      continue;

    // Check conditional sites (Pristine Paradise, Colour Out of Space)
    if (!conditionalSiteProvides(siteName, cellKey, board, permanents))
      continue;

    // Check if this is an element choice site (Valley of Delight)
    if (ELEMENT_CHOICE_SITES.has(siteName)) {
      // Look up the choice for this site cell (each cell can only have one choice)
      const choice = specialSiteState?.valleyChoices.find(
        (c) => c.cellKey === cellKey,
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

    // Check multi-threshold sites (Tintagel, Avalon, etc.)
    const multiThreshold = MULTI_THRESHOLD_SITES[siteName];
    if (multiThreshold) {
      accumulateThresholds(totals, multiThreshold);
      continue;
    }

    // Tower of Babel: Base provides earth, Apex provides air
    // When merged, both thresholds apply. Hardcoded because card.thresholds
    // may be null depending on the data pipeline.
    if (isBaseOfBabel(siteName)) {
      totals.earth += 1;
      // If merged with Apex, also grant air threshold
      if (babelTowers) {
        const merge = babelTowers.find(
          (t) => t.cellKey === (cellKey as CellKey),
        );
        if (merge) {
          totals.air += 1;
        }
      }
      continue;
    }
    if (siteName.includes("apex of babel")) {
      // Apex played as a standalone site (not merged)
      totals.air += 1;
      continue;
    }

    // Standard threshold from site card data (fallback)
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
        if (grant) {
          const cardType = String(p.card?.type || "").toLowerCase();
          const isArtifact = cardType.includes("artifact");
          // ALL artifacts (including cores) only provide threshold when attached (being carried)
          if (isArtifact && !p.attachedTo) {
            continue;
          }
          accumulateThresholds(totals, grant as Partial<Thresholds>);
        }
      } catch {}
    }
  }

  return totals;
};

export const getCachedThresholdTotals = (
  state: GameState,
  who: PlayerKey,
): Thresholds => {
  // Note: Cache is disabled when special site state changes frequently
  // For now, always recompute to ensure accuracy with bloom bonuses
  const avatarRef = state.avatars[who];

  return computeThresholdTotals(
    state.board,
    state.permanents,
    who,
    avatarRef,
    state.specialSiteState,
    state.babelTowers,
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
// Board coordinate system: y=0 is at the bottom (P2's side), y=boardHeight-1 is at the top (P1's side).
// P1's back row is y=boardHeight-1 (top), P2's back row is y=0 (bottom).
export const isInBackRow = (
  cellKey: string,
  owner: 1 | 2,
  boardHeight: number,
): boolean => {
  const { y } = parseCellKey(cellKey);
  // P1 (owner=1) back row is at the top (y = boardHeight - 1)
  // P2 (owner=2) back row is at the bottom (y = 0)
  return owner === 1 ? y === boardHeight - 1 : y === 0;
};

// Check if a back-row-only site provides mana based on its position.
export const backRowSiteProvidesMana = (
  card: CardRef | null | undefined,
  cellKey: string,
  owner: 1 | 2,
  boardHeight: number,
): boolean => {
  if (!card) return false;
  const name = typeof card.name === "string" ? card.name.toLowerCase() : null;
  if (!name || !BACK_ROW_ONLY_SITES.has(name)) return true; // Not a back-row-only site
  return isInBackRow(cellKey, owner, boardHeight);
};

// Count unique minions in a zone by rarity
// Trophy Room only counts Unique MINIONS, not Unique spells or other card types
const countUniqueMinionsInZone = (zone: CardRef[]): number => {
  let count = 0;
  for (const card of zone) {
    // Must be a minion (not spell, site, artifact, etc.)
    const type = String(card.type || "").toLowerCase();
    if (!type.includes("minion")) continue;

    // Must have Unique rarity
    const rarity = String(card.rarity || "").toLowerCase();
    if (rarity !== "unique") continue;

    count += 1;
  }
  return count;
};

export const computeAvailableMana = (
  board: BoardState,
  permanents: Permanents,
  who: PlayerKey,
  zones?: Record<PlayerKey, Zones> | null,
  specialSiteState?: SpecialSiteState | null,
  thresholds?: Thresholds | null,
  currentTurn?: number,
  etherCoresInVoidAtTurnStart?: string[],
  babelTowers?: BabelTowerMerge[],
  coresCarriedAtTurnStart?: string[],
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

    // Check if site is disabled - disabled sites provide no mana
    // (Silenced sites still provide mana, they only lose textbox abilities)
    if (siteHasDisabledToken(cellKey, permanents)) {
      continue;
    }

    // Check back-row-only sites
    if (
      !backRowSiteProvidesMana(
        tile?.card ?? null,
        cellKey,
        tile?.owner ?? owner,
        boardHeight,
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
        (c) => c.cellKey === cellKey,
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

    // Tower of Babel provides 2 mana (merged from Base + Apex)
    if (
      isTowerOfBabel(siteName) ||
      (babelTowers &&
        isBaseOfBabel(siteName) &&
        babelTowers.some((t) => t.cellKey === (cellKey as CellKey)))
    ) {
      mana += 2;
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
        const cardType = String(p.card?.type || "").toLowerCase();
        const isArtifact = cardType.includes("artifact");
        // Check for void mana providers (e.g., Ether Core)
        // Ether Core only provides 3 mana if:
        // 1. Cast this turn AND currently in void, OR
        // 2. Started the turn in the void (tracked by etherCoresInVoidAtTurnStart)
        // If it started on a site and was moved to void, it provides no mana this turn.
        if (isVoidCell && VOID_MANA_PROVIDERS[nm]) {
          const voidManaAmount = VOID_MANA_PROVIDERS[nm];
          const instanceId = p.instanceId ?? null;
          const enteredThisTurn =
            currentTurn !== undefined &&
            p.enteredOnTurn !== undefined &&
            p.enteredOnTurn === currentTurn;
          const startedInVoid =
            instanceId !== null &&
            etherCoresInVoidAtTurnStart?.includes(instanceId);

          // Only provide mana if cast this turn (while in void) or started turn in void
          if (enteredThisTurn || startedInVoid) {
            mana += voidManaAmount;
          }
          // If neither condition is met, Ether Core provides 0 mana this turn
          continue;
        }
        // Regular mana providers
        if (MANA_PROVIDER_BY_NAME.has(nm)) {
          // ALL artifacts (including cores) only provide mana when attached (being carried)
          if (isArtifact && !p.attachedTo) {
            continue;
          }
          // Artifact cores additionally need mana timing check:
          // only provide mana if summoned this turn OR was carried at turn start
          if (isArtifact && nm.includes("core")) {
            const instanceId = p.instanceId ?? null;
            const enteredThisTurn =
              currentTurn !== undefined &&
              p.enteredOnTurn !== undefined &&
              p.enteredOnTurn === currentTurn;
            const wasCarriedAtStart =
              instanceId !== null &&
              coresCarriedAtTurnStart?.includes(instanceId);
            if (!enteredThisTurn && !wasCarriedAtStart) {
              continue;
            }
          }
          mana += 1;
        }
      } catch {}
    }
  }

  return mana;
};
