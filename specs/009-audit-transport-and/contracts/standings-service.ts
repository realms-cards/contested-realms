/**
 * Standings Service Contract
 *
 * Provides atomic standings updates with transaction guarantees.
 * Prevents race conditions in concurrent match completions.
 */

export interface StandingsService {
  /**
   * Record match result and update player standings atomically
   * @param tournamentId - Tournament identifier
   * @param winnerId - Winning player ID (or first player if draw)
   * @param loserId - Losing player ID (or second player if draw)
   * @param isDraw - Whether match was a draw
   * @throws Error if standings update fails (caller should retry)
   */
  recordMatchResult(
    tournamentId: string,
    winnerId: string,
    loserId: string,
    isDraw: boolean
  ): Promise<void>;

  /**
   * Get current standings for tournament
   * @param tournamentId - Tournament identifier
   * @returns Ordered list of player standings
   */
  getStandings(tournamentId: string): Promise<PlayerStanding[]>;

  /**
   * Recalculate tiebreakers for all players
   * Should be called after each round completes
   * @param tournamentId - Tournament identifier
   */
  recalculateTiebreakers(tournamentId: string): Promise<void>;

  /**
   * Validate standings integrity (sum of wins/losses/draws matches expected)
   * @param tournamentId - Tournament identifier
   * @returns Validation result with any discrepancies found
   */
  validateStandings(tournamentId: string): Promise<StandingsValidation>;
}

/**
 * Player Standing Model
 */
export interface PlayerStanding {
  id: string;
  tournamentId: string;
  playerId: string;
  playerName?: string; // Denormalized for performance
  wins: number;
  losses: number;
  draws: number;
  matchPoints: number; // (wins * 3) + draws
  gameWinPercentage?: number; // 0.0 - 1.0
  opponentWinPercentage?: number; // 0.0 - 1.0
  currentMatchId?: string;
  rank?: number; // Calculated based on matchPoints + tiebreakers
  updatedAt: string; // ISO 8601
}

/**
 * Standings Validation Result
 */
export interface StandingsValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalPlayers: number;
    totalMatches: number;
    totalWins: number;
    totalLosses: number;
    totalDraws: number;
  };
}

/**
 * Transaction Guarantees:
 *
 * 1. Winner and loser updates are atomic (both succeed or both fail)
 * 2. Match points always equal (wins * 3) + draws after update
 * 3. Concurrent updates to same player are serialized
 * 4. Transaction conflicts retry once with 100ms delay
 */

/**
 * Expected Behavior:
 *
 * - Win: Winner gets +1 win, +3 match points; Loser gets +1 loss
 * - Draw: Both players get +1 draw, +1 match point
 * - All updates wrapped in Prisma.$transaction([...])
 * - Failed transactions logged to monitoring
 * - currentMatchId cleared for both players after match result
 */

/**
 * Error Scenarios:
 *
 * - Player not in tournament → Throw error immediately
 * - Match already recorded → Throw error (prevent duplicate updates)
 * - Transaction conflict → Retry once, then throw
 * - Database connection lost → Throw error (caller should retry)
 * - Invalid tournamentId → Throw error immediately
 */

/**
 * Performance Notes:
 *
 * - recordMatchResult: Single transaction with 2 updates (<10ms typical)
 * - getStandings: Single query with orderBy (<50ms for 32 players)
 * - recalculateTiebreakers: Batch update all players (<100ms for 32 players)
 * - Indexes on (tournamentId, matchPoints DESC) optimize standings queries
 */

/**
 * Validation Rules:
 *
 * - matchPoints must equal (wins * 3) + draws
 * - wins, losses, draws must be >= 0
 * - gameWinPercentage must be 0.0-1.0 if set
 * - opponentWinPercentage must be 0.0-1.0 if set
 * - Each match should contribute exactly 1 win or 2 draws
 */

/**
 * Edge Cases:
 *
 * - First round: All players have 0-0-0 record → Random pairing
 * - Odd player count: One player gets bye (counts as win)
 * - Tournament cancelled mid-round: currentMatchId should be cleared
 * - Player drops: Opponents get win by default
 */
