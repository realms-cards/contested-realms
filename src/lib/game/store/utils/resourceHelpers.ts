import {
  MANA_PROVIDER_BY_NAME,
  NON_MANA_SITE_IDENTIFIERS,
  THRESHOLD_GRANT_BY_NAME,
} from "@/lib/game/mana-providers";
import type {
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
    totals: Thresholds;
  }
> = {
  p1: { sitesRef: null, permanentsRef: null, totals: emptyThresholds() },
  p2: { sitesRef: null, permanentsRef: null, totals: emptyThresholds() },
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
  who: PlayerKey
): Thresholds => {
  const owner = playerKeyToOwner(who);
  const totals = emptyThresholds();

  for (const tile of Object.values(board?.sites ?? {})) {
    if (!tile || tile.owner !== owner) continue;
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

  if (cache.sitesRef === sitesRef && cache.permanentsRef === permanentsRef) {
    return cache.totals;
  }

  const totals = computeThresholdTotals(state.board, state.permanents, who);
  cache.sitesRef = sitesRef;
  cache.permanentsRef = permanentsRef;
  cache.totals = totals;
  return totals;
};

export const siteProvidesMana = (
  card: CardRef | null | undefined
): boolean => {
  if (!card) return false;
  const slug = typeof card.slug === "string" ? card.slug.toLowerCase() : null;
  if (slug && NON_MANA_SITE_IDENTIFIERS.has(slug)) return false;
  const name = typeof card.name === "string" ? card.name.toLowerCase() : null;
  if (name && NON_MANA_SITE_IDENTIFIERS.has(name)) return false;
  return true;
};

export const computeAvailableMana = (
  board: BoardState,
  permanents: Permanents,
  who: PlayerKey
): number => {
  const owner = playerKeyToOwner(who);
  let mana = 0;

  for (const tile of Object.values(board?.sites ?? {})) {
    if (!tile || tile.owner !== owner) continue;
    if (tile.tapped) continue;
    if (!siteProvidesMana(tile.card ?? null)) continue;
    mana += 1;
  }

  for (const arr of Object.values(permanents ?? {})) {
    const list = Array.isArray(arr) ? arr : [];
    for (const p of list) {
      try {
        if (!p || p.owner !== owner) continue;
        const nm = String(p.card?.name || "").toLowerCase();
        if (MANA_PROVIDER_BY_NAME.has(nm)) mana += 1;
      } catch {}
    }
  }

  return mana;
};
