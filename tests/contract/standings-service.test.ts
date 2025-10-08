/**
 * Contract Test: StandingsService
 *
 * Tests the standings management service module.
 * Verifies that standings:
 * 1. Update atomically with transactions
 * 2. Calculate tiebreakers correctly
 * 3. Validate standings integrity
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma client
const createMockPrisma = () => {
  const transactionMock = vi.fn(async (operations) => {
    // Execute all operations in the array
    for (const op of operations) {
      await op;
    }
  });

  return {
    $transaction: transactionMock,
    playerStanding: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    match: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    _transactionMock: transactionMock,
  };
};

describe('StandingsService Contract Tests', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let standingsService: typeof import('../../server/modules/tournament/standings');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPrisma = createMockPrisma();

    // Dynamically import the module
    standingsService = await import('../../server/modules/tournament/standings');
  });

  describe('recordMatchResult', () => {
    it('should update both players atomically for a draw', async () => {
      const tournamentId = 'tournament_123';
      const player1Id = 'player_1';
      const player2Id = 'player_2';

      await standingsService.recordMatchResult(
        mockPrisma as any,
        tournamentId,
        player1Id,
        player2Id,
        true // isDraw
      );

      // Verify transaction was used
      expect(mockPrisma._transactionMock).toHaveBeenCalled();

      // Verify both players updated
      expect(mockPrisma.playerStanding.update).toHaveBeenCalledTimes(2);

      // Verify each player gets +1 draw, +1 match point
      const calls = mockPrisma.playerStanding.update.mock.calls;
      expect(calls[0][0].data).toMatchObject({
        draws: { increment: 1 },
        matchPoints: { increment: 1 },
        currentMatchId: null,
      });
      expect(calls[1][0].data).toMatchObject({
        draws: { increment: 1 },
        matchPoints: { increment: 1 },
        currentMatchId: null,
      });
    });

    it('should update winner and loser atomically for a win', async () => {
      const tournamentId = 'tournament_456';
      const winnerId = 'player_winner';
      const loserId = 'player_loser';

      await standingsService.recordMatchResult(
        mockPrisma as any,
        tournamentId,
        winnerId,
        loserId,
        false // not a draw
      );

      // Verify transaction was used
      expect(mockPrisma._transactionMock).toHaveBeenCalled();

      // Verify both players updated
      expect(mockPrisma.playerStanding.update).toHaveBeenCalledTimes(2);

      // Verify winner gets +1 win, +3 match points
      const winnerCall = mockPrisma.playerStanding.update.mock.calls.find(
        call => call[0].data.wins
      );
      expect(winnerCall[0].data).toMatchObject({
        wins: { increment: 1 },
        matchPoints: { increment: 3 },
        currentMatchId: null,
      });

      // Verify loser gets +1 loss
      const loserCall = mockPrisma.playerStanding.update.mock.calls.find(
        call => call[0].data.losses
      );
      expect(loserCall[0].data).toMatchObject({
        losses: { increment: 1 },
        currentMatchId: null,
      });
    });

    it('should retry on transaction conflict (P2034)', async () => {
      const tournamentId = 'tournament_789';
      const player1Id = 'player_1';
      const player2Id = 'player_2';

      // Mock transaction to fail once with P2034, then succeed
      mockPrisma._transactionMock
        .mockRejectedValueOnce({ code: 'P2034', message: 'Transaction conflict' })
        .mockResolvedValueOnce(undefined);

      await standingsService.recordMatchResult(
        mockPrisma as any,
        tournamentId,
        player1Id,
        player2Id,
        true
      );

      // Verify retried (called twice)
      expect(mockPrisma._transactionMock).toHaveBeenCalledTimes(2);
    });

    it('should throw error when tournamentId is missing', async () => {
      await expect(
        standingsService.recordMatchResult(
          mockPrisma as any,
          '', // empty tournamentId
          'player_1',
          'player_2',
          false
        )
      ).rejects.toThrow('Invalid match result');
    });
  });

  describe('getStandings', () => {
    it('should return standings ordered by match points', async () => {
      const tournamentId = 'tournament_abc';

      mockPrisma.playerStanding.findMany.mockResolvedValue([
        {
          id: '1',
          playerId: 'player_1',
          wins: 3,
          losses: 0,
          draws: 0,
          matchPoints: 9,
          gameWinPercentage: 0.75,
          opponentWinPercentage: 0.5,
          updatedAt: new Date(),
          player: { name: 'Player 1' },
        },
        {
          id: '2',
          playerId: 'player_2',
          wins: 2,
          losses: 1,
          draws: 0,
          matchPoints: 6,
          gameWinPercentage: 0.66,
          opponentWinPercentage: 0.55,
          updatedAt: new Date(),
          player: { name: 'Player 2' },
        },
      ]);

      const standings = await standingsService.getStandings(mockPrisma as any, tournamentId);

      expect(standings).toHaveLength(2);
      expect(standings[0].rank).toBe(1);
      expect(standings[0].matchPoints).toBe(9);
      expect(standings[1].rank).toBe(2);
      expect(standings[1].matchPoints).toBe(6);

      // Verify query includes orderBy
      expect(mockPrisma.playerStanding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tournamentId },
          orderBy: expect.arrayContaining([
            { matchPoints: 'desc' },
          ]),
        })
      );
    });
  });

  describe('recalculateTiebreakers', () => {
    it('should calculate game win percentage for all players', async () => {
      const tournamentId = 'tournament_def';

      mockPrisma.playerStanding.findMany.mockResolvedValue([
        {
          id: '1',
          playerId: 'player_1',
          player: { id: 'player_1' },
        },
        {
          id: '2',
          playerId: 'player_2',
          player: { id: 'player_2' },
        },
      ]);

      mockPrisma.match.findMany.mockResolvedValue([
        {
          id: 'match_1',
          players: [
            { id: 'player_1' },
            { id: 'player_2' },
          ],
          results: {
            gameResults: [
              { winnerId: 'player_1' },
              { winnerId: 'player_1' },
              { winnerId: 'player_2' },
            ],
          },
        },
      ]);

      await standingsService.recalculateTiebreakers(mockPrisma as any, tournamentId);

      // Verify standings were updated with new percentages
      expect(mockPrisma.playerStanding.update).toHaveBeenCalled();
    });
  });

  describe('validateStandings', () => {
    it('should detect invalid matchPoints formula', async () => {
      const tournamentId = 'tournament_ghi';

      mockPrisma.playerStanding.findMany.mockResolvedValue([
        {
          id: '1',
          playerId: 'player_1',
          wins: 2,
          losses: 1,
          draws: 0,
          matchPoints: 5, // WRONG! Should be 6 (2*3 + 0)
          gameWinPercentage: null,
          opponentWinPercentage: null,
        },
      ]);

      const result = await standingsService.validateStandings(mockPrisma as any, tournamentId);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('matchPoints');
      expect(result.errors[0]).toContain('player_1');
    });

    it('should validate total wins equals total losses', async () => {
      const tournamentId = 'tournament_jkl';

      mockPrisma.playerStanding.findMany.mockResolvedValue([
        {
          id: '1',
          playerId: 'player_1',
          wins: 3,
          losses: 1,
          draws: 0,
          matchPoints: 9,
          gameWinPercentage: null,
          opponentWinPercentage: null,
        },
        {
          id: '2',
          playerId: 'player_2',
          wins: 1,
          losses: 2, // Total losses (3) != total wins (4)
          draws: 0,
          matchPoints: 3,
          gameWinPercentage: null,
          opponentWinPercentage: null,
        },
      ]);

      const result = await standingsService.validateStandings(mockPrisma as any, tournamentId);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('wins');
    });

    it('should return valid for correct standings', async () => {
      const tournamentId = 'tournament_mno';

      mockPrisma.playerStanding.findMany.mockResolvedValue([
        {
          id: '1',
          playerId: 'player_1',
          wins: 2,
          losses: 1,
          draws: 0,
          matchPoints: 6, // Correct: 2*3 + 0 = 6
          gameWinPercentage: null,
          opponentWinPercentage: null,
        },
        {
          id: '2',
          playerId: 'player_2',
          wins: 1,
          losses: 2,
          draws: 0,
          matchPoints: 3, // Correct: 1*3 + 0 = 3
          gameWinPercentage: null,
          opponentWinPercentage: null,
        },
      ]);

      const result = await standingsService.validateStandings(mockPrisma as any, tournamentId);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
