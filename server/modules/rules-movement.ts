"use strict";

import type { AnyRecord, MatchPatch } from "../types";
import * as path from "path";

type CardLike = Record<string, unknown>;

type CardStats = {
  power: number;
  life: number;
};

let CARDS_DB: CardLike[] | null = null;

function loadCardsDb(): CardLike[] {
  if (CARDS_DB) return CARDS_DB;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    CARDS_DB = require(path.join(
      __dirname,
      "..",
      "..",
      "data",
      "cards_raw.json"
    )) as CardLike[];
  } catch {
    CARDS_DB = [];
  }
  return CARDS_DB;
}

function canonicalCardKey(card: CardLike): string {
  try {
    const name = (card && card.name ? String(card.name) : "").toLowerCase();
    const slug = (card && card.slug ? String(card.slug) : "").toLowerCase();
    const type = (card && card.type ? String(card.type) : "").toLowerCase();
    const set = (card && card.set ? String(card.set) : "").toLowerCase();
    return `${name}|${slug}|${type}|${set}`;
  } catch {
    return "";
  }
}

function getCardBySlug(slug: string | null): CardLike | null {
  if (!slug) return null;
  const db = loadCardsDb();
  const needle = String(slug).toLowerCase();
  for (const c of db) {
    try {
      const cSlug = (c.slug ? String(c.slug) : "").toLowerCase();
      if (cSlug === needle) return c;
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

function getCardStatsFromRef(card: unknown): CardStats | null {
  try {
    if (!card || typeof card !== "object") return null;
    const c = card as CardLike;
    const power = Number(c.power ?? c.atk ?? c.attack);
    const life = Number(c.life ?? c.hp ?? c.health ?? c.defense);
    const powOk = Number.isFinite(power) && power > 0;
    const lifeOk = Number.isFinite(life) && life > 0;
    if (powOk || lifeOk) {
      return {
        power: powOk ? power : 1,
        life: lifeOk ? life : 1,
      };
    }
  } catch {
    // fall through to DB lookup
  }
  return null;
}

function getCardStatsFromDb(card: unknown): CardStats {
  try {
    const c = (card && typeof card === "object"
      ? (card as CardLike)
      : {}) as CardLike;
    const slug = c.slug ? String(c.slug) : null;
    const nm = c.name ? String(c.name) : null;
    const found = slug ? getCardBySlug(slug) : nm ? getCardByName(nm) : null;
    const meta =
      (found &&
        ((found.guardian as CardLike | undefined) ||
          ((Array.isArray(found.sets) && found.sets[0] && found.sets[0].metadata
            ? (found.sets[0].metadata as CardLike)
            : null)))) ||
      null;
    if (!meta) return { power: 1, life: 1 };
    const power = Number(meta.power ?? meta.atk ?? meta.attack);
    const life = Number(meta.life ?? meta.hp ?? meta.health ?? meta.defense);
    const pow = Number.isFinite(power) && power > 0 ? power : 1;
    const hp = Number.isFinite(life) && life > 0 ? life : 1;
    return { power: pow, life: hp };
  } catch {
    return { power: 1, life: 1 };
  }
}

function getCardStats(card: unknown): CardStats {
  return getCardStatsFromRef(card) || getCardStatsFromDb(card || {});
}

export function applyMovementAndCombat(
  prevGame: AnyRecord,
  action: MatchPatch,
  playerId: string,
  context?: AnyRecord
): MatchPatch | null {
  try {
    if (!action || typeof action !== "object") return null;
    const match = context && typeof context === "object"
      ? ((context as AnyRecord).match as AnyRecord | null | undefined)
      : null;
    void match;

    const perPrev =
      (prevGame && typeof prevGame === "object"
        ? ((prevGame as AnyRecord).permanents as Record<string, unknown[]>)
        : null) || {};
    const perPatch =
      (action && typeof action === "object"
        ? ((action as AnyRecord).permanents as Record<string, unknown[]>)
        : null) || {};

    const keys = new Set<string>([
      ...Object.keys(perPrev),
      ...Object.keys(perPatch),
    ]);
    const result: { permanents: Record<string, unknown[]>; events: unknown[] } =
      { permanents: {}, events: [] };
    let changed = false;

    for (const k of keys) {
      const beforeArrRaw = perPrev[k];
      const beforeArr = Array.isArray(beforeArrRaw) ? beforeArrRaw : [];
      const afterArrRaw = Object.prototype.hasOwnProperty.call(perPatch, k)
        ? perPatch[k]
        : beforeArr;
      const afterArr = Array.isArray(afterArrRaw) ? afterArrRaw : [];
      if (!afterArr || afterArr.length === 0) continue;

      const mine: unknown[] = [];
      const theirs: unknown[] = [];
      for (const it of afterArr) {
        try {
          if (!it || typeof it !== "object") continue;
          const ownerVal = (it as AnyRecord).owner;
          const ownerNum = Number(ownerVal);
          if (ownerNum === 1 || ownerNum === 2) {
            if (ownerNum === 1) mine.push(it);
            else theirs.push(it);
          }
        } catch {
          // ignore malformed entries
        }
      }
      if (mine.length > 0 && theirs.length > 0) {
        const dmgToMine = theirs.reduce((s: number, u) => {
          const card = (u && typeof u === "object"
            ? (u as AnyRecord).card
            : null) as unknown;
          return s + getCardStats(card || {}).power;
        }, 0);
        const dmgToTheirs = mine.reduce((s: number, u) => {
          const card = (u && typeof u === "object"
            ? (u as AnyRecord).card
            : null) as unknown;
          return s + getCardStats(card || {}).power;
        }, 0);
        const survivorsMine = mine.filter((u) => {
          const card = (u && typeof u === "object"
            ? (u as AnyRecord).card
            : null) as unknown;
          return getCardStats(card || {}).life > dmgToMine;
        });
        const survivorsTheirs = theirs.filter((u) => {
          const card = (u && typeof u === "object"
            ? (u as AnyRecord).card
            : null) as unknown;
          return getCardStats(card || {}).life > dmgToTheirs;
        });
        const survivors = [...survivorsMine, ...survivorsTheirs];
        result.permanents[k] = survivors;
        changed = true;
        try {
          const currentTurnRaw = (prevGame as AnyRecord).turn;
          const currentTurn =
            typeof currentTurnRaw === "number" ? currentTurnRaw : 1;
          result.events.push({
            id: 0,
            ts: Date.now(),
            text: `[Combat] ${k}: ${mine.length} vs ${theirs.length} -> survivors ${survivors.length}`,
            turn: currentTurn,
          });
        } catch {
          // ignore logging failure
        }
      }
    }

    if (!changed) return null;
    return result as MatchPatch;
  } catch {
    return null;
  }
}
