/**
 * Standings Service Module
 *
 * Provides atomic standings updates with transaction guarantees.
 * Prevents race conditions in concurrent match completions.
 *
 * Extracted from server/index.js as part of T022 (module refactoring).
 */

/**
 * Record match result and update player standings atomically
 * Transaction ensures both players updated or neither
 *
 * @param {object} prisma - Prisma client instance
 * @param {string} tournamentId - Tournament identifier
 * @param {string} winnerId - Winning player ID (or first player if draw)
 * @param {string} loserId - Losing player ID (or second player if draw)
 * @param {boolean} isDraw - Whether match was a draw
 * @throws Error if standings update fails (caller should retry)
 */
async function recordMatchResult(prisma, tournamentId, winnerId, loserId, isDraw) {
  console.log('[Standings] Recording match result:', { tournamentId, winnerId, loserId, isDraw });

  if (!tournamentId || (!winnerId && !loserId)) {
    throw new Error('Invalid match result: tournamentId and player IDs required');
  }

  try {
    if (isDraw) {
      // Wrap both updates in transaction for draws
      await prisma.$transaction([
        prisma.playerStanding.update({
          where: { tournamentId_playerId: { tournamentId, playerId: winnerId } },
          data: { draws: { increment: 1 }, matchPoints: { increment: 1 }, currentMatchId: null },
        }),
        prisma.playerStanding.update({
          where: { tournamentId_playerId: { tournamentId, playerId: loserId } },
          data: { draws: { increment: 1 }, matchPoints: { increment: 1 }, currentMatchId: null },
        }),
      ]);
      console.log('[Standings] Draw recorded atomically:', { tournamentId, winnerId, loserId });
    } else if (winnerId && loserId) {
      // Wrap winner and loser updates in single transaction
      await prisma.$transaction([
        prisma.playerStanding.update({
          where: { tournamentId_playerId: { tournamentId, playerId: winnerId } },
          data: { wins: { increment: 1 }, matchPoints: { increment: 3 }, currentMatchId: null },
        }),
        prisma.playerStanding.update({
          where: { tournamentId_playerId: { tournamentId, playerId: loserId } },
          data: { losses: { increment: 1 }, currentMatchId: null },
        }),
      ]);
      console.log('[Standings] Win recorded atomically:', { tournamentId, winnerId, loserId });
    }
  } catch (err) {
    // Handle transaction conflicts with retry logic
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2034') {
      console.warn('[Standings] Transaction conflict, retrying...', err.message || err);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Retry once
      try {
        if (isDraw) {
          await prisma.$transaction([
            prisma.playerStanding.update({
              where: { tournamentId_playerId: { tournamentId, playerId: winnerId } },
              data: { draws: { increment: 1 }, matchPoints: { increment: 1 }, currentMatchId: null },
            }),
            prisma.playerStanding.update({
              where: { tournamentId_playerId: { tournamentId, playerId: loserId } },
              data: { draws: { increment: 1 }, matchPoints: { increment: 1 }, currentMatchId: null },
            }),
          ]);
        } else if (winnerId && loserId) {
          await prisma.$transaction([
            prisma.playerStanding.update({
              where: { tournamentId_playerId: { tournamentId, playerId: winnerId } },
              data: { wins: { increment: 1 }, matchPoints: { increment: 3 }, currentMatchId: null },
            }),
            prisma.playerStanding.update({
              where: { tournamentId_playerId: { tournamentId, playerId: loserId } },
              data: { losses: { increment: 1 }, currentMatchId: null },
            }),
          ]);
        }
        console.log('[Standings] Retry successful:', { tournamentId, winnerId, loserId, isDraw });
      } catch (retryErr) {
        console.error('[Standings] Retry failed:', retryErr && typeof retryErr === 'object' && 'message' in retryErr ? retryErr.message : retryErr);
        throw retryErr;
      }
    } else {
      console.error('[Standings] Transaction failed:', err && typeof err === 'object' && 'message' in err ? err.message : err);
      throw err;
    }
  }
}

/**
 * Get current standings for tournament ordered by match points
 *
 * @param {object} prisma - Prisma client instance
 * @param {string} tournamentId - Tournament identifier
 * @returns {Promise<Array>} Ordered list of player standings
 */
async function getStandings(prisma, tournamentId) {
  console.log('[Standings] Getting standings for tournament:', { tournamentId });

  try {
    const standings = await prisma.playerStanding.findMany({
      where: { tournamentId },
      orderBy: [
        { matchPoints: 'desc' },
        { gameWinPercentage: 'desc' },
        { opponentWinPercentage: 'desc' },
      ],
      include: {
        player: {
          select: { name: true },
        },
      },
    });

    // Add rank based on ordering
    const standingsWithRank = standings.map((standing, index) => ({
      ...standing,
      rank: index + 1,
      playerName: standing.player?.name || 'Unknown',
      updatedAt: standing.updatedAt.toISOString(),
    }));

    console.log('[Standings] Retrieved standings:', { tournamentId, playerCount: standings.length });
    return standingsWithRank;
  } catch (err) {
    console.error('[Standings] Failed to get standings:', err && typeof err === 'object' && 'message' in err ? err.message : err);
    throw err;
  }
}

/**
 * Recalculate tiebreakers for all players in tournament
 * Should be called after each round completes
 *
 * @param {object} prisma - Prisma client instance
 * @param {string} tournamentId - Tournament identifier
 */
async function recalculateTiebreakers(prisma, tournamentId) {
  console.log('[Standings] Recalculating tiebreakers for tournament:', { tournamentId });

  try {
    // Get all standings for tournament
    const standings = await prisma.playerStanding.findMany({
      where: { tournamentId },
      include: {
        player: true,
      },
    });

    // Get all completed matches for tournament
    const matches = await prisma.match.findMany({
      where: {
        tournamentId,
        status: 'completed',
      },
      select: {
        id: true,
        players: true,
        results: true,
      },
    });

    // Calculate game win percentage for each player
    const playerGameStats = new Map();
    for (const standing of standings) {
      playerGameStats.set(standing.playerId, {
        gamesWon: 0,
        gamesPlayed: 0,
        opponents: new Set(),
      });
    }

    // Aggregate game results from completed matches
    for (const match of matches) {
      const playersVal = Array.isArray(match.players) ? match.players : [];
      const playerIds = playersVal
        .map((p) => {
          if (p && typeof p === 'object') {
            const id = p.id || p.playerId || p.userId;
            return typeof id === 'string' ? id : null;
          }
          return null;
        })
        .filter(Boolean);

      if (playerIds.length === 2) {
        const [p1, p2] = playerIds;
        playerGameStats.get(p1)?.opponents.add(p2);
        playerGameStats.get(p2)?.opponents.add(p1);

        const results = match.results || {};
        const gameResults = Array.isArray(results.gameResults) ? results.gameResults : [];

        for (const gameResult of gameResults) {
          if (gameResult && typeof gameResult === 'object') {
            const winner = gameResult.winnerId;
            if (winner === p1 || winner === p2) {
              const stats1 = playerGameStats.get(p1);
              const stats2 = playerGameStats.get(p2);
              if (stats1) {
                stats1.gamesPlayed++;
                if (winner === p1) stats1.gamesWon++;
              }
              if (stats2) {
                stats2.gamesPlayed++;
                if (winner === p2) stats2.gamesWon++;
              }
            }
          }
        }
      }
    }

    // Calculate win percentages
    const playerWinPercentages = new Map();
    for (const [playerId, stats] of playerGameStats.entries()) {
      const gwp = stats.gamesPlayed > 0
        ? Math.max(0.33, stats.gamesWon / stats.gamesPlayed)
        : 0.33; // Minimum 33% per DCI rules
      playerWinPercentages.set(playerId, gwp);
    }

    // Calculate opponent win percentage for each player
    const updates = [];
    for (const standing of standings) {
      const stats = playerGameStats.get(standing.playerId);
      if (!stats) continue;

      const gwp = playerWinPercentages.get(standing.playerId) || 0.33;

      // Calculate opponent win percentage
      let opponentGWPSum = 0;
      let opponentCount = 0;
      for (const opponentId of stats.opponents) {
        const opponentGWP = playerWinPercentages.get(opponentId) || 0.33;
        opponentGWPSum += opponentGWP;
        opponentCount++;
      }
      const owp = opponentCount > 0 ? opponentGWPSum / opponentCount : 0.33;

      updates.push(
        prisma.playerStanding.update({
          where: { tournamentId_playerId: { tournamentId, playerId: standing.playerId } },
          data: {
            gameWinPercentage: gwp,
            opponentWinPercentage: owp,
          },
        })
      );
    }

    // Execute all updates in parallel
    await Promise.all(updates);
    console.log('[Standings] Tiebreakers recalculated:', { tournamentId, playersUpdated: updates.length });
  } catch (err) {
    console.error('[Standings] Failed to recalculate tiebreakers:', err && typeof err === 'object' && 'message' in err ? err.message : err);
    throw err;
  }
}

/**
 * Validate standings integrity
 * Checks that match points match formula and all values are valid
 *
 * @param {object} prisma - Prisma client instance
 * @param {string} tournamentId - Tournament identifier
 * @returns {Promise<object>} Validation result with errors and warnings
 */
async function validateStandings(prisma, tournamentId) {
  console.log('[Standings] Validating standings for tournament:', { tournamentId });

  const errors = [];
  const warnings = [];
  const stats = {
    totalPlayers: 0,
    totalMatches: 0,
    totalWins: 0,
    totalLosses: 0,
    totalDraws: 0,
  };

  try {
    const standings = await prisma.playerStanding.findMany({
      where: { tournamentId },
    });

    stats.totalPlayers = standings.length;

    for (const standing of standings) {
      // Validate match points formula
      const expectedMatchPoints = (standing.wins * 3) + standing.draws;
      if (standing.matchPoints !== expectedMatchPoints) {
        errors.push(`Player ${standing.playerId}: matchPoints ${standing.matchPoints} != expected ${expectedMatchPoints}`);
      }

      // Validate non-negative values
      if (standing.wins < 0) errors.push(`Player ${standing.playerId}: negative wins`);
      if (standing.losses < 0) errors.push(`Player ${standing.playerId}: negative losses`);
      if (standing.draws < 0) errors.push(`Player ${standing.playerId}: negative draws`);

      // Validate percentages if set
      if (standing.gameWinPercentage !== null && (standing.gameWinPercentage < 0 || standing.gameWinPercentage > 1)) {
        errors.push(`Player ${standing.playerId}: gameWinPercentage ${standing.gameWinPercentage} out of range`);
      }
      if (standing.opponentWinPercentage !== null && (standing.opponentWinPercentage < 0 || standing.opponentWinPercentage > 1)) {
        errors.push(`Player ${standing.playerId}: opponentWinPercentage ${standing.opponentWinPercentage} out of range`);
      }

      stats.totalWins += standing.wins;
      stats.totalLosses += standing.losses;
      stats.totalDraws += standing.draws;
    }

    // Validate total wins equals total losses (draws are symmetric)
    if (stats.totalWins !== stats.totalLosses) {
      warnings.push(`Total wins (${stats.totalWins}) != total losses (${stats.totalLosses})`);
    }

    // Draws should be even (each draw counted twice)
    if (stats.totalDraws % 2 !== 0) {
      warnings.push(`Total draws (${stats.totalDraws}) is odd - should be even`);
    }

    stats.totalMatches = stats.totalWins + (stats.totalDraws / 2);

    const isValid = errors.length === 0;
    console.log('[Standings] Validation complete:', { tournamentId, isValid, errorCount: errors.length, warningCount: warnings.length });

    return {
      isValid,
      errors,
      warnings,
      stats,
    };
  } catch (err) {
    console.error('[Standings] Validation failed:', err && typeof err === 'object' && 'message' in err ? err.message : err);
    throw err;
  }
}

module.exports = {
  recordMatchResult,
  getStandings,
  recalculateTiebreakers,
  validateStandings,
};
