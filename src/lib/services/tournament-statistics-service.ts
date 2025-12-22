/**
 * Tournament Statistics Service
 * Handles tournament statistics calculations, standings, and tiebreakers
 */

import { prisma } from "@/lib/prisma";
import { SWISS_PAIRING } from "@/lib/tournament/constants";
import type {
  TournamentStatisticsResponse,
  TournamentStanding,
  TournamentRoundResponse,
} from "@/lib/tournament/validation";

export interface TiebreakersCalculation extends Record<string, number> {
  opponentMatchWinPercentage: number;
  gameWinPercentage: number;
  opponentGameWinPercentage: number;
}

export class TournamentStatisticsService {
  /**
   * Get complete tournament statistics
   */
  async getTournamentStatistics(
    tournamentId: string
  ): Promise<TournamentStatisticsResponse> {
    const [standings, rounds, overallStats] = await Promise.all([
      this.calculateStandings(tournamentId),
      this.getTournamentRounds(tournamentId),
      this.calculateOverallStats(tournamentId),
    ]);

    return {
      tournamentId,
      standings,
      rounds,
      overallStats,
    };
  }

  /**
   * Calculate current tournament standings with tiebreakers
   */
  async calculateStandings(
    tournamentId: string
  ): Promise<TournamentStanding[]> {
    // Get all player standings
    const playerStandings = await prisma.playerStanding.findMany({
      where: { tournamentId },
      include: {
        player: {
          select: {
            name: true,
          },
        },
      },
    });

    if (playerStandings.length === 0) {
      return [];
    }

    // Calculate tiebreakers for each player
    const standingsWithTiebreakers = await Promise.all(
      playerStandings.map(async (standing) => {
        const tiebreakers = await this.calculateTiebreakers(
          tournamentId,
          standing.playerId
        );

        return {
          playerId: standing.playerId,
          playerName: standing.player.name || "Unknown Player",
          wins: standing.wins,
          losses: standing.losses,
          draws: standing.draws,
          matchPoints: standing.matchPoints,
          tiebreakers,
          finalRanking: standing.isEliminated ? null : 0, // Will be calculated after sorting
        };
      })
    );

    // Sort by match points, then tiebreakers
    const sortedStandings = standingsWithTiebreakers.sort((a, b) => {
      // Primary: Match points (descending)
      if (a.matchPoints !== b.matchPoints) {
        return b.matchPoints - a.matchPoints;
      }

      // Secondary: Opponent match win percentage (descending)
      const aOMW = a.tiebreakers.opponentMatchWinPercentage;
      const bOMW = b.tiebreakers.opponentMatchWinPercentage;
      if (aOMW !== bOMW) {
        return bOMW - aOMW;
      }

      // Tertiary: Game win percentage (descending)
      const aGW = a.tiebreakers.gameWinPercentage;
      const bGW = b.tiebreakers.gameWinPercentage;
      if (aGW !== bGW) {
        return bGW - aGW;
      }

      // Quaternary: Opponent game win percentage (descending)
      const aOGW = a.tiebreakers.opponentGameWinPercentage;
      const bOGW = b.tiebreakers.opponentGameWinPercentage;
      return bOGW - aOGW;
    });

    // Assign rankings (handle ties)
    let currentRank = 1;
    for (let i = 0; i < sortedStandings.length; i++) {
      if (
        i > 0 &&
        !this.areStandingsEqual(sortedStandings[i - 1], sortedStandings[i])
      ) {
        currentRank = i + 1;
      }
      sortedStandings[i].finalRanking = currentRank;
    }

    return sortedStandings;
  }

  /**
   * Calculate tiebreakers for a specific player
   * Optimized: batch-fetches opponent standings instead of N+1 queries
   */
  async calculateTiebreakers(
    tournamentId: string,
    playerId: string
  ): Promise<TiebreakersCalculation> {
    // Get all matches this player participated in
    // Note: SQLite doesn't support array_contains, so we'll use string_contains as workaround
    const matches = await prisma.match.findMany({
      where: {
        tournamentId,
        players: {
          string_contains: `"${playerId}"`,
        },
        status: "completed",
      },
    });

    if (matches.length === 0) {
      return {
        opponentMatchWinPercentage: 0,
        gameWinPercentage: 0,
        opponentGameWinPercentage: 0,
      };
    }

    // Calculate player's game win percentage and collect opponent IDs
    let totalGames = 0;
    let gamesWon = 0;
    const opponentIds = new Set<string>();

    for (const match of matches) {
      const matchPlayers = Array.isArray(match.players) ? match.players : [];
      const results = match.results as Record<string, unknown> | null;

      if (!results || matchPlayers.length < 2) continue;

      // Find opponent ID
      const opponentIdStr = matchPlayers.find((id) => String(id) !== playerId);
      if (opponentIdStr) {
        opponentIds.add(String(opponentIdStr));
      }

      // Count games for this match
      if (
        results &&
        typeof results.player1Wins === "number" &&
        typeof results.player2Wins === "number"
      ) {
        const player1Id = matchPlayers[0];
        const isPlayer1 = player1Id === playerId;

        const playerWins = isPlayer1
          ? results.player1Wins
          : results.player2Wins;
        const playerLosses = isPlayer1
          ? results.player2Wins
          : results.player1Wins;
        const draws = typeof results.draws === "number" ? results.draws : 0;

        gamesWon += playerWins;
        totalGames += playerWins + playerLosses + draws;
      }
    }

    const gameWinPercentage = totalGames > 0 ? gamesWon / totalGames : 0;

    // Batch fetch all opponent standings in a single query
    const opponentStandings =
      opponentIds.size > 0
        ? await prisma.playerStanding.findMany({
            where: {
              tournamentId,
              playerId: { in: Array.from(opponentIds) },
            },
          })
        : [];
    const standingMap = new Map(opponentStandings.map((s) => [s.playerId, s]));

    // Batch fetch opponent matches for game win percentage calculation
    const opponentMatches =
      opponentIds.size > 0
        ? await prisma.match.findMany({
            where: {
              tournamentId,
              status: "completed",
            },
          })
        : [];

    // Pre-calculate opponent game win percentages
    const opponentGameWinPercentages = new Map<string, number>();
    for (const oppId of opponentIds) {
      let oppTotalGames = 0;
      let oppGamesWon = 0;

      for (const match of opponentMatches) {
        const matchPlayers = Array.isArray(match.players) ? match.players : [];
        if (!matchPlayers.some((id) => String(id) === oppId)) continue;

        const results = match.results as Record<string, unknown> | null;
        if (!results || matchPlayers.length < 2) continue;

        if (
          typeof results.player1Wins === "number" &&
          typeof results.player2Wins === "number"
        ) {
          const isPlayer1 = String(matchPlayers[0]) === oppId;
          const oppWins = isPlayer1 ? results.player1Wins : results.player2Wins;
          const oppLosses = isPlayer1
            ? results.player2Wins
            : results.player1Wins;
          const draws = typeof results.draws === "number" ? results.draws : 0;

          oppGamesWon += oppWins;
          oppTotalGames += oppWins + oppLosses + draws;
        }
      }

      opponentGameWinPercentages.set(
        oppId,
        oppTotalGames > 0 ? oppGamesWon / oppTotalGames : 0
      );
    }

    // Calculate opponent match win percentages using pre-fetched data
    let totalOpponentMatchWinPercentage = 0;
    let totalOpponentGameWinPercentage = 0;
    let opponentCount = 0;

    for (const opponentId of opponentIds) {
      const opponentStanding = standingMap.get(opponentId);

      if (opponentStanding) {
        const opponentMatchCount =
          opponentStanding.wins +
          opponentStanding.losses +
          opponentStanding.draws;
        const opponentMatchWinPercentage =
          opponentMatchCount > 0
            ? Math.max(0.33, opponentStanding.wins / opponentMatchCount)
            : 0.33;

        totalOpponentMatchWinPercentage += opponentMatchWinPercentage;

        const oppGameWinPct = opponentGameWinPercentages.get(opponentId) || 0;
        totalOpponentGameWinPercentage += Math.max(0.33, oppGameWinPct);

        opponentCount++;
      }
    }

    const opponentMatchWinPercentage =
      opponentCount > 0 ? totalOpponentMatchWinPercentage / opponentCount : 0;

    const opponentGameWinPercentage =
      opponentCount > 0 ? totalOpponentGameWinPercentage / opponentCount : 0;

    return {
      opponentMatchWinPercentage,
      gameWinPercentage: Math.max(0.33, gameWinPercentage),
      opponentGameWinPercentage,
    };
  }

  /**
   * Calculate a player's game win percentage (for opponent calculations)
   */
  private async calculateOpponentGameWinPercentage(
    tournamentId: string,
    playerId: string
  ): Promise<number> {
    const matches = await prisma.match.findMany({
      where: {
        tournamentId,
        players: {
          path: [],
          string_contains: `"${playerId}"`,
        },
        status: "completed",
      },
    });

    let totalGames = 0;
    let gamesWon = 0;

    for (const match of matches) {
      const matchPlayers = Array.isArray(match.players) ? match.players : [];
      const results = match.results as Record<string, unknown> | null;

      if (!results || matchPlayers.length < 2) continue;

      if (
        results &&
        typeof results.player1Wins === "number" &&
        typeof results.player2Wins === "number"
      ) {
        const player1Id = matchPlayers[0];
        const isPlayer1 = player1Id === playerId;

        const playerWins = isPlayer1
          ? results.player1Wins
          : results.player2Wins;
        const playerLosses = isPlayer1
          ? results.player2Wins
          : results.player1Wins;
        const draws = typeof results.draws === "number" ? results.draws : 0;

        gamesWon += playerWins;
        totalGames += playerWins + playerLosses + draws;
      }
    }

    return totalGames > 0 ? gamesWon / totalGames : 0;
  }

  /**
   * Get tournament rounds with match details
   * Optimized: batch-fetches all player names in a single query instead of N+1
   */
  async getTournamentRounds(
    tournamentId: string
  ): Promise<TournamentRoundResponse[]> {
    const rounds = await prisma.tournamentRound.findMany({
      where: { tournamentId },
      include: {
        matches: true,
      },
      orderBy: {
        roundNumber: "asc",
      },
    });

    // Collect all unique player IDs across all matches
    const allPlayerIds = new Set<string>();
    for (const round of rounds) {
      for (const match of round.matches) {
        const matchPlayers = Array.isArray(match.players) ? match.players : [];
        for (const playerId of matchPlayers) {
          if (playerId) allPlayerIds.add(String(playerId));
        }
      }
    }

    // Batch fetch all players in a single query
    const players =
      allPlayerIds.size > 0
        ? await prisma.user.findMany({
            where: { id: { in: Array.from(allPlayerIds) } },
            select: { id: true, name: true },
          })
        : [];
    const playerMap = new Map(
      players.map((p) => [p.id, p.name || "Unknown Player"])
    );

    // Map rounds without additional queries
    return rounds.map((round) => {
      const matches = round.matches.map((match) => {
        const matchPlayers = Array.isArray(match.players) ? match.players : [];
        const results = match.results as Record<string, unknown> | null;

        const player1Id = matchPlayers[0] ? String(matchPlayers[0]) : "";
        const player2Id = matchPlayers[1] ? String(matchPlayers[1]) : "";
        const player1Name = player1Id
          ? playerMap.get(player1Id) || "Unknown Player"
          : "BYE";
        const player2Name = player2Id
          ? playerMap.get(player2Id) || "Unknown Player"
          : "BYE";

        return {
          id: match.id,
          player1Id,
          player1Name,
          player2Id,
          player2Name,
          status: match.status as
            | "pending"
            | "active"
            | "completed"
            | "cancelled",
          result: results
            ? {
                winnerId:
                  typeof results.winnerId === "string"
                    ? results.winnerId
                    : null,
                player1Wins:
                  typeof results.player1Wins === "number"
                    ? results.player1Wins
                    : 0,
                player2Wins:
                  typeof results.player2Wins === "number"
                    ? results.player2Wins
                    : 0,
                draws: typeof results.draws === "number" ? results.draws : 0,
              }
            : null,
        };
      });

      return {
        id: round.id,
        tournamentId: round.tournamentId,
        roundNumber: round.roundNumber,
        status: round.status,
        startedAt: round.startedAt?.toISOString() || null,
        completedAt: round.completedAt?.toISOString() || null,
        matches,
      };
    });
  }

  /**
   * Calculate overall tournament statistics
   */
  async calculateOverallStats(tournamentId: string) {
    const [tournament, matches, registrations] = await Promise.all([
      prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          rounds: true,
        },
      }),
      prisma.match.findMany({
        where: { tournamentId },
      }),
      prisma.tournamentRegistration.count({
        where: { tournamentId, seatStatus: "active" },
      }),
    ]);

    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const totalMatches = matches.length;
    const completedMatches = matches.filter(
      (m) => m.status === "completed"
    ).length;

    // Calculate average match duration
    const completedMatchesWithTimes = matches.filter(
      (m) => m.status === "completed" && m.startedAt && m.completedAt
    );

    let averageMatchDuration = null;
    if (completedMatchesWithTimes.length > 0) {
      const totalDuration = completedMatchesWithTimes.reduce((sum, match) => {
        if (match.startedAt && match.completedAt) {
          return (
            sum + (match.completedAt.getTime() - match.startedAt.getTime())
          );
        }
        return sum;
      }, 0);
      averageMatchDuration = Math.round(
        totalDuration / completedMatchesWithTimes.length / 1000
      ); // seconds
    }

    // Calculate tournament duration
    let tournamentDuration = null;
    if (tournament.startedAt) {
      const endTime = tournament.completedAt || new Date();
      tournamentDuration = Math.round(
        (endTime.getTime() - tournament.startedAt.getTime()) / 1000
      ); // seconds
    }

    const roundsCompleted = tournament.rounds.filter(
      (r) => r.status === "completed"
    ).length;

    return {
      totalMatches,
      completedMatches,
      averageMatchDuration,
      tournamentDuration,
      totalPlayers: registrations,
      roundsCompleted,
    };
  }

  /**
   * Update player standing after match completion
   */
  async updatePlayerStanding(
    tournamentId: string,
    playerId: string,
    matchResult: {
      won: boolean;
      draw: boolean;
      gameWins: number;
      gameLosses: number;
    }
  ): Promise<void> {
    const matchPoints = matchResult.won
      ? SWISS_PAIRING.MATCH_WIN_POINTS
      : matchResult.draw
      ? SWISS_PAIRING.MATCH_DRAW_POINTS
      : SWISS_PAIRING.MATCH_LOSS_POINTS;

    await prisma.playerStanding.upsert({
      where: {
        tournamentId_playerId: {
          tournamentId,
          playerId,
        },
      },
      create: {
        tournamentId,
        playerId,
        displayName: await this.getPlayerName(playerId),
        wins: matchResult.won ? 1 : 0,
        losses: matchResult.won || matchResult.draw ? 0 : 1,
        draws: matchResult.draw ? 1 : 0,
        matchPoints,
        gameWinPercentage: 0, // Will be calculated by tiebreaker calculation
        opponentMatchWinPercentage: 0, // Will be calculated by tiebreaker calculation
      },
      update: {
        wins: {
          increment: matchResult.won ? 1 : 0,
        },
        losses: {
          increment: matchResult.won || matchResult.draw ? 0 : 1,
        },
        draws: {
          increment: matchResult.draw ? 1 : 0,
        },
        matchPoints: {
          increment: matchPoints,
        },
      },
    });

    // Update tiebreaker percentages
    await this.updatePlayerTiebreakers(tournamentId, playerId);
  }

  /**
   * Update tiebreaker percentages for a player
   */
  private async updatePlayerTiebreakers(
    tournamentId: string,
    playerId: string
  ): Promise<void> {
    const tiebreakers = await this.calculateTiebreakers(tournamentId, playerId);

    await prisma.playerStanding.update({
      where: {
        tournamentId_playerId: {
          tournamentId,
          playerId,
        },
      },
      data: {
        gameWinPercentage: tiebreakers.gameWinPercentage,
        opponentMatchWinPercentage: tiebreakers.opponentMatchWinPercentage,
      },
    });
  }

  /**
   * Get player name by ID
   */
  private async getPlayerName(playerId: string): Promise<string> {
    const player = await prisma.user.findUnique({
      where: { id: playerId },
      select: { name: true },
    });
    return player?.name || "Unknown Player";
  }

  /**
   * Check if two standings are equal (for tie handling)
   */
  private areStandingsEqual(
    a: TournamentStanding,
    b: TournamentStanding
  ): boolean {
    return (
      a.matchPoints === b.matchPoints &&
      Math.abs(
        a.tiebreakers.opponentMatchWinPercentage -
          b.tiebreakers.opponentMatchWinPercentage
      ) < 0.001 &&
      Math.abs(
        a.tiebreakers.gameWinPercentage - b.tiebreakers.gameWinPercentage
      ) < 0.001 &&
      Math.abs(
        a.tiebreakers.opponentGameWinPercentage -
          b.tiebreakers.opponentGameWinPercentage
      ) < 0.001
    );
  }

  /**
   * Recalculate all standings for tournament (useful after rule changes)
   */
  async recalculateAllStandings(tournamentId: string): Promise<void> {
    const registrations = await prisma.tournamentRegistration.findMany({
      where: { tournamentId },
      select: { playerId: true },
    });

    // Reset all standings
    await prisma.playerStanding.deleteMany({
      where: { tournamentId },
    });

    // Get all completed matches
    const matches = await prisma.match.findMany({
      where: {
        tournamentId,
        status: "completed",
      },
    });

    // Recreate standings from match results
    for (const match of matches) {
      const matchPlayers = Array.isArray(match.players) ? match.players : [];
      const results = match.results as Record<string, unknown> | null;

      if (matchPlayers.length >= 2 && results) {
        const player1Id = String(matchPlayers[0]);
        const player2Id = String(matchPlayers[1]);

        const player1Won = String(results.winnerId) === player1Id;
        const player2Won = String(results.winnerId) === player2Id;
        const isDraw = !results.winnerId;

        // Update player 1
        await this.updatePlayerStanding(tournamentId, player1Id, {
          won: player1Won,
          draw: isDraw,
          gameWins: Number(results.player1Wins) || 0,
          gameLosses: Number(results.player2Wins) || 0,
        });

        // Update player 2
        await this.updatePlayerStanding(tournamentId, player2Id, {
          won: player2Won,
          draw: isDraw,
          gameWins: Number(results.player2Wins) || 0,
          gameLosses: Number(results.player1Wins) || 0,
        });
      }
    }

    // Update all tiebreakers
    for (const registration of registrations) {
      await this.updatePlayerTiebreakers(tournamentId, registration.playerId);
    }
  }
}

// Export singleton instance
export const tournamentStatisticsService = new TournamentStatisticsService();
