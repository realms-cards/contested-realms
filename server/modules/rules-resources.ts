"use strict";

// Server-side mirror of src/lib/game/store/utils/resourceHelpers.ts.
//
// The server cannot import from src/, so the mana / threshold rules are
// re-implemented here over the raw game record. Both sides read the same
// data/mana-providers.json, and the logic below follows the client function
// for function. When you change one, change the other.

import * as fs from "fs";
import * as path from "path";
import type { AnyRecord } from "../types";

export type SeatKey = "p1" | "p2";
export type ThresholdKey = "air" | "water" | "earth" | "fire";
export type Thresholds = Record<ThresholdKey, number>;
type PartialThresholds = Partial<Thresholds>;

type ProviderData = {
  manaProviders: string[];
  perNearbyEnemyAvatarProviders: Record<string, number>;
  siteEnhancerArtifacts: Record<
    string,
    { mana: number; thresholds: PartialThresholds }
  >;
  auraSiteModifiers: Record<
    string,
    { extraMana?: number; noWaterThreshold?: boolean; multiplier?: number }
  >;
  siteNoThresholdOccupants: string[];
  adjacentSilencerNoThreshold: string[];
  opponentManaSites: Record<
    string,
    { requiredElement: ThresholdKey; opponentMana: number }
  >;
  elementChoiceSites: string[];
  sharedManaSites: string[];
  cityBonusSites: Record<
    string,
    { requiredElement: ThresholdKey; extraMana: number }
  >;
  genesisManaSites: Record<string, number>;
  conditionalThresholdSites: Record<
    string,
    { condition: string; thresholds: PartialThresholds }
  >;
  cemeteryManaSites: Record<string, { perUnique: number }>;
  thresholdGrants: Record<string, PartialThresholds>;
  nonManaSites: string[];
  backRowOnlySites: string[];
  multiThresholdSites: Record<string, PartialThresholds>;
  conditionalManaSites: Record<
    string,
    { condition: "empty" | "adjacent_to_void" }
  >;
  voidManaProviders: Record<string, number>;
  ordinarySiteNames: string[];
};

const THRESHOLD_KEYS: ReadonlyArray<ThresholdKey> = [
  "air",
  "water",
  "earth",
  "fire",
];

let PROVIDER_DATA: ProviderData | null = null;

export function loadProviderData(): ProviderData {
  if (PROVIDER_DATA) return PROVIDER_DATA;
  const candidates = [
    path.join(__dirname, "..", "..", "data", "mana-providers.json"),
    path.join(__dirname, "..", "..", "..", "data", "mana-providers.json"),
    path.join(process.cwd(), "data", "mana-providers.json"),
  ];
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(
        fs.readFileSync(candidate, "utf-8"),
      ) as ProviderData;
      PROVIDER_DATA = parsed;
      return parsed;
    } catch {
      // try next candidate
    }
  }
  throw new Error("[rules-resources] data/mana-providers.json not found");
}

const data = () => loadProviderData();

const emptyThresholds = (): Thresholds => ({
  air: 0,
  water: 0,
  earth: 0,
  fire: 0,
});

const lower = (v: unknown): string => String(v ?? "").toLowerCase();

const seatToOwner = (seat: SeatKey): 1 | 2 => (seat === "p1" ? 1 : 2);
const otherSeat = (seat: SeatKey): SeatKey => (seat === "p1" ? "p2" : "p1");

const accumulate = (
  acc: Thresholds,
  amount: PartialThresholds | null | undefined,
  multiplier = 1,
) => {
  if (!amount || typeof amount !== "object") return;
  for (const key of THRESHOLD_KEYS) {
    const value = Number((amount as Record<string, unknown>)[key] ?? 0);
    if (Number.isFinite(value) && value !== 0) acc[key] += value * multiplier;
  }
};

function parseCellKey(key: string): { x: number; y: number } {
  const [xs, ys] = String(key).split(",");
  return { x: Number(xs), y: Number(ys) };
}

const toCellKey = (x: number, y: number) => `${x},${y}`;

function boardOf(game: AnyRecord): {
  sites: Record<string, AnyRecord | null | undefined>;
  w: number;
  h: number;
} {
  const board = (game.board || {}) as AnyRecord;
  const size = (board.size || {}) as AnyRecord;
  const w = Number(size.w);
  const h = Number(size.h);
  return {
    sites: (board.sites || {}) as Record<string, AnyRecord | null | undefined>,
    w: Number.isFinite(w) && w > 0 ? w : 5,
    h: Number.isFinite(h) && h > 0 ? h : 4,
  };
}

function permanentsOf(game: AnyRecord): Record<string, AnyRecord[]> {
  const per = (game.permanents || {}) as Record<string, unknown>;
  const out: Record<string, AnyRecord[]> = {};
  for (const key of Object.keys(per)) {
    out[key] = Array.isArray(per[key]) ? (per[key] as AnyRecord[]) : [];
  }
  return out;
}

const permanentsAt = (
  permanents: Record<string, AnyRecord[]>,
  cellKey: string,
): AnyRecord[] => permanents[cellKey] || [];

const permanentName = (p: AnyRecord | null | undefined): string =>
  lower(((p?.card || {}) as AnyRecord).name);

const cellHasPermanentNamed = (
  permanents: Record<string, AnyRecord[]>,
  cellKey: string,
  name: string,
): boolean => permanentsAt(permanents, cellKey).some((p) => permanentName(p) === name);

function getAdjacentCells(cellKey: string, w: number, h: number): string[] {
  const { x, y } = parseCellKey(cellKey);
  const out: string[] = [];
  if (y > 0) out.push(toCellKey(x, y - 1));
  if (y < h - 1) out.push(toCellKey(x, y + 1));
  if (x > 0) out.push(toCellKey(x - 1, y));
  if (x < w - 1) out.push(toCellKey(x + 1, y));
  return out;
}

function getNearbyCells(cellKey: string, w: number, h: number): string[] {
  const { x, y } = parseCellKey(cellKey);
  const out: string[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) out.push(toCellKey(nx, ny));
    }
  }
  return out;
}

// --- Ordinary site detection (mirrors atlanteanFateState.isOrdinarySite) ---
const ORDINARY_RARITIES = new Set(["ordinary"]);
const NON_ORDINARY_RARITIES = new Set(["exceptional", "elite", "unique"]);

function isOrdinarySite(
  siteName: string | null | undefined,
  siteRarity: string | null | undefined,
): boolean {
  if (siteRarity) {
    const r = lower(siteRarity).trim();
    if (ORDINARY_RARITIES.has(r)) return true;
    if (NON_ORDINARY_RARITIES.has(r)) return false;
  }
  if (siteName) {
    return new Set(data().ordinarySiteNames).has(lower(siteName).trim());
  }
  return false;
}

export function siteProvidesMana(card: AnyRecord | null | undefined): boolean {
  if (!card) return false;
  const nonMana = new Set(data().nonManaSites);
  if (nonMana.has(lower(card.name))) return false;
  if (card.slug && nonMana.has(lower(card.slug))) return false;
  return true;
}

const isInBackRow = (cellKey: string, owner: 1 | 2, h: number): boolean => {
  const { y } = parseCellKey(cellKey);
  return owner === 1 ? y === h - 1 : y === 0;
};

function backRowSiteProvides(
  card: AnyRecord | null | undefined,
  cellKey: string,
  owner: 1 | 2,
  h: number,
): boolean {
  if (!card) return false;
  const name = lower(card.name);
  if (!new Set(data().backRowOnlySites).has(name)) return true;
  return isInBackRow(cellKey, owner, h);
}

function conditionalSiteProvides(
  siteName: string,
  cellKey: string,
  board: ReturnType<typeof boardOf>,
  permanents: Record<string, AnyRecord[]>,
): boolean {
  const cond = data().conditionalManaSites[siteName];
  if (!cond) return true;
  if (cond.condition === "empty") {
    return permanentsAt(permanents, cellKey).length === 0;
  }
  if (cond.condition === "adjacent_to_void") {
    return getAdjacentCells(cellKey, board.w, board.h).some(
      (k) => !board.sites[k],
    );
  }
  return true;
}

const siteHasDisabledToken = (
  cellKey: string,
  permanents: Record<string, AnyRecord[]>,
) => cellHasPermanentNamed(permanents, cellKey, "disabled");
const siteHasSilencedToken = (
  cellKey: string,
  permanents: Record<string, AnyRecord[]>,
) => cellHasPermanentNamed(permanents, cellKey, "silenced");
const siteHasFloodedToken = (
  cellKey: string,
  permanents: Record<string, AnyRecord[]>,
) => cellHasPermanentNamed(permanents, cellKey, "flooded");

function siteHasFloodedAbility(
  cellKey: string,
  permanents: Record<string, AnyRecord[]>,
  specialSiteState: AnyRecord | null,
): boolean {
  if (siteHasDisabledToken(cellKey, permanents)) return false;
  if (siteHasSilencedToken(cellKey, permanents)) return false;
  if (siteHasFloodedToken(cellKey, permanents)) return true;
  return !!specialSiteState?.realmFlooded;
}

function isSiteFloodedByAtlanteanFate(
  cellKey: string,
  siteCard: AnyRecord | null | undefined,
  specialSiteState: AnyRecord | null,
  permanents: Record<string, AnyRecord[]>,
): boolean {
  const auras = specialSiteState?.atlanteanFateAuras;
  if (!Array.isArray(auras) || !siteCard) return false;
  if (!siteProvidesMana(siteCard)) return false;
  if (isOrdinarySite(String(siteCard.name || ""), siteCard.rarity as string))
    return false;
  for (const aura of auras as AnyRecord[]) {
    const flooded = Array.isArray(aura.floodedSites)
      ? (aura.floodedSites as string[])
      : [];
    if (!flooded.includes(cellKey)) continue;
    if (
      typeof aura.permanentAt === "string" &&
      cellHasPermanentNamed(permanents, aura.permanentAt, "silenced")
    ) {
      continue;
    }
    return true;
  }
  return false;
}

function hasNearbyAngelOrWard(
  cellKey: string,
  board: ReturnType<typeof boardOf>,
  permanents: Record<string, AnyRecord[]>,
  owner: 1 | 2,
): boolean {
  const cells = [cellKey, ...getAdjacentCells(cellKey, board.w, board.h)];
  for (const k of cells) {
    for (const perm of permanentsAt(permanents, k)) {
      if (Number(perm.owner) !== owner) continue;
      const card = (perm.card || {}) as AnyRecord;
      const subTypes = lower(card.subTypes);
      const name = lower(card.name);
      if (subTypes.includes("angel")) return true;
      if (name.includes("ward") || subTypes.includes("ward")) return true;
    }
    const site = board.sites[k];
    if (site && Number(site.owner) === owner) {
      if (lower(((site.card || {}) as AnyRecord).name).includes("ward"))
        return true;
    }
  }
  return false;
}

function getAuraSiteModifiers(
  cellKey: string,
  permanents: Record<string, AnyRecord[]>,
) {
  let extraMana = 0;
  let noWaterThreshold = false;
  let multiplier = 1;
  for (const perm of permanentsAt(permanents, cellKey)) {
    const mod = data().auraSiteModifiers[permanentName(perm)];
    if (!mod) continue;
    if (mod.extraMana) extraMana += mod.extraMana;
    if (mod.noWaterThreshold) noWaterThreshold = true;
    if (mod.multiplier && mod.multiplier > multiplier) multiplier = mod.multiplier;
  }
  return { extraMana, noWaterThreshold, multiplier };
}

function getSiteEnhancerBonus(
  cellKey: string,
  permanents: Record<string, AnyRecord[]>,
): { mana: number; thresholds: Thresholds } {
  const bonus = { mana: 0, thresholds: emptyThresholds() };
  for (const perm of permanentsAt(permanents, cellKey)) {
    const enh = data().siteEnhancerArtifacts[permanentName(perm)];
    if (!enh) continue;
    bonus.mana += enh.mana;
    accumulate(bonus.thresholds, enh.thresholds);
  }
  return bonus;
}

type SiteEvaluation = {
  siteName: string;
  tileOwner: 1 | 2;
  floodedByAtlanteanFate: boolean;
  modifiers: ReturnType<typeof getAuraSiteModifiers>;
};

function evaluateSiteForOwner(
  game: AnyRecord,
  board: ReturnType<typeof boardOf>,
  permanents: Record<string, AnyRecord[]>,
  cellKey: string,
  tile: AnyRecord | null | undefined,
  owner: 1 | 2,
): SiteEvaluation | null {
  if (!tile) return null;
  const card = (tile.card || null) as AnyRecord | null;
  const siteName = lower(card?.name);
  if (siteName === "rubble") return null;
  const isShared = new Set(data().sharedManaSites).has(siteName);
  const tileOwner = (Number(tile.owner) === 2 ? 2 : 1) as 1 | 2;
  if (!isShared && tileOwner !== owner) return null;
  if (siteHasDisabledToken(cellKey, permanents)) return null;

  const specialSiteState = (game.specialSiteState || null) as AnyRecord | null;
  const modifiers = getAuraSiteModifiers(cellKey, permanents);
  const floodedByAtlanteanFate = isSiteFloodedByAtlanteanFate(
    cellKey,
    card,
    specialSiteState,
    permanents,
  );
  if (!floodedByAtlanteanFate) {
    if (!backRowSiteProvides(card, cellKey, tileOwner, board.h)) return null;
    if (!conditionalSiteProvides(siteName, cellKey, board, permanents))
      return null;
  }
  return { siteName, tileOwner, floodedByAtlanteanFate, modifiers };
}

function effectiveAvatarName(game: AnyRecord, seat: SeatKey): string {
  const masks = (game.imposterMasks || {}) as Record<string, AnyRecord | null>;
  const maskName = ((masks[seat]?.maskAvatar || {}) as AnyRecord).name;
  if (maskName) return lower(maskName);
  const avatars = (game.avatars || {}) as Record<string, AnyRecord | null>;
  return lower(((avatars[seat]?.card || {}) as AnyRecord).name);
}

function babelMergedAt(game: AnyRecord, cellKey: string): boolean {
  const towers = game.babelTowers;
  return (
    Array.isArray(towers) &&
    (towers as AnyRecord[]).some((t) => t.cellKey === cellKey)
  );
}

export function computeThresholdTotals(game: AnyRecord, seat: SeatKey): Thresholds {
  const d = data();
  const owner = seatToOwner(seat);
  const board = boardOf(game);
  const permanents = permanentsOf(game);
  const specialSiteState = (game.specialSiteState || null) as AnyRecord | null;
  const totals = emptyThresholds();

  if (effectiveAvatarName(game, seat).includes("elementalist")) {
    totals.air += 1;
    totals.water += 1;
    totals.earth += 1;
    totals.fire += 1;
  }

  const noThresholdOccupants = new Set(d.siteNoThresholdOccupants);
  const adjacentSilencers = new Set(d.adjacentSilencerNoThreshold);
  const elementChoice = new Set(d.elementChoiceSites);

  for (const cellKey of Object.keys(board.sites)) {
    const tile = board.sites[cellKey];
    const site = evaluateSiteForOwner(game, board, permanents, cellKey, tile, owner);
    if (!site || !tile) continue;
    const { siteName, tileOwner, floodedByAtlanteanFate, modifiers } = site;

    if (
      permanentsAt(permanents, cellKey).some((p) =>
        noThresholdOccupants.has(permanentName(p)),
      )
    )
      continue;
    if (
      siteHasSilencedToken(cellKey, permanents) &&
      getAdjacentCells(cellKey, board.w, board.h).some((adj) =>
        permanentsAt(permanents, adj).some((p) =>
          adjacentSilencers.has(permanentName(p)),
        ),
      )
    )
      continue;

    const siteThresholds = emptyThresholds();
    const card = (tile.card || {}) as AnyRecord;

    if (floodedByAtlanteanFate) {
      siteThresholds.water += 1;
    } else if (elementChoice.has(siteName)) {
      const choices = Array.isArray(specialSiteState?.valleyChoices)
        ? (specialSiteState?.valleyChoices as AnyRecord[])
        : [];
      const choice = choices.find((c) => c.cellKey === cellKey);
      const el = choice ? (lower(choice.element) as ThresholdKey) : null;
      if (el && THRESHOLD_KEYS.includes(el)) siteThresholds[el] += 1;
    } else if (d.conditionalThresholdSites[siteName]) {
      if (hasNearbyAngelOrWard(cellKey, board, permanents, tileOwner)) {
        accumulate(siteThresholds, d.conditionalThresholdSites[siteName].thresholds);
      }
    } else if (d.multiThresholdSites[siteName]) {
      accumulate(siteThresholds, d.multiThresholdSites[siteName]);
    } else if (siteName.includes("base of babel")) {
      siteThresholds.earth += 1;
      if (babelMergedAt(game, cellKey)) siteThresholds.air += 1;
    } else if (siteName.includes("apex of babel")) {
      siteThresholds.air += 1;
    } else {
      accumulate(siteThresholds, (card.thresholds || null) as PartialThresholds | null);
    }

    if (
      !floodedByAtlanteanFate &&
      siteHasFloodedAbility(cellKey, permanents, specialSiteState) &&
      siteThresholds.water <= 0
    ) {
      siteThresholds.water += 1;
    }
    if (modifiers.noWaterThreshold) siteThresholds.water = 0;
    accumulate(siteThresholds, getSiteEnhancerBonus(cellKey, permanents).thresholds);
    accumulate(totals, siteThresholds, modifiers.multiplier);
  }

  const bloom = specialSiteState?.bloomBonuses;
  if (Array.isArray(bloom)) {
    for (const bonus of bloom as AnyRecord[]) {
      if (Number(bonus.owner) === owner) {
        accumulate(totals, (bonus.thresholds || null) as PartialThresholds | null);
      }
    }
  }

  for (const cellKey of Object.keys(permanents)) {
    for (const p of permanents[cellKey]) {
      if (!p || Number(p.owner) !== owner) continue;
      const grant = d.thresholdGrants[permanentName(p)];
      if (!grant) continue;
      const cardType = lower(((p.card || {}) as AnyRecord).type);
      if (cardType.includes("artifact") && !p.attachedTo) continue;
      accumulate(totals, grant);
    }
  }

  return totals;
}

function countUniqueMinions(zone: unknown): number {
  if (!Array.isArray(zone)) return 0;
  let n = 0;
  for (const c of zone as AnyRecord[]) {
    if (!lower(c?.type).includes("minion")) continue;
    if (lower(c?.rarity) !== "unique") continue;
    n += 1;
  }
  return n;
}

function avatarCell(game: AnyRecord, seat: SeatKey): string | null {
  const avatars = (game.avatars || {}) as Record<string, AnyRecord | null>;
  const pos = avatars[seat]?.pos;
  if (!Array.isArray(pos) || pos.length < 2) return null;
  return toCellKey(Number(pos[0]), Number(pos[1]));
}

// Mana available from sites and permanents, BEFORE the players[seat].mana
// spend ledger is applied.
export function computeAvailableMana(game: AnyRecord, seat: SeatKey): number {
  const d = data();
  const owner = seatToOwner(seat);
  const opponent = otherSeat(seat);
  const board = boardOf(game);
  const permanents = permanentsOf(game);
  const specialSiteState = (game.specialSiteState || null) as AnyRecord | null;
  const currentTurn = Number(game.turn);
  const etherAtStart = Array.isArray(game.etherCoresInVoidAtTurnStart)
    ? (game.etherCoresInVoidAtTurnStart as string[])
    : [];
  const coresCarriedAtStart = Array.isArray(game.coresCarriedAtTurnStart)
    ? (game.coresCarriedAtTurnStart as string[])
    : [];
  const elementChoice = new Set(d.elementChoiceSites);
  const providers = new Set(d.manaProviders);
  let mana = 0;

  let own: Thresholds | null = null;
  const ownThresholds = () => (own ??= computeThresholdTotals(game, seat));
  let opp: Thresholds | null = null;
  const oppThresholds = () => (opp ??= computeThresholdTotals(game, opponent));

  for (const cellKey of Object.keys(board.sites)) {
    const tile = board.sites[cellKey];
    if (!tile) continue;
    const card = (tile.card || null) as AnyRecord | null;
    const rawName = lower(card?.name);
    const tileOwner = (Number(tile.owner) === 2 ? 2 : 1) as 1 | 2;

    const oppConfig = d.opponentManaSites[rawName];
    if (oppConfig && tileOwner !== owner) {
      const oppSite = evaluateSiteForOwner(game, board, permanents, cellKey, tile, tileOwner);
      if (oppSite && !oppSite.floodedByAtlanteanFate) {
        if ((oppThresholds()[oppConfig.requiredElement] || 0) >= 1) {
          mana += oppConfig.opponentMana;
        }
      }
      continue;
    }

    const site = evaluateSiteForOwner(game, board, permanents, cellKey, tile, owner);
    if (!site) continue;
    if (!siteProvidesMana(card)) continue;
    const { siteName, floodedByAtlanteanFate, modifiers } = site;

    let base = 0;
    if (floodedByAtlanteanFate) {
      base = 1;
    } else if (elementChoice.has(siteName)) {
      const choices = Array.isArray(specialSiteState?.valleyChoices)
        ? (specialSiteState?.valleyChoices as AnyRecord[])
        : [];
      base = choices.some((c) => c.cellKey === cellKey) ? 1 : 0;
    } else if (d.cityBonusSites[siteName]) {
      const cfg = d.cityBonusSites[siteName];
      base = (ownThresholds()[cfg.requiredElement] || 0) >= 1 ? 1 + cfg.extraMana : 1;
    } else if (d.cemeteryManaSites[siteName]) {
      const zones = (game.zones || {}) as Record<string, AnyRecord | undefined>;
      const graveyard = zones[opponent]?.graveyard;
      base = 1 + countUniqueMinions(graveyard) * d.cemeteryManaSites[siteName].perUnique;
    } else if (d.conditionalThresholdSites[siteName]) {
      base = hasNearbyAngelOrWard(cellKey, board, permanents, site.tileOwner) ? 1 : 0;
    } else if (siteName in d.genesisManaSites) {
      base = 0;
    } else if (
      siteName.includes("tower of babel") ||
      (siteName.includes("base of babel") && babelMergedAt(game, cellKey))
    ) {
      base = 2;
    } else {
      base = 1;
    }
    if (base <= 0) continue;
    base += getSiteEnhancerBonus(cellKey, permanents).mana;
    base += modifiers.extraMana;
    mana += base * modifiers.multiplier;
  }

  const genesis = specialSiteState?.genesisMana;
  if (Array.isArray(genesis)) {
    for (const bonus of genesis as AnyRecord[]) {
      if (Number(bonus.owner) === owner) mana += Number(bonus.manaAmount) || 0;
    }
  }

  const enemyAvatar = avatarCell(game, opponent);
  for (const cellKey of Object.keys(permanents)) {
    const isVoidCell = !board.sites[cellKey];
    for (const p of permanents[cellKey]) {
      if (!p || Number(p.owner) !== owner) continue;
      const nm = permanentName(p);
      const cardType = lower(((p.card || {}) as AnyRecord).type);
      const isArtifact = cardType.includes("artifact");
      const instanceId = typeof p.instanceId === "string" ? p.instanceId : null;
      const enteredThisTurn =
        Number.isFinite(currentTurn) &&
        typeof p.enteredOnTurn === "number" &&
        p.enteredOnTurn === currentTurn;

      if (isVoidCell && d.voidManaProviders[nm]) {
        const startedInVoid = instanceId !== null && etherAtStart.includes(instanceId);
        if (enteredThisTurn || startedInVoid) mana += d.voidManaProviders[nm];
        continue;
      }

      const perEnemyAvatar = d.perNearbyEnemyAvatarProviders[nm];
      if (perEnemyAvatar) {
        if (
          enemyAvatar &&
          getNearbyCells(cellKey, board.w, board.h).includes(enemyAvatar)
        ) {
          mana += perEnemyAvatar;
        }
        continue;
      }

      if (!providers.has(nm)) continue;
      if (isArtifact && !p.attachedTo) continue;
      if (isArtifact && nm.includes("core")) {
        const carriedAtStart =
          instanceId !== null && coresCarriedAtStart.includes(instanceId);
        if (!enteredThisTurn && !carriedAtStart) continue;
      }
      mana += 1;
    }
  }

  return mana;
}

// players[seat].mana is the spend ledger shared by client, server and bot.
export function getManaLedger(game: AnyRecord, seat: SeatKey): number {
  const players = (game.players || {}) as Record<string, AnyRecord | undefined>;
  const v = Number(players[seat]?.mana);
  return Number.isFinite(v) ? v : 0;
}

// --- Avatar cost adjustments (mirrors getAvatarAdjustedManaCost) ------------
const TEMPLAR_TOKENS = new Set(["knight", "knights", "sir", "sirs", "dame", "dames"]);

function nameTokens(name: unknown): string[] {
  return String(name ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

function isTemplarDiscountCard(card: AnyRecord): boolean {
  const type = lower(card.type);
  if (!type.includes("minion") || type.includes("token")) return false;
  return nameTokens(card.name).some((t) => TEMPLAR_TOKENS.has(t));
}

function portalOwnersAt(game: AnyRecord, cellKey: string): SeatKey[] {
  const portalState = (game.portalState || null) as AnyRecord | null;
  if (!portalState) return [];
  const { x, y } = parseCellKey(cellKey);
  const w = boardOf(game).w;
  const owners: SeatKey[] = [];
  for (const seat of ["p1", "p2"] as const) {
    const ps = (portalState[seat] || null) as AnyRecord | null;
    const tiles = Array.isArray(ps?.tileNumbers) ? (ps?.tileNumbers as number[]) : [];
    const holds = tiles.some((n) => {
      const zero = Number(n) - 1;
      return zero % w === x && Math.floor(zero / w) === y;
    });
    if (holds) owners.push(seat);
  }
  return owners;
}

export type CostAdjustment = {
  manaCost: number;
  harbingerPortalDiscountApplied: boolean;
  templarDiscountApplied: boolean;
};

export function getAvatarAdjustedManaCost(
  game: AnyRecord,
  seat: SeatKey,
  card: AnyRecord,
  cellKey: string | null,
  baseCost: number,
  used: { harbinger: boolean; templar: boolean },
): CostAdjustment {
  let cost = baseCost;
  let harbingerPortalDiscountApplied = false;
  let templarDiscountApplied = false;
  const type = lower(card.type);
  if (!type.includes("minion") || type.includes("token") || cost <= 0) {
    return { manaCost: cost, harbingerPortalDiscountApplied, templarDiscountApplied };
  }
  const avatarName = effectiveAvatarName(game, seat);
  const flags = {
    harbinger:
      used.harbinger ||
      !!((game.harbingerPortalDiscountUsed || {}) as Record<string, boolean>)[seat],
    templar:
      used.templar ||
      !!((game.templarDiscountUsed || {}) as Record<string, boolean>)[seat],
  };
  if (
    avatarName.includes("harbinger") &&
    !flags.harbinger &&
    cellKey &&
    portalOwnersAt(game, cellKey).includes(seat)
  ) {
    cost = Math.max(0, cost - 1);
    harbingerPortalDiscountApplied = true;
  }
  if (
    cost > 0 &&
    avatarName.includes("templar") &&
    !flags.templar &&
    isTemplarDiscountCard(card)
  ) {
    cost = Math.max(0, cost - 1);
    templarDiscountApplied = true;
  }
  return { manaCost: cost, harbingerPortalDiscountApplied, templarDiscountApplied };
}
