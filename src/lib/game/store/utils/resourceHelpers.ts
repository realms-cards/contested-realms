import { isElementalist } from "@/lib/game/avatarAbilities";
import {
  BACK_ROW_ONLY_SITES,
  MANA_PROVIDER_BY_NAME,
  NON_MANA_SITE_IDENTIFIERS,
  THRESHOLD_GRANT_BY_NAME,
  VOID_MANA_PROVIDERS,
} from "@/lib/game/mana-providers";
import { parseCellKey } from "./boardHelpers";
import type {
  AvatarState,
  BoardState,
  CardRef,
  GameState,
  Permanents,
  Phase,
  PlayerKey,
  Thresholds,
} from "../types";

const THRESHOLD_KEYS: (keyof Thresholds)[] = ["air", "water", "earth", "fire"];

export const phases: Phase[] = ["Setup", "Start", "Draw", "Main", "End"];

export const emptyThresholds = (): Thresholds => ({
  air: 0,
  water: 0,
  earth: 0,
  fire: 0,
});

const thresholdCache: Record<
  PlayerKey,
  {
    sitesRef: BoardState["sites"] | null;
    permanentsRef: Permanents | null;
    avatarRef: AvatarState | null;
    totals: Thresholds;
  }
> = {
  p1: {
    sitesRef: null,
    permanentsRef: null,
    avatarRef: null,
    totals: emptyThresholds(),
  },
  p2: {
    sitesRef: null,
    permanentsRef: null,
    avatarRef: null,
    totals: emptyThresholds(),
  },
};

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

export const computeThresholdTotals = (
  board: BoardState,
  permanents: Permanents,
  who: PlayerKey,
  avatar?: AvatarState | null
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
    if (!tile || tile.owner !== owner) continue;
    // Check back-row-only sites - they only provide threshold in back row
    if (
      !backRowSiteProvidesMana(tile.card ?? null, cellKey, owner, boardHeight)
    )
      continue;
    accumulateThresholds(totals, tile.card?.thresholds ?? null);
  }

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
  const cache = thresholdCache[who];
  const sitesRef = state.board.sites;
  const permanentsRef = state.permanents;
  const avatarRef = state.avatars[who];

  if (
    cache.sitesRef === sitesRef &&
    cache.permanentsRef === permanentsRef &&
    cache.avatarRef === avatarRef
  ) {
    return cache.totals;
  }

  const totals = computeThresholdTotals(
    state.board,
    state.permanents,
    who,
    avatarRef
  );
  cache.sitesRef = sitesRef;
  cache.permanentsRef = permanentsRef;
  cache.avatarRef = avatarRef;
  cache.totals = totals;
  return totals;
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

export const computeAvailableMana = (
  board: BoardState,
  permanents: Permanents,
  who: PlayerKey
): number => {
  const owner = playerKeyToOwner(who);
  const boardHeight = board?.size?.h ?? 4;
  let mana = 0;

  for (const [cellKey, tile] of Object.entries(board?.sites ?? {})) {
    if (!tile || tile.owner !== owner) continue;
    if (tile.tapped) continue;
    if (!siteProvidesMana(tile.card ?? null)) continue;
    // Check back-row-only sites
    if (
      !backRowSiteProvidesMana(tile.card ?? null, cellKey, owner, boardHeight)
    )
      continue;
    mana += 1;
  }

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
