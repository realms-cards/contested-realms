"use strict";

import type { AnyRecord, MatchPatch } from "../types";

type SeatKey = "p1" | "p2";

type Thresholds = {
  air?: number;
  water?: number;
  earth?: number;
  fire?: number;
};

function parseCellKey(key: string): { x: number; y: number } | null {
  try {
    const [xs, ys] = String(key).split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  } catch {
    // ignore
  }
  return null;
}

function getBoardWidth(game: AnyRecord): number {
  const board = game.board as AnyRecord | undefined;
  const size = board && (board.size as AnyRecord | undefined);
  const wVal = size && Number(size.w);
  return Number.isFinite(wVal) && (wVal as number) > 0 ? (wVal as number) : 5;
}

function getCellNumber(key: string, boardWidth: number): number | null {
  const pos = parseCellKey(key);
  if (!pos) return null;
  return pos.y * boardWidth + pos.x + 1;
}

function inBounds(
  pos: { x: number; y: number },
  w: number,
  h: number
): boolean {
  try {
    return pos.x >= 0 && pos.x < w && pos.y >= 0 && pos.y < h;
  } catch {
    return false;
  }
}

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }) {
  try {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  } catch {
    return 0;
  }
}

function isAdjacentToOwnedSite(
  game: AnyRecord,
  playerNum: number,
  key: string
): boolean {
  const pos = parseCellKey(key);
  if (!pos) return false;
  const neighbors: Array<{ x: number; y: number }> = [
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x, y: pos.y - 1 },
  ];
  const board = game.board as AnyRecord | undefined;
  const sites =
    board && typeof board.sites === "object"
      ? (board.sites as Record<string, AnyRecord>)
      : {};
  for (const n of neighbors) {
    const k = `${n.x},${n.y}`;
    const tile = sites[k];
    if (tile && tile.card && Number(tile.owner) === playerNum) return true;
  }
  return false;
}

function countThresholdsForPlayer(
  game: AnyRecord,
  playerNum: number
): Thresholds {
  const out: Thresholds = { air: 0, water: 0, earth: 0, fire: 0 };
  const board = game.board as AnyRecord | undefined;
  const sites =
    board && typeof board.sites === "object"
      ? (board.sites as Record<string, AnyRecord>)
      : {};
  for (const key of Object.keys(sites)) {
    try {
      const tile = sites[key];
      if (!tile || Number(tile.owner) !== playerNum) continue;
      const card = tile.card as AnyRecord | undefined;
      const th = card && typeof card.thresholds === "object"
        ? (card.thresholds as Thresholds)
        : null;
      if (!th) continue;
      for (const k of ["air", "water", "earth", "fire"] as const) {
        const v = Number(th[k] ?? 0);
        if (Number.isFinite(v) && v !== 0) {
          out[k] = (out[k] || 0) + v;
        }
      }
    } catch {
      // ignore per-tile failures
    }
  }
  // Permanents that grant thresholds are handled elsewhere (this mirrors JS behavior indirectly)
  return out;
}

export function markAndCountNewPlacements(
  game: AnyRecord,
  action: MatchPatch,
  playerNum: number
): { newItems: AnyRecord[]; isNew: WeakSet<AnyRecord> } {
  const result: { newItems: AnyRecord[]; isNew: WeakSet<AnyRecord> } = {
    newItems: [],
    isNew: new WeakSet<AnyRecord>(),
  };
  try {
    const per = (game.permanents as Record<string, unknown>) || {};
    const ownedMultiset = new Map<string, number>();
    for (const key of Object.keys(per)) {
      const arr = Array.isArray(per[key]) ? (per[key] as unknown[]) : [];
      for (const p of arr) {
        try {
          const perm = p as AnyRecord;
          if (!perm || Number(perm.owner) !== playerNum) continue;
          const card = (perm.card || {}) as AnyRecord;
          const k = canonicalCardKey(card);
          if (!k) continue;
          ownedMultiset.set(k, (ownedMultiset.get(k) || 0) + 1);
        } catch {
          // ignore malformed entries
        }
      }
    }

    const perPatch =
      (action && typeof action === "object"
        ? ((action as AnyRecord).permanents as Record<string, unknown>)
        : {}) || {};

    for (const key of Object.keys(perPatch)) {
      const arr = Array.isArray(perPatch[key]) ? (perPatch[key] as unknown[]) : [];
      for (const p of arr) {
        try {
          const perm = p as AnyRecord;
          if (!perm || Number(perm.owner) !== playerNum) continue;
          const card = (perm.card || {}) as AnyRecord;
          const k = canonicalCardKey(card);
          if (!k) {
            result.newItems.push(perm);
            result.isNew.add(perm);
            continue;
          }
          const count = ownedMultiset.get(k) || 0;
          if (count > 0) {
            ownedMultiset.set(k, count - 1);
          } else {
            result.newItems.push(perm);
            result.isNew.add(perm);
          }
        } catch {
          // ignore malformed entries
        }
      }
    }
  } catch {
    // ignore errors, return best-effort result
  }
  return result;
}

function canonicalCardKey(card: AnyRecord): string {
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

export function validateAction(
  game: AnyRecord,
  action: MatchPatch,
  playerId: string,
  context?: AnyRecord
): { ok: boolean; error?: string } {
  try {
    if (!action || typeof action !== "object") return { ok: true };
    const match = context && typeof context === "object"
      ? ((context as AnyRecord).match as AnyRecord | null | undefined)
      : null;
    const playerIds = Array.isArray(match?.playerIds)
      ? (match!.playerIds as string[])
      : [];
    const idx = playerIds.indexOf(playerId);
    const meKey: SeatKey | null = idx === 0 ? "p1" : idx === 1 ? "p2" : null;
    const meNum: number | null = idx >= 0 ? idx + 1 : null;

    const effectivePlayer =
      typeof (action as AnyRecord).currentPlayer === "number"
        ? (action as AnyRecord).currentPlayer
        : (game.currentPlayer as number | undefined);
    const effectivePhase =
      typeof (action as AnyRecord).phase === "string"
        ? ((action as AnyRecord).phase as string)
        : ((game.phase as string | undefined) ?? undefined);

    if (
      (action as AnyRecord).board &&
      typeof (action as AnyRecord).board === "object"
    ) {
      const boardPatch = (action as AnyRecord).board as AnyRecord;
      const sitesPatch = boardPatch.sites as Record<string, AnyRecord> | undefined;
      if (sitesPatch && typeof sitesPatch === "object") {
        const currentSites: Record<string, AnyRecord> =
          game.board &&
          typeof (game.board as AnyRecord).sites === "object"
            ? ((game.board as AnyRecord).sites as Record<
                string,
                AnyRecord
              >)
            : {};
        const avatars: Record<string, AnyRecord> =
          game.avatars && typeof game.avatars === "object"
            ? (game.avatars as Record<string, AnyRecord>)
            : {};
        for (const key of Object.keys(sitesPatch)) {
          const nextTile = sitesPatch[key];
          const prevTile = currentSites[key];
          if (
            nextTile &&
            nextTile.card &&
            meNum &&
            Number(nextTile.owner) !== meNum
          ) {
            return { ok: false, error: "Cannot place site owned by opponent" };
          }
          if (nextTile && nextTile.card && meNum) {
            const sitesOwned = Object.values(currentSites).filter(
              (t) => t && t.card && Number(t.owner) === meNum
            ).length;
            if (sitesOwned === 0 && meKey) {
              const av = avatars[meKey as string] || {};
              const pos = Array.isArray(av.pos) ? (av.pos as number[]) : null;
              if (pos) {
                const atKey = `${pos[0]},${pos[1]}`;
                if (key !== atKey) {
                  const cellNum = getCellNumber(atKey, getBoardWidth(game));
                  const cellRef = cellNum
                    ? `cell ${cellNum}`
                    : `position ${atKey}`;
                  return {
                    ok: false,
                    error: `First site must be played at your avatar's ${cellRef}`,
                  };
                }
              }
            }
            if (sitesOwned > 0 && !isAdjacentToOwnedSite(game, meNum, key)) {
              return {
                ok: false,
                error: "New sites must be adjacent to your existing sites",
              };
            }
          }
        }
      }
    }

    if (
      (action as AnyRecord).permanents &&
      typeof (action as AnyRecord).permanents === "object"
    ) {
      const perPatch = (action as AnyRecord).permanents as Record<
        string,
        unknown[]
      >;
      if (meNum) {
        const prevPer =
          (game.permanents as Record<string, unknown[]>) || {};
        for (const key of Object.keys(perPatch)) {
          const nextArrRaw = perPatch[key];
          const nextArr = Array.isArray(nextArrRaw) ? nextArrRaw : [];
          const prevArrRaw = prevPer[key];
          const prevArr = Array.isArray(prevArrRaw) ? prevArrRaw : [];
          const len = Math.min(prevArr.length, nextArr.length);
          for (let i = 0; i < len; i++) {
            const prevItem = (prevArr[i] || {}) as AnyRecord;
            const nextItem = (nextArr[i] || {}) as AnyRecord;
            try {
              const owner = Number(prevItem.owner);
              const prevTapped = !!prevItem.tapped;
              const nextTapped = Object.prototype.hasOwnProperty.call(
                nextItem,
                "tapped"
              )
                ? !!nextItem.tapped
                : prevTapped;
              if (prevTapped !== nextTapped && owner !== meNum) {
                return {
                  ok: false,
                  error: "Cannot tap or untap opponent permanent",
                };
              }
            } catch {
              // ignore malformed entries
            }
          }
        }
      }
    }

    if (
      (action as AnyRecord).zones &&
      typeof (action as AnyRecord).zones === "object" &&
      meKey
    ) {
      const zonesPatch = ((action as AnyRecord).zones ??
        {}) as Record<string, unknown>;
      for (const zk of Object.keys(zonesPatch)) {
        if (zk !== meKey) {
          return {
            ok: false,
            error: `Cannot modify opponent zones (${zk})`,
          };
        }
      }
    }

    if (
      (action as AnyRecord).avatars &&
      typeof (action as AnyRecord).avatars === "object" &&
      meKey
    ) {
      const avatarsPatch = (action as AnyRecord).avatars as Record<
        string,
        AnyRecord
      >;
      for (const k of Object.keys(avatarsPatch)) {
        if (k !== "p1" && k !== "p2") continue;
        const patch: AnyRecord = avatarsPatch[k] || {};
        if (
          Object.prototype.hasOwnProperty.call(patch, "tapped") &&
          k !== meKey
        ) {
          return {
            ok: false,
            error: "Cannot tap or untap opponent avatar",
          };
        }
      }
    }

    if (
      (action as AnyRecord).permanents &&
      typeof (action as AnyRecord).permanents === "object" &&
      meNum
    ) {
      const perPatch = (action as AnyRecord).permanents as Record<
        string,
        unknown[]
      >;
      const available = countThresholdsForPlayer(game, meNum);
      const { newItems } = markAndCountNewPlacements(
        game,
        action,
        meNum
      );
      if (newItems.length > 0) {
        if (
          !(
            effectivePlayer === meNum &&
            effectivePhase &&
            effectivePhase === "Main"
          )
        ) {
          return {
            ok: false,
            error: "Permanents can only be played during your Main phase",
          };
        }
        for (const p of newItems) {
          const card = (p.card || null) as AnyRecord | null;
          if (!card) continue;
          const th = (card.thresholds || null) as Thresholds | null;
          if (!th) continue;
          if ((th.air || 0) > (available.air || 0))
            return { ok: false, error: "Insufficient Air thresholds" };
          if ((th.earth || 0) > (available.earth || 0))
            return { ok: false, error: "Insufficient Earth thresholds" };
          if ((th.fire || 0) > (available.fire || 0))
            return { ok: false, error: "Insufficient Fire thresholds" };
          if ((th.water || 0) > (available.water || 0))
            return { ok: false, error: "Insufficient Water thresholds" };
        }
      }
      void perPatch;
    }

    return { ok: true };
  } catch {
    return { ok: true };
  }
}
