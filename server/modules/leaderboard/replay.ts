"use strict";

import type { PrismaClient } from "@prisma/client";
import {
  LADDER,
  LADDER_TIME_FRAMES,
  replayGames,
  summarize,
  type LadderGame,
  type LadderRow,
  type LadderTimeFrame,
  type RatedMode,
} from "./rating-model";

/**
 * Authoritative ladder recompute: replays every rated MatchResult through the
 * pure rating model and rewrites LeaderboardEntry for all three timeframes.
 * Idempotent, so running it on several instances is harmless.
 */

export type LadderFormat = "constructed" | "sealed" | "draft";
const LADDER_FORMATS: readonly LadderFormat[] = ["constructed", "sealed", "draft"];

const UPSERT_CHUNK = 100;

interface MatchResultRow {
  id: string;
  matchId: string;
  winnerId: string | null;
  loserId: string | null;
  isDraw: boolean;
  ratedMode: string;
  tournamentId: string | null;
  completedAt: Date;
  players: unknown;
}

interface UserRow {
  id: string;
  name: string | null;
  isGuest: boolean;
  ladderExcluded: boolean;
}

interface TournamentRow {
  id: string;
  format: string;
  standings: Array<{ playerId: string }>;
}

export interface RecomputeSummary {
  formats: number;
  players: number;
  games: number;
  skippedGames: number;
  ms: number;
}

export interface RecomputeOptions {
  now?: number;
  formats?: readonly LadderFormat[];
  log?: (message: string) => void;
}

function playerIdsFromJson(players: unknown): Array<{ id: string; displayName: string | null }> {
  if (!Array.isArray(players)) return [];
  const out: Array<{ id: string; displayName: string | null }> = [];
  for (const p of players) {
    if (!p || typeof p !== "object") continue;
    const rec = p as Record<string, unknown>;
    if (typeof rec.id !== "string" || !rec.id) continue;
    out.push({
      id: rec.id,
      displayName: typeof rec.displayName === "string" ? rec.displayName : null,
    });
  }
  return out;
}

function tournamentFormatToLadder(format: string): LadderFormat {
  return format === "draft" || format === "sealed" ? format : "constructed";
}

async function loadTournamentWins(
  prisma: PrismaClient,
): Promise<Map<LadderFormat, Map<string, number>>> {
  const byFormat = new Map<LadderFormat, Map<string, number>>();
  for (const f of LADDER_FORMATS) byFormat.set(f, new Map());
  const tournaments = (await prisma.tournament.findMany({
    where: { status: "completed" },
    select: {
      id: true,
      format: true,
      standings: {
        orderBy: [
          { matchPoints: "desc" },
          { gameWinPercentage: "desc" },
          { opponentMatchWinPercentage: "desc" },
        ],
        take: 1,
        select: { playerId: true },
      },
    },
  })) as TournamentRow[];
  for (const t of tournaments) {
    const winner = t.standings[0]?.playerId;
    if (!winner) continue;
    const bucket = byFormat.get(tournamentFormatToLadder(String(t.format)));
    if (!bucket) continue;
    bucket.set(winner, (bucket.get(winner) ?? 0) + 1);
  }
  return byFormat;
}

export async function recomputeLadder(
  prisma: PrismaClient,
  opts: RecomputeOptions = {},
): Promise<RecomputeSummary> {
  const started = Date.now();
  const now = opts.now ?? started;
  const formats = opts.formats ?? LADDER_FORMATS;
  const log = opts.log ?? ((message: string) => console.log(message));

  const tournamentWins = await loadTournamentWins(prisma);
  let totalPlayers = 0;
  let totalGames = 0;
  let totalSkipped = 0;

  for (const format of formats) {
    const rows = (await prisma.matchResult.findMany({
      where: {
        // "open" matches are played with constructed-legal decks
        format: format === "constructed" ? { in: ["constructed", "open"] } : format,
        rated: true,
        isPrecon: false,
      },
      select: {
        id: true,
        matchId: true,
        winnerId: true,
        loserId: true,
        isDraw: true,
        ratedMode: true,
        tournamentId: true,
        completedAt: true,
        players: true,
      },
      orderBy: [{ completedAt: "asc" }, { id: "asc" }],
    })) as MatchResultRow[];

    const nameFallback = new Map<string, string>();
    const participantIds = new Set<string>();
    const parsed = rows.map((row) => {
      const listed = playerIdsFromJson(row.players);
      for (const p of listed) {
        participantIds.add(p.id);
        if (p.displayName && !nameFallback.has(p.id)) nameFallback.set(p.id, p.displayName);
      }
      if (row.winnerId) participantIds.add(row.winnerId);
      if (row.loserId) participantIds.add(row.loserId);
      return { row, listed };
    });

    const users =
      participantIds.size > 0
        ? ((await prisma.user.findMany({
            where: { id: { in: Array.from(participantIds) } },
            select: { id: true, name: true, isGuest: true, ladderExcluded: true },
          })) as UserRow[])
        : [];
    const eligible = new Map<string, UserRow>();
    for (const u of users) {
      if (!u.isGuest && !u.ladderExcluded) eligible.set(u.id, u);
    }

    const games: LadderGame[] = [];
    let skipped = 0;
    for (const { row, listed } of parsed) {
      const ids = row.isDraw
        ? listed.map((p) => p.id)
        : [row.winnerId, row.loserId].filter((v): v is string => typeof v === "string");
      const unique = Array.from(new Set(ids));
      if (unique.length !== 2 || unique.some((id) => !eligible.has(id))) {
        skipped += 1;
        continue;
      }
      games.push({
        matchId: row.matchId,
        completedAt: row.completedAt.getTime(),
        playerIds: unique,
        winnerId: row.isDraw ? null : row.winnerId,
        loserId: row.isDraw ? null : row.loserId,
        isDraw: row.isDraw,
        rated: true,
        ratedMode: row.ratedMode === "leaver_only" ? "leaver_only" : ("full" as RatedMode),
        tournamentId: row.tournamentId,
      });
    }

    const state = replayGames(games);
    const wins = tournamentWins.get(format) ?? new Map<string, number>();
    const displayName = (playerId: string): string =>
      eligible.get(playerId)?.name || nameFallback.get(playerId) || playerId;

    let playersWritten = 0;
    for (const timeFrame of LADDER_TIME_FRAMES) {
      const ladderRows = summarize(state, now, LADDER.WINDOW_MS[timeFrame]);
      await writeTimeFrame(prisma, format, timeFrame, ladderRows, displayName, wins);
      if (timeFrame === "all_time") playersWritten = ladderRows.length;
    }

    totalPlayers += playersWritten;
    totalGames += games.length;
    totalSkipped += skipped;
  }

  const summary: RecomputeSummary = {
    formats: formats.length,
    players: totalPlayers,
    games: totalGames,
    skippedGames: totalSkipped,
    ms: Date.now() - started,
  };
  log(
    `[ladder] recomputed ${summary.formats} formats: ${summary.players} players, ${summary.games} games (${summary.skippedGames} skipped) in ${summary.ms}ms`,
  );
  return summary;
}

async function writeTimeFrame(
  prisma: PrismaClient,
  format: LadderFormat,
  timeFrame: LadderTimeFrame,
  rows: LadderRow[],
  displayName: (playerId: string) => string,
  tournamentWins: Map<string, number>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    await prisma.$transaction(
      chunk.map((row) => {
        const data = {
          displayName: displayName(row.playerId),
          rating: row.rating,
          wins: row.wins,
          losses: row.losses,
          draws: row.draws,
          winRate: row.winRate,
          rank: row.rank,
          tournamentWins: tournamentWins.get(row.playerId) ?? 0,
          uniqueOpponents: row.uniqueOpponents,
          ratedGames: row.ratedGames,
          provisional: row.provisional,
          lastRatedAt: row.lastRatedAt === null ? null : new Date(row.lastRatedAt),
          lastActive: new Date(row.lastActive ?? row.lastRatedAt ?? Date.now()),
        };
        return prisma.leaderboardEntry.upsert({
          where: {
            playerId_format_timeFrame: { playerId: row.playerId, format, timeFrame },
          },
          create: { playerId: row.playerId, format, timeFrame, ...data },
          update: data,
        });
      }),
    );
  }
  await prisma.leaderboardEntry.deleteMany({
    where: {
      format,
      timeFrame,
      playerId: { notIn: rows.map((r) => r.playerId) },
    },
  });
}
