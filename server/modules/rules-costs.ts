"use strict";

import * as fs from "fs";
import * as path from "path";
import type { AnyRecord, MatchPatch } from "../types";
import {
  computeAvailableMana,
  getAvatarAdjustedManaCost,
  getManaLedger,
} from "./rules-resources";
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

// Validates and books the mana cost of newly played permanents, and taps the
// avatar when a site is played. Mana rules live in rules-resources.ts.
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
      // Walk the patch so each new permanent is priced at its cell (Harbinger
      // portal discount) with the same once-per-turn avatar discounts the
      // client applies.
      const used = { harbinger: false, templar: false };
      const perPatch = (action as AnyRecord).permanents as Record<
        string,
        unknown
      >;
      for (const cellKey of Object.keys(perPatch)) {
        const arr = Array.isArray(perPatch[cellKey])
          ? (perPatch[cellKey] as unknown[])
          : [];
        for (const raw of arr) {
          const p = raw as AnyRecord;
          if (!p || !info.isNew.has(p)) continue;
          const card = (p.card || null) as AnyRecord | null;
          if (!card) continue;
          const adjusted = getAvatarAdjustedManaCost(
            game,
            meKey,
            card,
            cellKey,
            getCostForCard(card),
            used,
          );
          if (adjusted.harbingerPortalDiscountApplied) used.harbinger = true;
          if (adjusted.templarDiscountApplied) used.templar = true;
          totalCost += adjusted.manaCost;
        }
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

    const autoPlayers: Record<string, AnyRecord> = {};
    const autoAvatars: Record<string, AnyRecord> = {};
    let hasAuto = false;

    if (totalCost > 0) {
      // players[seat].mana is the single spend ledger. A human client sends
      // its updated ledger inside the same patch as the permanent; a bot (or
      // legacy client) does not, so the server books the cost itself.
      const ledgerPrev = getManaLedger(game, meKey);
      const playersPatch = (action as AnyRecord).players as
        | Record<string, AnyRecord | undefined>
        | undefined;
      const ledgerPatchRaw = playersPatch?.[meKey]?.mana;
      const clientPaid =
        typeof ledgerPatchRaw === "number" &&
        Number.isFinite(ledgerPatchRaw) &&
        ledgerPatchRaw !== ledgerPrev;
      const ledgerNext = clientPaid
        ? (ledgerPatchRaw as number)
        : ledgerPrev - totalCost;
      const available = computeAvailableMana(game, meKey) + ledgerPrev;
      if (totalCost > Math.max(0, available)) {
        return {
          ok: false,
          error: "Insufficient resources to pay costs",
        };
      }
      if (!clientPaid) {
        autoPlayers[meKey] = { mana: ledgerNext };
        hasAuto = true;
      }
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
      const auto: AnyRecord = {};
      if (Object.keys(autoPlayers).length > 0) auto.players = autoPlayers;
      if (Object.keys(autoAvatars).length > 0) auto.avatars = autoAvatars;
      return { ok: true, autoPatch: auto };
    }

    return { ok: true };
  } catch {
    return { ok: true };
  }
}
