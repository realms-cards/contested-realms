import {
  isElementalist,
  isHarbinger,
  isTemplar,
} from "@/lib/game/avatarAbilities";
import { affectedByAura } from "@/lib/game/cpu/auras";
import {
  ADJACENT_SILENCER_NO_THRESHOLD,
  AURA_SITE_MODIFIERS,
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
  OPPONENT_MANA_SITES,
  PER_NEARBY_ENEMY_AVATAR_PROVIDERS,
  SHARED_MANA_SITES,
  SITE_ENHANCER_ARTIFACTS,
  SITE_NO_THRESHOLD_OCCUPANTS,
  THRESHOLD_GRANT_BY_NAME,
  VOID_MANA_PROVIDERS,
} from "@/lib/game/mana-providers";
import { isOrdinarySite } from "../atlanteanFateState";
import { isBaseOfBabel, isTowerOfBabel } from "../babelTowerState";
import { portalOwnersAt } from "../portalState";
import {
  getAdjacentCells,
  getNearbyCells,
  parseCellKey,
  toCellKey,
} from "./boardHelpers";
import type {
  AvatarState,
  BabelTowerMerge,
  BoardState,
  CardRef,
  CellKey,
  GameState,
  ImposterMaskState,
  PermanentItem,
  Permanents,
  Phase,
  PlayerKey,
  SpecialSiteState,
  Thresholds,
  Zones,
} from "../types";

const THRESHOLD_KEYS: (keyof Thresholds)[] = ["air", "water", "earth", "fire"];
const TEMPLAR_DISCOUNT_NAME_TOKENS = new Set([
  "knight",
  "knights",
  "sir",
  "sirs",
  "dame",
  "dames",
]);

export const phases: Phase[] = ["Setup", "Start", "Draw", "Main", "End"];

export const getCardManaCost = (
  card: CardRef,
  metaByCardId: Record<
    number,
    { attack: number | null; defence: number | null; cost: number | null }
  >,
): number => {
  if (typeof card.cost === "number") return card.cost;
  const meta = metaByCardId[card.cardId];
  if (meta && typeof meta.cost === "number") return meta.cost;
  return 0;
};

export const getEffectiveAvatarName = (
  state: Pick<GameState, "avatars" | "imposterMasks">,
  who: PlayerKey,
) =>
  state.imposterMasks[who]?.maskAvatar?.name ?? state.avatars[who]?.card?.name;

const getNormalizedNameTokens = (name: string | null | undefined): string[] =>
  String(name ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

export const isTemplarDiscountCard = (card: CardRef): boolean => {
  const type = String(card.type || "").toLowerCase();
  if (!type.includes("minion") || type.includes("token")) return false;
  return getNormalizedNameTokens(card.name).some((token) =>
    TEMPLAR_DISCOUNT_NAME_TOKENS.has(token),
  );
};

export const getAvatarAdjustedManaCost = (input: {
  state: Pick<
    GameState,
    | "avatars"
    | "imposterMasks"
    | "harbingerPortalDiscountUsed"
    | "templarDiscountUsed"
    | "portalState"
  >;
  who: PlayerKey;
  card: CardRef;
  type: string;
  x: number;
  y: number;
  manaCost: number;
}): {
  manaCost: number;
  harbingerPortalDiscountApplied: boolean;
  templarDiscountApplied: boolean;
} => {
  const { state, who, card, type, x, y, manaCost } = input;
  let adjustedManaCost = manaCost;
  let harbingerPortalDiscountApplied = false;
  let templarDiscountApplied = false;

  if (
    !type.includes("minion") ||
    type.includes("token") ||
    adjustedManaCost <= 0
  ) {
    return {
      manaCost: adjustedManaCost,
      harbingerPortalDiscountApplied,
      templarDiscountApplied,
    };
  }

  const effectiveAvatarName = getEffectiveAvatarName(state, who);

  if (
    isHarbinger(effectiveAvatarName) &&
    !state.harbingerPortalDiscountUsed[who]
  ) {
    // A square can be a portal for both players at once, so check membership
    // rather than a single owner.
    if (portalOwnersAt(x, y, state.portalState).includes(who)) {
      adjustedManaCost = Math.max(0, adjustedManaCost - 1);
      harbingerPortalDiscountApplied = true;
    }
  }

  if (
    adjustedManaCost > 0 &&
    isTemplar(effectiveAvatarName) &&
    !state.templarDiscountUsed[who] &&
    isTemplarDiscountCard(card)
  ) {
    adjustedManaCost = Math.max(0, adjustedManaCost - 1);
    templarDiscountApplied = true;
  }

  return {
    manaCost: adjustedManaCost,
    harbingerPortalDiscountApplied,
    templarDiscountApplied,
  };
};

export const emptyThresholds = (): Thresholds => ({
  air: 0,
  water: 0,
  earth: 0,
  fire: 0,
});

export const playerKeyToOwner = (who: PlayerKey): 1 | 2 =>
  who === "p1" ? 1 : 2;

const opponentOf = (who: PlayerKey): PlayerKey => (who === "p1" ? "p2" : "p1");

// ---------------------------------------------------------------------------
// Resource context
//
// Everything mana/threshold computation depends on, in one object. Build it
// from the store with `resourceContextFromState`, or assemble it from
// subscribed slices in components. Both `computeThresholdTotals` and
// `computeAvailableMana` accept the same shape so callers cannot forget a
// dependency (which is how the HUD previously lost core mana).
// ---------------------------------------------------------------------------
export type ResourceContext = {
  board: BoardState;
  permanents: Permanents;
  who: PlayerKey;
  avatars?: Partial<Record<PlayerKey, AvatarState | null | undefined>> | null;
  imposterMasks?: Partial<Record<PlayerKey, ImposterMaskState | null>> | null;
  specialSiteState?: SpecialSiteState | null;
  babelTowers?: BabelTowerMerge[] | null;
  zones?: Partial<Record<PlayerKey, Zones>> | null;
  currentTurn?: number;
  etherCoresInVoidAtTurnStart?: string[] | null;
  coresCarriedAtTurnStart?: string[] | null;
};

export type ResourceStateSlice = Pick<
  GameState,
  | "board"
  | "permanents"
  | "avatars"
  | "imposterMasks"
  | "specialSiteState"
  | "babelTowers"
  | "zones"
  | "turn"
  | "etherCoresInVoidAtTurnStart"
  | "coresCarriedAtTurnStart"
>;

export const resourceContextFromState = (
  state: ResourceStateSlice,
  who: PlayerKey,
): ResourceContext => ({
  board: state.board,
  permanents: state.permanents,
  who,
  avatars: state.avatars,
  imposterMasks: state.imposterMasks,
  specialSiteState: state.specialSiteState,
  babelTowers: state.babelTowers,
  zones: state.zones,
  currentTurn: state.turn,
  etherCoresInVoidAtTurnStart: state.etherCoresInVoidAtTurnStart,
  coresCarriedAtTurnStart: state.coresCarriedAtTurnStart,
});

const effectiveAvatarNameFromContext = (
  ctx: ResourceContext,
  who: PlayerKey,
): string | null | undefined =>
  ctx.imposterMasks?.[who]?.maskAvatar?.name ?? ctx.avatars?.[who]?.card?.name;

const accumulateThresholds = (
  acc: Thresholds,
  amount: Partial<Thresholds> | null | undefined,
  multiplier = 1,
) => {
  if (!amount || typeof amount !== "object") return;
  for (const key of THRESHOLD_KEYS) {
    const value = Number((amount as Record<string, unknown>)[key] ?? 0);
    if (Number.isFinite(value) && value !== 0) {
      acc[key] += value * multiplier;
    }
  }
};

const permanentName = (p: PermanentItem | null | undefined): string =>
  String(p?.card?.name || "").toLowerCase();

const permanentsAt = (
  permanents: Permanents,
  cellKey: string,
): PermanentItem[] => {
  const arr = permanents?.[cellKey];
  return Array.isArray(arr) ? arr : [];
};

const cellHasPermanentNamed = (
  permanents: Permanents,
  cellKey: string,
  name: string,
): boolean => permanentsAt(permanents, cellKey).some((p) => permanentName(p) === name);

// Check if a site is adjacent to the void
const isSiteAdjacentToVoid = (cellKey: string, board: BoardState): boolean => {
  const adjacent = getAdjacentCells(cellKey, board.size.w, board.size.h);
  for (const adjKey of adjacent) {
    if (!board.sites[adjKey]) return true; // No site = void
  }
  return false;
};

// Check if site is completely empty (no permanents)
const isSiteEmpty = (cellKey: string, permanents: Permanents): boolean =>
  permanentsAt(permanents, cellKey).length === 0;

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
    for (const perm of permanentsAt(permanents, checkKey)) {
      if (perm.owner !== owner) continue;

      const subTypes = String(perm.card?.subTypes || "").toLowerCase();
      const name = permanentName(perm);

      if (subTypes.includes("angel")) return true;
      if (name.includes("ward") || subTypes.includes("ward")) return true;
    }

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
  const condition = CONDITIONAL_MANA_SITES[siteName.toLowerCase()];
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
): boolean => cellHasPermanentNamed(permanents, auraPermanentAt, "silenced");

// Check if a site is flooded by Atlantean Fate
// A silenced Atlantean Fate aura does NOT flood sites.
//
// The aura's `floodedSites` list is captured once at cast time and is never
// pruned when the underlying site leaves the tile. So we must re-validate that
// the cell STILL holds a flood-eligible site (non-Ordinary and mana-providing)
// before honoring it. Atlantean Fate only affects non-Ordinary sites, and a
// destroyed site is replaced by Rubble (Ordinary, "provides no mana") which is
// neutral/uncontrolled and must never be treated as flooded.
const isSiteFloodedByAtlanteanFate = (
  cellKey: string,
  siteCard: CardRef | null | undefined,
  specialSiteState?: SpecialSiteState | null,
  permanents?: Permanents,
): boolean => {
  if (!specialSiteState?.atlanteanFateAuras) return false;
  if (!siteCard) return false;
  if (!siteProvidesMana(siteCard)) return false;
  if (
    isOrdinarySite(siteCard.name, (siteCard as { rarity?: string }).rarity)
  ) {
    return false;
  }
  for (const aura of specialSiteState.atlanteanFateAuras) {
    if (aura.floodedSites.includes(cellKey)) {
      if (permanents && auraHasSilencedToken(aura.permanentAt, permanents)) {
        continue; // Silenced aura: no effect
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
): boolean => cellHasPermanentNamed(permanents, cellKey, "flooded");

export const siteHasFloodedAbility = (
  cellKey: string,
  permanents: Permanents,
  specialSiteState?: SpecialSiteState | null,
): boolean => {
  if (siteHasDisabledToken(cellKey, permanents)) return false;
  if (siteHasSilencedToken(cellKey, permanents)) return false;
  if (siteHasFloodedToken(cellKey, permanents)) return true;
  if (affectedByAura(permanents,cellKey,"Flood")) return true;
  return !!specialSiteState?.realmFlooded;
};

// Check if a site has a Silenced token on it
// NOTE: Silenced sites lose their textbox ability but STILL provide mana and threshold
export const siteHasSilencedToken = (
  cellKey: string,
  permanents: Permanents,
): boolean => cellHasPermanentNamed(permanents, cellKey, "silenced");

// Check if a site has a Disabled token on it
// NOTE: Disabled sites lose their textbox ability AND provide neither mana nor threshold
export const siteHasDisabledToken = (
  cellKey: string,
  permanents: Permanents,
): boolean => cellHasPermanentNamed(permanents, cellKey, "disabled");

// Aura modifiers affecting the site at this cell (Abundance, Drought, Sow the Earth).
// An aura affects the site it sits on, regardless of who controls the aura.
const getAuraSiteModifiers = (
  cellKey: string,
  permanents: Permanents,
): { extraMana: number; noWaterThreshold: boolean; multiplier: number } => {
  let extraMana = 0;
  let noWaterThreshold = false;
  let multiplier = 1;
  for (const perm of permanentsAt(permanents, cellKey)) {
    const mod = AURA_SITE_MODIFIERS[permanentName(perm)];
    if (!mod) continue;
    if (mod.extraMana) extraMana += mod.extraMana;
    if (mod.noWaterThreshold) noWaterThreshold = true;
    if (mod.multiplier && mod.multiplier > multiplier) {
      multiplier = mod.multiplier;
    }
  }
  return { extraMana, noWaterThreshold, multiplier };
};

// Unattached artifacts on this cell that enhance the site (Shrine of the Dragonlord).
const getSiteEnhancerBonus = (
  cellKey: string,
  permanents: Permanents,
): { mana: number; thresholds: Thresholds } => {
  const bonus = { mana: 0, thresholds: emptyThresholds() };
  for (const perm of permanentsAt(permanents, cellKey)) {
    const enhancer = SITE_ENHANCER_ARTIFACTS[permanentName(perm)];
    if (!enhancer) continue;
    bonus.mana += enhancer.mana;
    accumulateThresholds(bonus.thresholds, enhancer.thresholds);
  }
  return bonus;
};

// "Granary Rats" standing on a site: that site doesn't provide threshold.
const siteHasNoThresholdOccupant = (
  cellKey: string,
  permanents: Permanents,
): boolean =>
  permanentsAt(permanents, cellKey).some((p) =>
    SITE_NO_THRESHOLD_OCCUPANTS.has(permanentName(p)),
  );

// "Sinterfee": a Silenced site adjacent to a Sinterfee provides no threshold.
const siteSilencedByAdjacentSilencer = (
  cellKey: string,
  board: BoardState,
  permanents: Permanents,
): boolean => {
  if (!siteHasSilencedToken(cellKey, permanents)) return false;
  const adjacent = getAdjacentCells(cellKey, board.size.w, board.size.h);
  return adjacent.some((adj) =>
    permanentsAt(permanents, adj).some((p) =>
      ADJACENT_SILENCER_NO_THRESHOLD.has(permanentName(p)),
    ),
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
export const isInBackRow = (
  cellKey: string,
  owner: 1 | 2,
  boardHeight: number,
): boolean => {
  const { y } = parseCellKey(cellKey);
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
  if (!name || !BACK_ROW_ONLY_SITES.has(name)) return true;
  return isInBackRow(cellKey, owner, boardHeight);
};

// Count unique minions in a zone by rarity
// Trophy Room only counts Unique MINIONS, not Unique spells or other card types
const countUniqueMinionsInZone = (zone: CardRef[]): number => {
  let count = 0;
  for (const card of zone) {
    const type = String(card.type || "").toLowerCase();
    if (!type.includes("minion")) continue;
    const rarity = String(card.rarity || "").toLowerCase();
    if (rarity !== "unique") continue;
    count += 1;
  }
  return count;
};

// Shared per-site gate used by both mana and threshold computation.
// Returns null when the site provides nothing at all to `owner`, otherwise
// describes the flood / aura state the caller must honour.
type SiteEvaluation = {
  siteName: string;
  tileOwner: 1 | 2;
  floodedByAtlanteanFate: boolean;
  modifiers: ReturnType<typeof getAuraSiteModifiers>;
};

const evaluateSiteForOwner = (
  ctx: ResourceContext,
  cellKey: string,
  tile: BoardState["sites"][string],
  owner: 1 | 2,
): SiteEvaluation | null => {
  if (!tile) return null;
  const siteName = String(tile.card?.name || "").toLowerCase();
  // Rubble is a neutral, uncontrolled site: it provides nothing to anyone.
  if (siteName === "rubble") return null;

  const isShared = SHARED_MANA_SITES.has(siteName);
  if (!isShared && tile.owner !== owner) return null;

  // Disabled sites provide neither mana nor threshold.
  // (Silenced sites still provide both; they only lose textbox abilities.)
  if (siteHasDisabledToken(cellKey, ctx.permanents)) return null;

  const modifiers = getAuraSiteModifiers(cellKey, ctx.permanents);
  const floodedByAtlanteanFate = isSiteFloodedByAtlanteanFate(
    cellKey,
    tile.card,
    ctx.specialSiteState,
    ctx.permanents,
  );

  // An Atlantean-flooded site "loses all other abilities", so its back-row and
  // conditional restrictions no longer apply.
  if (!floodedByAtlanteanFate) {
    const boardHeight = ctx.board?.size?.h ?? 4;
    if (
      !backRowSiteProvidesMana(
        tile.card ?? null,
        cellKey,
        tile.owner ?? owner,
        boardHeight,
      )
    ) {
      return null;
    }
    if (
      !conditionalSiteProvides(siteName, cellKey, ctx.board, ctx.permanents)
    ) {
      return null;
    }
  }

  return {
    siteName,
    tileOwner: tile.owner ?? owner,
    floodedByAtlanteanFate,
    modifiers,
  };
};

export const computeThresholdTotals = (ctx: ResourceContext): Thresholds => {
  const { board, permanents, who, specialSiteState, babelTowers } = ctx;
  const owner = playerKeyToOwner(who);
  const totals = emptyThresholds();

  // Elementalist avatar grants +1 to each threshold (also while worn as an
  // Imposter mask, since the mask grants the avatar's abilities).
  if (isElementalist(effectiveAvatarNameFromContext(ctx, who))) {
    totals.air += 1;
    totals.water += 1;
    totals.earth += 1;
    totals.fire += 1;
  }

  for (const [cellKey, tile] of Object.entries(board?.sites ?? {})) {
    const site = evaluateSiteForOwner(ctx, cellKey, tile, owner);
    if (!site) continue;
    const { siteName, tileOwner, floodedByAtlanteanFate, modifiers } = site;

    // Occupants / neighbours that strip threshold from this site.
    if (siteHasNoThresholdOccupant(cellKey, permanents)) continue;
    if (siteSilencedByAdjacentSilencer(cellKey, board, permanents)) continue;

    const siteThresholds = emptyThresholds();

    if (floodedByAtlanteanFate) {
      // Flooded sites are water sites and only provide Water threshold.
      siteThresholds.water += 1;
    } else if (ELEMENT_CHOICE_SITES.has(siteName)) {
      // Valley of Delight: provides the chosen element, nothing before a choice.
      const choice = specialSiteState?.valleyChoices.find(
        (c) => c.cellKey === cellKey,
      );
      if (choice) siteThresholds[choice.element] += 1;
    } else if (CONDITIONAL_THRESHOLD_SITES[siteName]) {
      // The Empyrean: (A)(E)(F)(W) if you control a nearby Angel or Ward.
      if (hasNearbyAngelOrWard(cellKey, board, permanents, tileOwner)) {
        accumulateThresholds(
          siteThresholds,
          CONDITIONAL_THRESHOLD_SITES[siteName].thresholds,
        );
      }
    } else if (MULTI_THRESHOLD_SITES[siteName]) {
      accumulateThresholds(siteThresholds, MULTI_THRESHOLD_SITES[siteName]);
    } else if (isBaseOfBabel(siteName)) {
      // Base provides earth; a built Tower (Apex atop) also provides air.
      siteThresholds.earth += 1;
      if (babelTowers?.some((t) => t.cellKey === (cellKey as CellKey))) {
        siteThresholds.air += 1;
      }
    } else if (siteName.includes("apex of babel")) {
      siteThresholds.air += 1;
    } else {
      accumulateThresholds(siteThresholds, tile?.card?.thresholds ?? null);
    }

    // Flooded ability (Flooded token / Realm flood): land sites become water
    // sites. A site that already provides water is unchanged.
    if (
      !floodedByAtlanteanFate &&
      siteName !== "bedrock" &&
      siteHasFloodedAbility(cellKey, permanents, specialSiteState) &&
      siteThresholds.water <= 0
    ) {
      siteThresholds.water += 1;
    }

    // Drought: affected sites provide no water threshold.
    if (modifiers.noWaterThreshold) siteThresholds.water = 0;

    // Shrine of the Dragonlord on this site: additional (E)(F)(W)(A).
    accumulateThresholds(
      siteThresholds,
      getSiteEnhancerBonus(cellKey, permanents).thresholds,
    );

    // Sow the Earth: this site provides double threshold.
    accumulateThresholds(totals, siteThresholds, modifiers.multiplier);
  }

  // Add bloom bonuses (temporary threshold from Genesis / Annual Fair this turn)
  if (specialSiteState?.bloomBonuses) {
    for (const bonus of specialSiteState.bloomBonuses) {
      if (bonus.owner === owner) {
        accumulateThresholds(totals, bonus.thresholds);
      }
    }
  }

  // Add threshold from permanents (cores while carried, Arthurian families, ...)
  for (const arr of Object.values(permanents ?? {})) {
    const list = Array.isArray(arr) ? arr : [];
    for (const p of list) {
      if (!p || p.owner !== owner) continue;
      const grant = THRESHOLD_GRANT_BY_NAME[permanentName(p)];
      if (!grant) continue;
      const cardType = String(p.card?.type || "").toLowerCase();
      // Artifacts (cores) only provide threshold while carried (attached).
      if (cardType.includes("artifact") && !p.attachedTo) continue;
      accumulateThresholds(totals, grant);
    }
  }

  return totals;
};

// Per-seat memo: thresholds only change when one of these slices changes
// identity, so callers that poll (HUD, context menu) get a stable object back.
type ThresholdCacheEntry = {
  board: BoardState;
  permanents: Permanents;
  avatars: GameState["avatars"];
  imposterMasks: GameState["imposterMasks"];
  specialSiteState: SpecialSiteState;
  babelTowers: BabelTowerMerge[];
  result: Thresholds;
};
const thresholdCache: Partial<Record<PlayerKey, ThresholdCacheEntry>> = {};

export const getCachedThresholdTotals = (
  state: ResourceStateSlice,
  who: PlayerKey,
): Thresholds => {
  const hit = thresholdCache[who];
  if (
    hit &&
    hit.board === state.board &&
    hit.permanents === state.permanents &&
    hit.avatars === state.avatars &&
    hit.imposterMasks === state.imposterMasks &&
    hit.specialSiteState === state.specialSiteState &&
    hit.babelTowers === state.babelTowers
  ) {
    return hit.result;
  }
  const result = computeThresholdTotals(resourceContextFromState(state, who));
  thresholdCache[who] = {
    board: state.board,
    permanents: state.permanents,
    avatars: state.avatars,
    imposterMasks: state.imposterMasks,
    specialSiteState: state.specialSiteState,
    babelTowers: state.babelTowers,
    result,
  };
  return result;
};

const avatarCellKey = (
  avatar: AvatarState | null | undefined,
): CellKey | null => {
  if (!avatar?.pos) return null;
  const [x, y] = avatar.pos;
  return toCellKey(x, y);
};

export const computeAvailableMana = (ctx: ResourceContext): number => {
  const {
    board,
    permanents,
    who,
    zones,
    specialSiteState,
    currentTurn,
    etherCoresInVoidAtTurnStart,
    babelTowers,
    coresCarriedAtTurnStart,
  } = ctx;
  const owner = playerKeyToOwner(who);
  const opponent = opponentOf(who);
  let mana = 0;

  let ownThresholds: Thresholds | null = null;
  const getOwnThresholds = () => {
    if (!ownThresholds) ownThresholds = computeThresholdTotals(ctx);
    return ownThresholds;
  };
  let opponentThresholds: Thresholds | null = null;
  const getOpponentThresholds = () => {
    if (!opponentThresholds) {
      opponentThresholds = computeThresholdTotals({ ...ctx, who: opponent });
    }
    return opponentThresholds;
  };

  for (const [cellKey, tile] of Object.entries(board?.sites ?? {})) {
    if (!tile || tile.cpuNeutral) continue;
    const rawName = String(tile.card?.name || "").toLowerCase();

    // Opponent's City of Plenty: when its owner has the water threshold it
    // "also provides (1) for your opponent" (that is, for us).
    const opponentSiteConfig = OPPONENT_MANA_SITES[rawName];
    if (opponentSiteConfig && tile.owner !== owner) {
      const oppSite = evaluateSiteForOwner(ctx, cellKey, tile, tile.owner);
      if (oppSite && !oppSite.floodedByAtlanteanFate) {
        const oppHas =
          (getOpponentThresholds()[opponentSiteConfig.requiredElement] || 0) >=
          1;
        if (oppHas) mana += opponentSiteConfig.opponentMana;
      }
      continue;
    }

    const site = evaluateSiteForOwner(ctx, cellKey, tile, owner);
    if (!site) continue;
    if (!siteProvidesMana(tile.card ?? null)) continue;
    const { siteName, tileOwner, floodedByAtlanteanFate, modifiers } = site;

    let base = 0;
    if (floodedByAtlanteanFate) {
      // Flooded: a plain water site that lost all other abilities.
      base = 1;
    } else if (ELEMENT_CHOICE_SITES.has(siteName)) {
      // Valley of Delight provides 1 mana only after a choice is made
      const choice = specialSiteState?.valleyChoices.find(
        (c) => c.cellKey === cellKey,
      );
      base = choice ? 1 : 0;
    } else if (CITY_BONUS_SITES[siteName]) {
      const cityConfig = CITY_BONUS_SITES[siteName];
      const hasThreshold =
        (getOwnThresholds()[cityConfig.requiredElement] || 0) >= 1;
      base = hasThreshold ? 1 + cityConfig.extraMana : 1;
    } else if (CEMETERY_MANA_SITES[siteName]) {
      // Myrrh's Trophy Room - extra mana per Unique minion in opponent's cemetery
      const oppGraveyard = zones?.[opponent]?.graveyard || [];
      const uniqueCount = countUniqueMinionsInZone(oppGraveyard);
      base = 1 + uniqueCount * CEMETERY_MANA_SITES[siteName].perUnique;
    } else if (CONDITIONAL_THRESHOLD_SITES[siteName]) {
      // The Empyrean - provides mana only if condition met
      base = hasNearbyAngelOrWard(cellKey, board, permanents, tileOwner)
        ? 1
        : 0;
    } else if (siteName in GENESIS_MANA_SITES) {
      // Ghost Town: base 0, the Genesis bonus is added below
      base = 0;
    } else if (
      isTowerOfBabel(siteName) ||
      (isBaseOfBabel(siteName) &&
        babelTowers?.some((t) => t.cellKey === (cellKey as CellKey)))
    ) {
      // A built Tower of Babel provides 2 (Base + Apex)
      base = 2;
    } else {
      base = 1;
    }

    if (base <= 0) continue;

    // Shrine of the Dragonlord on this site: additional (1).
    base += getSiteEnhancerBonus(cellKey, permanents).mana;
    // Abundance: each affected site provides one additional mana.
    base += modifiers.extraMana;
    // Sow the Earth: this site provides double mana.
    mana += base * modifiers.multiplier;
  }

  // Add genesis mana bonuses (temporary mana this turn: Ghost Town, Towers,
  // Beacon, Temple of Moloch)
  if (specialSiteState?.genesisMana) {
    for (const bonus of specialSiteState.genesisMana) {
      if (bonus.owner === owner) {
        mana += bonus.manaAmount;
      }
    }
  }

  // Add mana from permanents
  const enemyAvatarCell = avatarCellKey(ctx.avatars?.[opponent]);
  for (const [cellKey, arr] of Object.entries(permanents ?? {})) {
    const list = Array.isArray(arr) ? arr : [];
    const isVoidCell = !board?.sites?.[cellKey];
    for (const p of list) {
      if (!p || p.owner !== owner) continue;
      const nm = permanentName(p);
      const cardType = String(p.card?.type || "").toLowerCase();
      const isArtifact = cardType.includes("artifact");
      const instanceId = p.instanceId ?? null;
      const enteredThisTurn =
        currentTurn !== undefined &&
        p.enteredOnTurn !== undefined &&
        p.enteredOnTurn === currentTurn;

      // Void mana providers (Ether Core): only if cast this turn while in the
      // void, or if it started the turn in the void.
      if (isVoidCell && VOID_MANA_PROVIDERS[nm]) {
        const startedInVoid =
          instanceId !== null &&
          !!etherCoresInVoidAtTurnStart?.includes(instanceId);
        if (enteredThisTurn || startedInVoid) {
          mana += VOID_MANA_PROVIDERS[nm];
        }
        continue;
      }

      // Finwife: provides (2) for each nearby enemy Avatar.
      const perEnemyAvatar = PER_NEARBY_ENEMY_AVATAR_PROVIDERS[nm];
      if (perEnemyAvatar) {
        if (
          enemyAvatarCell &&
          getNearbyCells(cellKey, board.size.w, board.size.h).includes(
            enemyAvatarCell,
          )
        ) {
          mana += perEnemyAvatar;
        }
        continue;
      }

      if (!MANA_PROVIDER_BY_NAME.has(nm)) continue;

      // Artifacts (cores, Key to the City) only provide while carried.
      if (isArtifact && !p.attachedTo) continue;
      // Cores additionally need to have been summoned this turn or carried
      // at turn start.
      if (isArtifact && nm.includes("core")) {
        const wasCarriedAtStart =
          instanceId !== null &&
          !!coresCarriedAtTurnStart?.includes(instanceId);
        if (!enteredThisTurn && !wasCarriedAtStart) continue;
      }
      mana += 1;
    }
  }

  return mana;
};
