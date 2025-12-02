"use strict";

import type { PrismaClient } from "@prisma/client";

type PlayersMap = Map<string, { displayName?: string | null }>;

interface MatchRecording {
  matchId: string;
  playerNames: string[];
  startTime: number;
  endTime?: number;
  actions: Array<{ patch: unknown; timestamp: number; playerId: string }>;
}

type MatchRecordingsMap = Map<string, MatchRecording>;

interface LeaderboardServiceDeps {
  prisma: PrismaClient;
  players: PlayersMap;
  matchRecordings: MatchRecordingsMap;
}

const TIME_FRAMES = ["all_time", "monthly", "weekly"] as const;
type TimeFrame = (typeof TIME_FRAMES)[number];

type GameFormat = "constructed" | "sealed" | "draft";
interface PlayerInfo {
  id: string;
  displayName: string;
}

interface LeaderboardMatchPayload {
  winnerId?: string | null;
  loserId?: string | null;
  tournamentId?: string | null;
  isDraw?: boolean;
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

const DEFAULT_RATING = 1200;
const K_FACTOR = 32;
const CPU_PREFIX = "cpu_";

function calculateExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function calculateNewRatings(
  winnerRating: number,
  loserRating: number,
  isDraw = false
): { newWinnerRating: number; newLoserRating: number } {
  const expectedWinner = calculateExpectedScore(winnerRating, loserRating);
  const expectedLoser = calculateExpectedScore(loserRating, winnerRating);

  const actualWinner = isDraw ? 0.5 : 1;
  const actualLoser = isDraw ? 0.5 : 0;

  const newWinnerRating = Math.round(
    winnerRating + K_FACTOR * (actualWinner - expectedWinner)
  );
  const newLoserRating = Math.round(
    loserRating + K_FACTOR * (actualLoser - expectedLoser)
  );

  return { newWinnerRating, newLoserRating };
}

export function createLeaderboardService({
  prisma,
  players,
  matchRecordings,
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
    timeFrame: TimeFrame
  ): Promise<LeaderboardEntryModel> {
    const existing = await prisma.leaderboardEntry.findUnique({
      where: {
        playerId_format_timeFrame: {
          playerId,
          format,
          timeFrame,
        },
      },
    });

    if (existing) {
      if (displayName && existing.displayName !== displayName) {
        try {
          await prisma.leaderboardEntry.update({
            where: { id: existing.id },
            data: { displayName },
          });
        } catch {
          // ignore update failure
        }
      }
      return existing;
    }

    return prisma.leaderboardEntry.create({
      data: {
        playerId,
        displayName: displayName || playerId,
        format,
        timeFrame,
        rating: DEFAULT_RATING,
      },
    });
  }

  async function checkTournamentWin(
    tournamentId: string | null,
    playerId: string | null
  ): Promise<boolean> {
    if (!tournamentId || !playerId) return false;
    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          standings: {
            where: { playerId },
            take: 1,
          },
        },
      });

      if (
        !tournament ||
        tournament.status !== "completed" ||
        !tournament.standings[0]
      ) {
        return false;
      }

      const topStanding = await prisma.playerStanding.findFirst({
        where: { tournamentId },
        orderBy: [
          { matchPoints: "desc" },
          { gameWinPercentage: "desc" },
          { opponentMatchWinPercentage: "desc" },
        ],
      });

      return topStanding?.playerId === playerId;
    } catch {
      return false;
    }
  }

  async function recalculateRanks(format: GameFormat): Promise<void> {
    for (const timeFrame of TIME_FRAMES) {
      const entries = await prisma.leaderboardEntry.findMany({
        where: { format, timeFrame },
        orderBy: [{ rating: "desc" }, { winRate: "desc" }, { wins: "desc" }],
      });
      if (entries.length === 0) continue;

      await Promise.all(
        entries.map((entry: LeaderboardEntryModel, index: number) =>
          prisma.leaderboardEntry.update({
            where: { id: entry.id },
            data: { rank: index + 1 },
          })
        )
      );
    }
  }

  async function recordMatchResult(
    match: MatchLike,
    payload: LeaderboardMatchPayload = {}
  ): Promise<void> {
    try {
      if (!match || !match.id) {
        console.warn(`[leaderboard] recordMatchResult: invalid match object`);
        return;
      }
      if (match._leaderboardRecorded) {
        console.log(
          `[leaderboard] recordMatchResult: already recorded for ${match.id}`
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
          `[leaderboard] recordMatchResult: no playerIds for ${match.id}`
        );
        match._leaderboardRecorded = true;
        return;
      }

      const playerInfos: PlayerInfo[] = await Promise.all(
        playerIds.map(async (pid) => ({
          id: pid,
          displayName: await resolvePlayerDisplayName(pid),
        }))
      );
      if (playerInfos.length === 0) {
        match._leaderboardRecorded = true;
        return;
      }

      const infoById = new Map<string, string>(
        playerInfos.map((info) => [info.id, info.displayName])
      );
      const recording = matchRecordings.get(match.id);
      let durationSeconds: number | null = null;
      if (recording && typeof recording.startTime === "number") {
        const endTime = recording.endTime ?? Date.now();
        durationSeconds = Math.max(
          0,
          Math.round((endTime - recording.startTime) / 1000)
        );
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

      const existingResult = await prisma.matchResult.findFirst({
        where: { matchId: match.id },
      });
      if (!existingResult) {
        const cpuOnly =
          playerInfos.length > 0 &&
          playerInfos.every((info) => info.id.startsWith(CPU_PREFIX));
        if (!cpuOnly) {
          let safeWinnerId = isDraw ? null : winnerId;
          let safeLoserId = isDraw ? null : loserId;

          if (safeWinnerId) {
            const exists = await prisma.user.findUnique({
              where: { id: safeWinnerId },
            });
            if (!exists) safeWinnerId = null;
          }
          if (safeLoserId) {
            const exists = await prisma.user.findUnique({
              where: { id: safeLoserId },
            });
            if (!exists) safeLoserId = null;
          }

          await prisma.matchResult.create({
            data: {
              matchId: match.id,
              lobbyName: match.lobbyName ?? null,
              winnerId: safeWinnerId,
              loserId: safeLoserId,
              format,
              players: playerInfos.map((info) => ({
                id: info.id,
                displayName: info.displayName,
              })),
              tournamentId,
              completedAt: new Date(),
              duration: durationSeconds,
            },
          });
        }
      }

      match._leaderboardRecorded = true;

      if (!winnerId && !loserId && !isDraw) {
        console.warn(
          `[leaderboard] recordMatchResult: no winner/loser/draw for ${match.id}`,
          {
            payloadWinnerId: payload.winnerId,
            payloadLoserId: payload.loserId,
            matchWinnerId: match.winnerId,
            playerIds,
          }
        );
        return;
      }

      const tournamentWin = await checkTournamentWin(tournamentId, winnerId);
      const timeFrames: TimeFrame[] = tournamentWin
        ? [...TIME_FRAMES]
        : ["all_time"];
      let leaderboardUpdated = false;

      if (isDraw) {
        for (const timeFrame of timeFrames) {
          const entries = await Promise.all(
            playerInfos.map((info) =>
              getOrCreateEntry(info.id, info.displayName, format, timeFrame)
            )
          );
          await Promise.all(
            entries.map((entry: LeaderboardEntryModel) =>
              prisma.leaderboardEntry.update({
                where: { id: entry.id },
                data: {
                  draws: { increment: 1 },
                  winRate:
                    entry.wins / (entry.wins + entry.losses + entry.draws + 1),
                  lastActive: new Date(),
                  displayName:
                    infoById.get(entry.playerId) || entry.displayName,
                },
              })
            )
          );
        }
        leaderboardUpdated = true;
      } else if (winnerId && loserId) {
        console.log(
          `[leaderboard] recordMatchResult: updating leaderboard for ${match.id}`,
          {
            winnerId,
            loserId,
            format,
            timeFrames,
          }
        );
        for (const timeFrame of timeFrames) {
          const [winnerEntry, loserEntry] = await Promise.all([
            getOrCreateEntry(
              winnerId,
              infoById.get(winnerId),
              format,
              timeFrame
            ),
            getOrCreateEntry(loserId, infoById.get(loserId), format, timeFrame),
          ]);

          const { newWinnerRating, newLoserRating } = calculateNewRatings(
            winnerEntry.rating,
            loserEntry.rating
          );

          await Promise.all([
            prisma.leaderboardEntry.update({
              where: { id: winnerEntry.id },
              data: {
                wins: { increment: 1 },
                rating: newWinnerRating,
                winRate:
                  (winnerEntry.wins + 1) /
                  (winnerEntry.wins +
                    winnerEntry.losses +
                    winnerEntry.draws +
                    1),
                lastActive: new Date(),
                displayName: infoById.get(winnerId) || winnerEntry.displayName,
                ...(tournamentWin ? { tournamentWins: { increment: 1 } } : {}),
              },
            }),
            prisma.leaderboardEntry.update({
              where: { id: loserEntry.id },
              data: {
                losses: { increment: 1 },
                rating: newLoserRating,
                winRate:
                  loserEntry.wins /
                  (loserEntry.wins + loserEntry.losses + loserEntry.draws + 1),
                lastActive: new Date(),
                displayName: infoById.get(loserId) || loserEntry.displayName,
              },
            }),
          ]);
        }
        leaderboardUpdated = true;
      }

      if (leaderboardUpdated) {
        await recalculateRanks(format);
        console.log(
          `[leaderboard] recordMatchResult: successfully updated for ${match.id}`
        );
      } else {
        console.warn(
          `[leaderboard] recordMatchResult: no leaderboard update for ${match.id}`,
          {
            winnerId,
            loserId,
            isDraw,
            playerIds,
          }
        );
      }
    } catch (err) {
      try {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[leaderboard] failed to record result for ${
            match && match.id ? match.id : "unknown"
          }:`,
          message
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
