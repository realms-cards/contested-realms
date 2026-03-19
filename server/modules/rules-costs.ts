"use strict";

import * as fs from "fs";
import * as path from "path";
import type { AnyRecord, MatchPatch } from "../types";
import { markAndCountNewPlacements } from "./rules-validation";

type SeatKey = "p1" | "p2";

type EnsureCostsResult = {
  ok: boolean;
  error?: string;
  autoPatch?: AnyRecord;
};

type CardLike = Record<string, unknown>;

let CARDS_DB: CardLike[] | null = null;

function loadCardsDb(): CardLike[] {
  if (CARDS_DB) return CARDS_DB;
  try {
    const jsonPath = path.join(__dirname, "..", "..", "data", "cards_raw.json");
    const jsonContent = fs.readFileSync(jsonPath, "utf-8");
    CARDS_DB = JSON.parse(jsonContent) as CardLike[];
  } catch {
    CARDS_DB = [];
  }
  return CARDS_DB;
}

function getCardBySlug(slug: string | null): CardLike | null {
  if (!slug) return null;
  const db = loadCardsDb();
  for (const c of db) {
    try {
      const cSlug = (c.slug ? String(c.slug) : "").toLowerCase();
      if (cSlug === String(slug).toLowerCase()) return c;
      const sets = (c.sets as unknown[]) || [];
      for (const s of sets) {
        const vs = (s as CardLike)?.variants as unknown[];
        if (!Array.isArray(vs)) continue;
        if (vs.find((v) => String((v as CardLike).slug) === String(slug))) {
          return c;
        }
      }
    } catch {
      // ignore malformed entries
    }
  }
  return null;
}

function getCardByName(name: string | null): CardLike | null {
  if (!name) return null;
  const db = loadCardsDb();
  const low = String(name).toLowerCase();
  for (const c of db) {
    try {
      const nm = (c.name ? String(c.name) : "").toLowerCase();
      if (nm === low) return c;
    } catch {
      // ignore
    }
  }
  return null;
}

function getCostForCard(card: AnyRecord | null | undefined): number {
  try {
    if (card && typeof card.cost === "number") {
      const v = Number(card.cost);
      return Number.isFinite(v) ? v : 0;
    }
    const slug = card && card.slug ? String(card.slug) : null;
    const nm = card && card.name ? String(card.name) : null;
    const found = slug ? getCardBySlug(slug) : nm ? getCardByName(nm) : null;
    if (found) {
      const meta =
        ((found.guardian as CardLike | undefined) ||
          (Array.isArray(found.sets) &&
          found.sets[0] &&
          (found.sets[0] as CardLike).metadata
            ? ((found.sets[0] as CardLike).metadata as CardLike)
            : null)) ??
        null;
      if (meta && typeof meta.cost === "number") {
        const v = Number(meta.cost);
        return Number.isFinite(v) ? v : 0;
      }
    }
  } catch {
    // ignore lookup failures
  }
  return 0;
}

// Curated metadata (mirrors client `src/lib/game/mana-providers.ts`)
const MANA_PROVIDER_BY_NAME: ReadonlySet<string> = new Set([
  "abundance",
  "amethyst core",
  "aquamarine core",
  "atlantean fate",
  "avalon",
  "blacksmith family",
  "caerleon-upon-usk",
  "castle servants",
  "common cottagers",
  "drought",
  "finwife",
  "fisherman's family",
  "glastonbury tor",
  "joyous garde",
  "onyx core",
  "pristine paradise",
  "ruby core",
  "shrine of the dragonlord",
  "the colour out of space",
  "tintagel",
  "valley of delight",
  "wedding hall",
  "älvalinne dryads",
]);

// Sites that do NOT provide 1 mana (keep empty until cataloged)
const NON_MANA_SITE_IDENTIFIERS: ReadonlySet<string> = new Set([]);

function siteProvidesMana(card: AnyRecord | null | undefined): boolean {
  if (!card) return false;
  const name = (card.name || "").toString().toLowerCase();
  const slug = (card.slug || "").toString().toLowerCase();
  if (NON_MANA_SITE_IDENTIFIERS.has(name)) return false;
  if (slug && NON_MANA_SITE_IDENTIFIERS.has(slug)) return false;
  return true;
}

function countOwnedManaSites(game: AnyRecord, playerNum: number): number {
  let n = 0;
  const board = (game.board || {}) as AnyRecord;
  const sites = (board.sites || {}) as Record<string, AnyRecord>;
  for (const key of Object.keys(sites)) {
    try {
      const tile = sites[key];
      if (!tile || Number(tile.owner) !== playerNum) continue;
      const card = (tile.card || null) as AnyRecord | null;
      if (siteProvidesMana(card)) n++;
    } catch {
      // ignore tile
    }
  }
  return n;
}

function countManaProvidersFromPermanents(
  game: AnyRecord,
  playerNum: number,
): number {
  let n = 0;
  const per = (game.permanents as Record<string, unknown[]>) || {};
  for (const cellKey of Object.keys(per)) {
    const arrRaw = per[cellKey];
    const arr = Array.isArray(arrRaw) ? arrRaw : [];
    for (const p of arr) {
      try {
        const perm = (p || {}) as AnyRecord;
        if (!perm || Number(perm.owner) !== playerNum) continue;
        const nm = (
          perm.card && (perm.card as AnyRecord).name
            ? String((perm.card as AnyRecord).name)
            : ""
        ).toLowerCase();
        if (MANA_PROVIDER_BY_NAME.has(nm)) n++;
      } catch {
        // ignore malformed entries
      }
    }
  }
  return n;
}

export function ensureCosts(
  game: AnyRecord,
  action: MatchPatch,
  playerId: string,
  context?: AnyRecord,
): EnsureCostsResult {
  try {
    const match =
      context && typeof context === "object"
        ? ((context as AnyRecord).match as AnyRecord | null | undefined)
        : null;
    const playerIds = Array.isArray(match?.playerIds)
      ? (match.playerIds as string[])
      : [];
    const idx = playerIds.indexOf(playerId);
    const meNum: number | null = idx >= 0 ? idx + 1 : null;
    const meKey: SeatKey | null = idx === 0 ? "p1" : idx === 1 ? "p2" : null;
    if (!meNum || !meKey) return { ok: true };

    let totalCost = 0;
    const newPermanentsInfo = {
      newItems: [] as AnyRecord[],
      isNew: new WeakSet<AnyRecord>(),
    };

    if (
      (action as AnyRecord).permanents &&
      typeof (action as AnyRecord).permanents === "object"
    ) {
      const info = markAndCountNewPlacements(game, action, meNum);
      newPermanentsInfo.newItems = info.newItems;
      newPermanentsInfo.isNew = info.isNew;
      for (const p of info.newItems) {
        const card = (p.card || null) as AnyRecord | null;
        if (card) totalCost += getCostForCard(card);
      }
    }

    let placingNewSite = false;
    if (
      (action as AnyRecord).board &&
      typeof (action as AnyRecord).board === "object"
    ) {
      const boardPatch = (action as AnyRecord).board as AnyRecord;
      const sitesPatch = boardPatch.sites as
        | Record<string, AnyRecord>
        | undefined;
      if (sitesPatch && typeof sitesPatch === "object") {
        const boardPrev = (game.board || {}) as AnyRecord;
        const currentSites =
          (boardPrev.sites as Record<string, AnyRecord>) || {};
        for (const key of Object.keys(sitesPatch)) {
          const nextTile = sitesPatch[key];
          const prevTile = currentSites[key];
          if (
            nextTile &&
            nextTile.card &&
            (!prevTile || !prevTile.card) &&
            Number(nextTile.owner) === meNum
          ) {
            placingNewSite = true;
            break;
          }
        }
      }
    }

    const autoResources: Record<string, AnyRecord> = {};
    const autoAvatars: Record<string, AnyRecord> = {};
    let hasAuto = false;

    if (totalCost > 0) {
      const ownedSiteCount = countOwnedManaSites(game, meNum);
      const manaProviders = countManaProvidersFromPermanents(game, meNum);
      const resourcesPrev = (game.resources || {}) as AnyRecord;
      const meResPrev = (resourcesPrev[meKey] || {}) as AnyRecord;
      const spentPrevRaw = meResPrev.spentThisTurn;
      const spentPrev = Number(spentPrevRaw) || 0;
      const available = Math.max(0, ownedSiteCount + manaProviders - spentPrev);
      if (totalCost > available) {
        return {
          ok: false,
          error: "Insufficient resources to pay costs",
        };
      }
      const newSpent = spentPrev + totalCost;
      autoResources[meKey] = { spentThisTurn: newSpent };
      hasAuto = true;
    }

    if (placingNewSite) {
      const avatarsPrev = (game.avatars || {}) as Record<string, AnyRecord>;
      const avPrev = (avatarsPrev[meKey] || {}) as AnyRecord;
      const tappedPrev = !!avPrev.tapped;
      const avatarsPatch = (action as AnyRecord).avatars as
        | Record<string, AnyRecord>
        | undefined;
      const avPatch = avatarsPatch ? avatarsPatch[meKey] : undefined;
      const tappedNext =
        avPatch && Object.prototype.hasOwnProperty.call(avPatch, "tapped")
          ? !!avPatch.tapped
          : tappedPrev;
      if (tappedPrev) {
        return {
          ok: false,
          error: "Avatar must be untapped to play a site",
        };
      }
      if (!tappedNext) {
        autoAvatars[meKey] = { ...(avPrev || {}), tapped: true };
        hasAuto = true;
      }
    }

    if (hasAuto) {
      const auto: AnyRecord = {
        resources: autoResources,
        avatars: autoAvatars,
      };
      return { ok: true, autoPatch: auto };
    }

    return { ok: true };
  } catch {
    return { ok: true };
  }
}
