"use strict";

import type { PrismaClient } from "@prisma/client";
import {
  applyDecay,
  expectedScore,
  LADDER,
  repeatMultiplier,
  type RatedMode,
  type UnratedReason,
} from "./rating-model";

/**
 * Records a finished match as a MatchResult row and applies the rating
 * model's delta to the all_time entries right away so players see movement
 * immediately. The scheduled replay (`./replay.ts`) is authoritative and
 * overwrites these numbers (adding the per-opponent cap, ranks, windows).
 */

type PlayersMap = Map<string, { displayName?: string | null }>;

interface MatchRecording {
  matchId: string;
  playerNames: string[];
  startTime: number;
  endTime?: number;
  actions: Array<{ patch: unknown; timestamp: number; playerId: string }>;
}

type MatchRecordingsMap = Map<string, MatchRecording>;

type GameFormat = "constructed" | "sealed" | "draft";

interface LeaderboardServiceDeps {
  prisma: PrismaClient;
  players: PlayersMap;
  matchRecordings: MatchRecordingsMap;
  /** Fired after a row is written; the scheduler debounces a replay. */
  onRecorded?: (format: GameFormat) => void;
}

interface PlayerInfo {
  id: string;
  displayName: string;
}

export interface LeaderboardMatchPayload {
  winnerId?: string | null;
  loserId?: string | null;
  tournamentId?: string | null;
  isDraw?: boolean;
  rated?: boolean;
  ratedMode?: RatedMode;
  unratedReason?: UnratedReason | null;
  endReason?: string | null;
  turnCount?: number | null;
  durationSec?: number | null;
  ipHashes?: Record<string, string> | null;
  sameNetwork?: boolean;
}

interface MatchLike {
  id: string;
  matchType: string;
  playerIds: string[];
  lobbyName?: string | null;
  tournamentId?: string | null;
  winnerId?: string | null;
  _leaderboardRecorded?: boolean;
  [key: string]: unknown;
}

const CPU_PREFIX = "cpu_";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

export function createLeaderboardService({
  prisma,
  players,
  matchRecordings,
  onRecorded,
}: LeaderboardServiceDeps) {
  if (!prisma) throw new Error("createLeaderboardService requires prisma");
  if (!players)
    throw new Error("createLeaderboardService requires players map");
  if (!matchRecordings) {
    throw new Error("createLeaderboardService requires matchRecordings map");
  }

  type LeaderboardEntryModel = Awaited<
    ReturnType<typeof prisma.leaderboardEntry.findMany>
  >[number];

  async function resolvePlayerDisplayName(playerId: string): Promise<string> {
    const cached = players.get(playerId);
    if (cached && cached.displayName) return cached.displayName;
    try {
      const user = await prisma.user.findUnique({
        where: { id: playerId },
        select: { name: true },
      });
      if (user && user.name) return user.name;
    } catch {
      // ignore lookup failure
    }
    return playerId;
  }

  async function getOrCreateEntry(
    playerId: string,
    displayName: string | undefined,
    format: GameFormat,
  ): Promise<LeaderboardEntryModel> {
    const existing = await prisma.leaderboardEntry.findUnique({
      where: {
        playerId_format_timeFrame: { playerId, format, timeFrame: "all_time" },
      },
    });
    if (existing) return existing;
    return prisma.leaderboardEntry.create({
      data: {
        playerId,
        displayName: displayName || playerId,
        format,
        timeFrame: "all_time",
        rating: LADDER.BASE,
      },
    });
  }

  /** Rated games between the pair inside the repeat window, excluding this match. */
  async function countRecentPairGames(
    a: string,
    b: string,
    format: GameFormat,
    excludeMatchId: string,
    now: number,
  ): Promise<number> {
    try {
      return await prisma.matchResult.count({
        where: {
          format,
          rated: true,
          matchId: { not: excludeMatchId },
          completedAt: { gt: new Date(now - LADDER.REPEAT_WINDOW_MS) },
          OR: [
            { winnerId: a, loserId: b },
            { winnerId: b, loserId: a },
            { isDraw: true, players: { array_contains: [{ id: a }, { id: b }] } },
          ],
        },
      });
    } catch {
      return 0;
    }
  }

  interface SideUpdate {
    entry: LeaderboardEntryModel;
    displayName: string | undefined;
    score: number;
    outcome: "w" | "l" | "d";
    /** false for a leaver_only winner: activity only, no rating/record change */
    moves: boolean;
  }

  async function applyLiveDelta(
    match: MatchLike,
    format: GameFormat,
    sides: [SideUpdate, SideUpdate],
    isTournament: boolean,
    now: number,
  ): Promise<void> {
    const [a, b] = sides;
    const prior = await countRecentPairGames(
      a.entry.playerId,
      b.entry.playerId,
      format,
      match.id,
      now,
    );
    const mult = repeatMultiplier(prior, isTournament);
    const toMs = (d: Date | null | undefined): number | null =>
      d instanceof Date ? d.getTime() : null;
    const ratingA = applyDecay(a.entry.rating, toMs(a.entry.lastRatedAt), now);
    const ratingB = applyDecay(b.entry.rating, toMs(b.entry.lastRatedAt), now);

    const updates = [
      [a, ratingA, ratingB],
      [b, ratingB, ratingA],
    ] as Array<[SideUpdate, number, number]>;
    const ops = updates.map(([side, own, other]) => {
      const base = {
        lastActive: new Date(now),
        displayName: side.displayName || side.entry.displayName,
      };
      if (!side.moves) {
        // leaver_only winner: presence only. No rating, no record, and no
        // lastRatedAt bump (that would reset their inactivity decay).
        return prisma.leaderboardEntry.update({
          where: { id: side.entry.id },
          data: base,
        });
      }
      const delta = Math.round(
        LADDER.K * mult * (side.score - expectedScore(own, other)),
      );
      const wins = side.entry.wins + (side.outcome === "w" ? 1 : 0);
      const losses = side.entry.losses + (side.outcome === "l" ? 1 : 0);
      const draws = side.entry.draws + (side.outcome === "d" ? 1 : 0);
      const total = wins + losses + draws;
      return prisma.leaderboardEntry.update({
        where: { id: side.entry.id },
        data: {
          ...base,
          lastRatedAt: new Date(now),
          wins,
          losses,
          draws,
          winRate: total > 0 ? wins / total : 0,
          rating: own + delta,
          ratedGames: { increment: 1 },
        },
      });
    });
    await prisma.$transaction(ops);
  }

  async function recordMatchResult(
    match: MatchLike,
    payload: LeaderboardMatchPayload = {},
  ): Promise<void> {
    try {
      if (!match || !match.id) {
        console.warn(`[leaderboard] recordMatchResult: invalid match object`);
        return;
      }
      if (match._leaderboardRecorded) {
        console.log(
          `[leaderboard] recordMatchResult: already recorded for ${match.id}`,
        );
        return;
      }

      const validFormats = new Set<GameFormat>([
        "constructed",
        "sealed",
        "draft",
      ]);
      const format: GameFormat = validFormats.has(match.matchType as GameFormat)
        ? (match.matchType as GameFormat)
        : "constructed";

      const playerIds: string[] = Array.isArray(match.playerIds)
        ? match.playerIds
        : [];
      if (playerIds.length === 0) {
        console.warn(
          `[leaderboard] recordMatchResult: no playerIds for ${match.id}`,
        );
        match._leaderboardRecorded = true;
        return;
      }

      // Require at least 2 distinct human players: solo/hotseat/CPU games
      // never reach the ladder or the result history.
      const uniqueHumanPlayers = new Set(
        playerIds.filter((pid) => !pid.startsWith(CPU_PREFIX)),
      );
      if (uniqueHumanPlayers.size < 2) {
        console.log(
          `[leaderboard] recordMatchResult: skipping match ${match.id} - requires 2 distinct human players, found ${uniqueHumanPlayers.size}`,
        );
        match._leaderboardRecorded = true;
        return;
      }

      const playerInfos: PlayerInfo[] = await Promise.all(
        playerIds.map(async (pid) => ({
          id: pid,
          displayName: await resolvePlayerDisplayName(pid),
        })),
      );
      const infoById = new Map<string, string>(
        playerInfos.map((info) => [info.id, info.displayName]),
      );

      const now = Date.now();
      let durationSeconds: number | null =
        typeof payload.durationSec === "number" &&
        Number.isFinite(payload.durationSec)
          ? Math.max(0, Math.round(payload.durationSec))
          : null;
      if (durationSeconds === null) {
        const recording = matchRecordings.get(match.id);
        if (recording && typeof recording.startTime === "number") {
          const endTime = recording.endTime ?? now;
          durationSeconds = Math.max(
            0,
            Math.round((endTime - recording.startTime) / 1000),
          );
        }
      }

      const isDraw = payload.isDraw === true;
      let winnerId =
        typeof payload.winnerId === "string"
          ? payload.winnerId
          : typeof match.winnerId === "string"
            ? match.winnerId
            : null;
      let loserId =
        typeof payload.loserId === "string" ? payload.loserId : null;
      if (isDraw || !winnerId) {
        winnerId = null;
        loserId = null;
      } else if (!loserId) {
        loserId = playerInfos.find((info) => info.id !== winnerId)?.id ?? null;
      }

      const tournamentId =
        typeof payload.tournamentId === "string"
          ? payload.tournamentId
          : typeof match.tournamentId === "string"
            ? match.tournamentId
            : null;

      // Participants that must exist as User rows for the result to be ratable
      // (and for the FK on winner/loser to hold).
      const ratedParticipants = isDraw
        ? playerInfos.map((p) => p.id)
        : [winnerId, loserId].filter((v): v is string => typeof v === "string");
      const existingUsers = (await prisma.user.findMany({
        where: { id: { in: ratedParticipants } },
        select: { id: true },
      })) as Array<{ id: string }>;
      const existingIds = new Set(existingUsers.map((u) => u.id));
      const missingUser = ratedParticipants.some((id) => !existingIds.has(id));

      let rated = payload.rated !== false;
      let ratedMode: RatedMode =
        payload.ratedMode === "leaver_only" ? "leaver_only" : "full";
      let unratedReason: UnratedReason | null = payload.unratedReason ?? null;
      if (rated && (!isDraw && (!winnerId || !loserId))) {
        rated = false;
        unratedReason = unratedReason ?? "missing_user";
      }
      if (rated && missingUser) {
        rated = false;
        unratedReason = "missing_user";
      }
      if (rated && match.matchType === "precon") {
        rated = false;
        unratedReason = "precon";
      }
      if (!rated) ratedMode = "full";

      // FK safety: a winner/loser without a User row cannot be referenced.
      const safeWinnerId = winnerId && existingIds.has(winnerId) ? winnerId : null;
      const safeLoserId = loserId && existingIds.has(loserId) ? loserId : null;

      try {
        await prisma.matchResult.create({
          data: {
            matchId: match.id,
            lobbyName: match.lobbyName ?? null,
            winnerId: safeWinnerId,
            loserId: safeLoserId,
            isDraw,
            format,
            isPrecon: match.matchType === "precon",
            players: playerInfos.map((info) => ({
              id: info.id,
              displayName: info.displayName,
            })),
            tournamentId,
            completedAt: new Date(now),
            duration: durationSeconds,
            rated,
            ratedMode,
            unratedReason,
            endReason: payload.endReason ?? null,
            turnCount:
              typeof payload.turnCount === "number" &&
              Number.isFinite(payload.turnCount)
                ? Math.round(payload.turnCount)
                : null,
            ipHashes: payload.ipHashes ?? undefined,
            sameNetwork: payload.sameNetwork === true,
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          console.log(
            `[leaderboard] recordMatchResult: result already stored for ${match.id}`,
          );
          match._leaderboardRecorded = true;
          return;
        }
        throw err;
      }
      match._leaderboardRecorded = true;

      if (!rated) {
        console.log(
          `[leaderboard] recordMatchResult: ${match.id} stored unrated (${unratedReason ?? "unknown"})`,
        );
        return;
      }

      if (isDraw) {
        const [p1, p2] = playerInfos;
        const [e1, e2] = await Promise.all([
          getOrCreateEntry(p1.id, p1.displayName, format),
          getOrCreateEntry(p2.id, p2.displayName, format),
        ]);
        await applyLiveDelta(
          match,
          format,
          [
            { entry: e1, displayName: p1.displayName, score: 0.5, outcome: "d", moves: true },
            { entry: e2, displayName: p2.displayName, score: 0.5, outcome: "d", moves: true },
          ],
          tournamentId !== null,
          now,
        );
      } else if (winnerId && loserId) {
        const [winnerEntry, loserEntry] = await Promise.all([
          getOrCreateEntry(winnerId, infoById.get(winnerId), format),
          getOrCreateEntry(loserId, infoById.get(loserId), format),
        ]);
        await applyLiveDelta(
          match,
          format,
          [
            {
              entry: winnerEntry,
              displayName: infoById.get(winnerId),
              score: 1,
              outcome: "w",
              moves: ratedMode !== "leaver_only",
            },
            {
              entry: loserEntry,
              displayName: infoById.get(loserId),
              score: 0,
              outcome: "l",
              moves: true,
            },
          ],
          tournamentId !== null,
          now,
        );
      }

      console.log(
        `[leaderboard] recordMatchResult: recorded ${match.id} (${ratedMode})`,
      );
      if (onRecorded) {
        try {
          onRecorded(format);
        } catch {
          // scheduler failures must not affect the match flow
        }
      }
    } catch (err) {
      try {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[leaderboard] failed to record result for ${
            match && match.id ? match.id : "unknown"
          }:`,
          message,
        );
      } catch {
        // ignore logging failure
      }
    }
  }

  return {
    recordMatchResult,
  };
}
