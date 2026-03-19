"use strict";

import type { RedisStateManager } from "../core/redis-state";
import type {
  AnyRecord,
  MatchPatch,
  PlayerState,
  ServerMatchState,
} from "../types";

export interface MatchRecordingEntry {
  matchId: string;
  playerNames: string[];
  startTime: number;
  endTime?: number;
  actions: Array<{ patch: unknown; timestamp: number; playerId: string }>;
  initialState?: AnyRecord;
  cardPlays?: { p1: Set<number>; p2: Set<number> };
  lastZones?: { p1?: Record<string, unknown>; p2?: Record<string, unknown> };
  lastAvatars?: {
    p1?: Record<string, unknown> | null;
    p2?: Record<string, unknown> | null;
  };
}

export type MatchRecordingsMap = Map<string, MatchRecordingEntry>;
type PlayersMap = Map<string, PlayerState>;

interface MatchRecordingDeps {
  players: PlayersMap;
  matchRecordings: MatchRecordingsMap;
  /** Redis state manager for cross-instance recording persistence */
  redisState?: RedisStateManager | null;
}

const seatFromOwner = (owner: 1 | 2): "p1" | "p2" =>
  owner === 1 ? "p1" : "p2";

export function createMatchRecordingService({
  players,
  matchRecordings,
  redisState,
}: MatchRecordingDeps) {
  function startMatchRecording(match: ServerMatchState): void {
    const playerNames = match.playerIds.map((pid) => {
      const p = players.get(pid);
      return p ? p.displayName : `Player ${pid}`;
    });

    const startTime = Date.now();
    const initialState = {
      playerIds: [...match.playerIds],
      seed: (match as AnyRecord).seed ?? null,
      matchType: match.matchType,
      playerDecks: match.playerDecks
        ? Object.fromEntries(match.playerDecks)
        : undefined,
    };

    const recording: MatchRecordingEntry = {
      matchId: match.id,
      playerNames,
      startTime,
      initialState,
      actions: [],
      cardPlays: { p1: new Set<number>(), p2: new Set<number>() },
      lastZones: (() => {
        const g = (match as AnyRecord).game as AnyRecord | undefined;
        const zones =
          g && typeof g === "object"
            ? (g.zones as AnyRecord | undefined)
            : undefined;
        if (zones && typeof zones === "object") {
          return {
            p1: zones.p1 as Record<string, unknown> | undefined,
            p2: zones.p2 as Record<string, unknown> | undefined,
          };
        }
        return {} as {
          p1?: Record<string, unknown>;
          p2?: Record<string, unknown>;
        };
      })(),
      lastAvatars: (() => {
        const g = (match as AnyRecord).game as AnyRecord | undefined;
        const avatars =
          g && typeof g === "object"
            ? (g.avatars as AnyRecord | undefined)
            : undefined;
        if (avatars && typeof avatars === "object") {
          return {
            p1: avatars.p1 as Record<string, unknown> | null,
            p2: avatars.p2 as Record<string, unknown> | null,
          };
        }
        return {} as {
          p1?: Record<string, unknown> | null;
          p2?: Record<string, unknown> | null;
        };
      })(),
    };

    matchRecordings.set(match.id, recording);

    // Persist to Redis for cross-instance continuity (fire and forget)
    if (redisState?.isEnabled()) {
      redisState
        .startRecording(match.id, {
          playerNames,
          startTime,
          initialState,
        })
        .catch((err) => {
          console.error(
            `[Recording] Failed to persist recording start to Redis for match ${match.id}:`,
            err,
          );
        });
    }

    try {
      console.log(
        `[Recording] Started recording match ${
          match.id
        } with players: ${playerNames.join(", ")}`,
      );
    } catch {}
  }

  function recordMatchAction(
    matchId: string,
    patch: MatchPatch | null,
    playerId: string,
  ): void {
    const recording = matchRecordings.get(matchId);
    if (!recording) {
      try {
        console.log(`[Recording] No recording found for match ${matchId}`);
      } catch {}
      return;
    }

    const timestamp = Date.now();
    recording.actions.push({
      patch,
      timestamp,
      playerId,
    });

    // Persist action to Redis stream for cross-instance continuity (fire and forget)
    if (redisState?.isEnabled()) {
      redisState
        .recordAction(matchId, { patch, playerId, timestamp })
        .catch(() => {
          // Silently fail - local recording is primary
        });
    }
    try {
      if (patch && typeof patch === "object") {
        const plays: Array<{ owner: 1 | 2; cardId: number }> = [];
        const p = patch as Record<string, unknown>;
        const per = p.permanents as Record<string, unknown> | undefined;
        if (per && typeof per === "object") {
          for (const value of Object.values(per)) {
            const arr = Array.isArray(value) ? (value as unknown[]) : [];
            for (const entry of arr) {
              if (!entry || typeof entry !== "object") continue;
              const e = entry as Record<string, unknown>;
              const card = e.card as Record<string, unknown> | undefined;
              const ownerVal = e.owner as unknown;
              const owner: 1 | 2 | null =
                ownerVal === 2 ? 2 : ownerVal === 1 ? 1 : null;
              const cardIdRaw = card ? (card.cardId as unknown) : null;
              const cardId =
                typeof cardIdRaw === "number" ? cardIdRaw : Number(cardIdRaw);
              if (owner && Number.isFinite(cardId)) {
                plays.push({ owner, cardId: Number(cardId) });
              }
            }
          }
        }
        const board = p.board as Record<string, unknown> | undefined;
        const sites =
          board && typeof board.sites === "object"
            ? (board.sites as Record<string, unknown>)
            : null;
        if (sites) {
          for (const tile of Object.values(sites)) {
            if (!tile || typeof tile !== "object") continue;
            const t = tile as Record<string, unknown>;
            const card = t.card as Record<string, unknown> | undefined;
            if (!card || typeof card !== "object") continue;
            const ownerVal = t.owner as unknown;
            const owner: 1 | 2 | null =
              ownerVal === 2 ? 2 : ownerVal === 1 ? 1 : null;
            const cardIdRaw = card.cardId as unknown;
            const cardId =
              typeof cardIdRaw === "number" ? cardIdRaw : Number(cardIdRaw);
            if (owner && Number.isFinite(cardId)) {
              plays.push({ owner, cardId: Number(cardId) });
            }
          }
        }
        const avatars = p.avatars as Record<string, unknown> | undefined;
        if (avatars && typeof avatars === "object") {
          for (const seatKey of ["p1", "p2"]) {
            const seat = seatKey as "p1" | "p2";
            const av = (avatars as Record<string, unknown>)[seat] as
              | Record<string, unknown>
              | undefined;
            const card =
              av && typeof av === "object"
                ? (av.card as Record<string, unknown> | undefined)
                : undefined;
            const cardIdRaw = card ? (card.cardId as unknown) : null;
            const cardId =
              typeof cardIdRaw === "number" ? cardIdRaw : Number(cardIdRaw);
            if (Number.isFinite(cardId)) {
              plays.push({
                owner: seat === "p1" ? 1 : 2,
                cardId: Number(cardId),
              });
            }
          }
        }
        const zones = p.zones as Record<string, unknown> | undefined;
        if (zones && typeof zones === "object") {
          for (const seatKey of Object.keys(zones)) {
            if (seatKey !== "p1" && seatKey !== "p2") continue;
            const seat = seatKey as "p1" | "p2";
            const nextSeatZones =
              (zones[seat] as Record<string, unknown>) || {};
            const prevSeatZones =
              (recording.lastZones && recording.lastZones[seat]) || null;
            const piles = [
              "hand",
              "atlas",
              "spellbook",
              "graveyard",
              "battlefield",
              "banished",
            ] as const;
            const toIds = (arr: unknown): string[] =>
              Array.isArray(arr)
                ? (arr as unknown[])
                    .map((it) =>
                      it && typeof it === "object"
                        ? ((it as Record<string, unknown>)
                            .instanceId as unknown)
                        : null,
                    )
                    .map((v) => (typeof v === "string" ? v : null))
                    .filter((v): v is string => !!v)
                : [];
            const prevByPile: Record<
              string,
              { ids: Set<string>; byId: Map<string, Record<string, unknown>> }
            > = {};
            const nextByPile: Record<
              string,
              { ids: Set<string>; byId: Map<string, Record<string, unknown>> }
            > = {};
            for (const pile of piles) {
              const prevArr =
                prevSeatZones &&
                Array.isArray((prevSeatZones as Record<string, unknown>)[pile])
                  ? ((prevSeatZones as Record<string, unknown>)[
                      pile
                    ] as unknown[])
                  : [];
              const nextArr = Array.isArray(
                (nextSeatZones as Record<string, unknown>)[pile],
              )
                ? ((nextSeatZones as Record<string, unknown>)[
                    pile
                  ] as unknown[])
                : [];
              const prevIds = toIds(prevArr);
              const nextIds = toIds(nextArr);
              const prevMap = new Map<string, Record<string, unknown>>();
              const nextMap = new Map<string, Record<string, unknown>>();
              for (const item of prevArr) {
                if (!item || typeof item !== "object") continue;
                const id = (item as Record<string, unknown>).instanceId;
                if (typeof id === "string")
                  prevMap.set(id, item as Record<string, unknown>);
              }
              for (const item of nextArr) {
                if (!item || typeof item !== "object") continue;
                const id = (item as Record<string, unknown>).instanceId;
                if (typeof id === "string")
                  nextMap.set(id, item as Record<string, unknown>);
              }
              prevByPile[pile] = { ids: new Set(prevIds), byId: prevMap };
              nextByPile[pile] = { ids: new Set(nextIds), byId: nextMap };
            }
            const originPiles = ["hand", "atlas", "spellbook"] as const;
            for (const origin of originPiles) {
              const removed = Array.from(prevByPile[origin].ids).filter(
                (id) => !nextByPile[origin].ids.has(id),
              );
              for (const instId of removed) {
                const stillInOriginPiles = originPiles.some((pile) =>
                  nextByPile[pile].ids.has(instId),
                );
                if (stillInOriginPiles) continue;
                const playedToGraveOrBanished =
                  nextByPile["graveyard"].ids.has(instId) ||
                  nextByPile["banished"].ids.has(instId);
                const onBattlefield = nextByPile["battlefield"].ids.has(instId);
                if (playedToGraveOrBanished || onBattlefield) {
                  let cardIdNum: number | null = null;
                  const prevItem = prevByPile[origin].byId.get(instId) || null;
                  const srcCard =
                    prevItem && typeof prevItem.card === "object"
                      ? (prevItem.card as Record<string, unknown>)
                      : null;
                  const raw = srcCard ? (srcCard.cardId as unknown) : null;
                  const cid = typeof raw === "number" ? raw : Number(raw);
                  if (Number.isFinite(cid)) cardIdNum = Number(cid);
                  if (!cardIdNum) {
                    const lookup = (pile: string) =>
                      nextByPile[pile].byId.get(instId);
                    const candidate =
                      lookup("graveyard") ||
                      lookup("banished") ||
                      lookup("battlefield") ||
                      null;
                    const candCard =
                      candidate && typeof candidate.card === "object"
                        ? (candidate.card as Record<string, unknown>)
                        : null;
                    const raw2 = candCard ? (candCard.cardId as unknown) : null;
                    const cid2 = typeof raw2 === "number" ? raw2 : Number(raw2);
                    if (Number.isFinite(cid2)) cardIdNum = Number(cid2);
                  }
                  if (cardIdNum) {
                    plays.push({
                      owner: seat === "p1" ? 1 : 2,
                      cardId: cardIdNum,
                    });
                  }
                }
              }
            }
            if (!recording.lastZones) recording.lastZones = {};
            recording.lastZones[seat] = nextSeatZones as Record<
              string,
              unknown
            >;
          }
        }
        if (avatars && typeof avatars === "object") {
          if (!recording.lastAvatars) recording.lastAvatars = {};
          for (const seatKey of ["p1", "p2"]) {
            const seat = seatKey as "p1" | "p2";
            const av = (avatars as Record<string, unknown>)[seat] as
              | Record<string, unknown>
              | undefined;
            if (av) recording.lastAvatars[seat] = av;
          }
        }
        if (plays.length > 0) {
          const acc = (recording.cardPlays ||= {
            p1: new Set<number>(),
            p2: new Set<number>(),
          });
          for (const it of plays) {
            const seat = seatFromOwner(it.owner);
            acc[seat].add(it.cardId);
          }
        }
      }
    } catch {}
    try {
      console.log(
        `[Recording] Recorded action ${recording.actions.length} for match ${matchId} by player ${playerId}`,
      );
    } catch {}
  }

  function finishMatchRecording(matchId: string): void {
    const recording = matchRecordings.get(matchId);
    if (!recording) return;

    recording.endTime = Date.now();

    // Mark recording as finished in Redis (fire and forget)
    if (redisState?.isEnabled()) {
      redisState.finishRecording(matchId).catch(() => {
        // Silently fail - local recording is primary
      });
    }

    try {
      console.log(
        `[Recording] Finished recording match ${matchId}, total actions: ${recording.actions.length}`,
      );
    } catch {}
  }

  /**
   * Truncate recording actions after a given timestamp.
   * Called when a snapshot is restored to invalidate the undone timeline.
   * Returns the number of actions removed.
   */
  function truncateRecordingAfter(
    matchId: string,
    afterTimestamp: number,
  ): number {
    const recording = matchRecordings.get(matchId);
    if (!recording) {
      try {
        console.log(
          `[Recording] No recording found for match ${matchId} to truncate`,
        );
      } catch {}
      return 0;
    }

    const originalLength = recording.actions.length;
    // Keep only actions with timestamp <= afterTimestamp
    recording.actions = recording.actions.filter(
      (action) => action.timestamp <= afterTimestamp,
    );
    const removedCount = originalLength - recording.actions.length;

    if (removedCount > 0) {
      try {
        console.log(
          `[Recording] Truncated ${removedCount} actions after timestamp ${afterTimestamp} for match ${matchId}, remaining: ${recording.actions.length}`,
        );
      } catch {}
    }

    return removedCount;
  }

  return {
    startMatchRecording,
    recordMatchAction,
    finishMatchRecording,
    truncateRecordingAfter,
  };
}
