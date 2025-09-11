/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Prisma client
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    tournament: {
      findUnique: vi.fn(),
    },
    match: {
      create: vi.fn(),
    },
    playerStanding: {
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import {
  generatePairings,
  createRoundMatches,
  updateStandingsAfterMatch,
  type PlayerPairing,
  type TournamentPairingResult
} from '../../src/lib/tournament/pairing';
import { prisma } from '../../src/lib/prisma';

// Get the mocked prisma for type safety
const mockPrisma = vi.mocked(prisma);

describe('Tournament Pairing Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generatePairings', () => {
    const mockTournament = {
      id: 'tournament-1',
      format: 'constructed',
      standings: [
        {
          playerId: 'player-1',
          displayName: 'Player 1',
          matchPoints: 6,
          gameWinPercentage: 0.75,
          opponentMatchWinPercentage: 0.60,
          isEliminated: false,
        },
        {
          playerId: 'player-2', 
          displayName: 'Player 2',
          matchPoints: 6,
          gameWinPercentage: 0.70,
          opponentMatchWinPercentage: 0.55,
          isEliminated: false,
        },
        {
          playerId: 'player-3',
          displayName: 'Player 3', 
          matchPoints: 3,
          gameWinPercentage: 0.50,
          opponentMatchWinPercentage: 0.50,
          isEliminated: false,
        },
        {
          playerId: 'player-4',
          displayName: 'Player 4',
          matchPoints: 0,
          gameWinPercentage: 0.25,
          opponentMatchWinPercentage: 0.45,
          isEliminated: false,
        },
      ],
      matches: [],
    };

    it('should generate Swiss pairings for constructed format', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue(mockTournament);

      const result = await generatePairings('tournament-1', 2);

      expect(result).toBeDefined();
      expect(result.matches).toHaveLength(2);
      expect(result.byes).toHaveLength(0);

      // Verify players are paired based on similar scores
      const match1 = result.matches[0];
      const match2 = result.matches[1];

      // Top 2 players should play each other
      expect([match1.player1.playerId, match1.player2.playerId]).toContain('player-1');
      expect([match1.player1.playerId, match1.player2.playerId]).toContain('player-2');

      // Bottom 2 players should play each other
      expect([match2.player1.playerId, match2.player2.playerId]).toContain('player-3');
      expect([match2.player1.playerId, match2.player2.playerId]).toContain('player-4');
    });

    it('should handle odd number of players with byes', async () => {
      const oddPlayerTournament = {
        ...mockTournament,
        standings: mockTournament.standings.slice(0, 3), // 3 players
      };

      mockPrisma.tournament.findUnique.mockResolvedValue(oddPlayerTournament);

      const result = await generatePairings('tournament-1', 2);

      expect(result.matches).toHaveLength(1);
      expect(result.byes).toHaveLength(1);

      // Lowest-ranked player should get bye
      expect(result.byes[0].playerId).toBe('player-3');
    });

    it('should avoid repeat pairings in Swiss system', async () => {
      const tournamentWithHistory = {
        ...mockTournament,
        matches: [
          {
            players: [{ id: 'player-1' }, { id: 'player-2' }],
          },
        ],
      };

      mockPrisma.tournament.findUnique.mockResolvedValue(tournamentWithHistory);

      const result = await generatePairings('tournament-1', 2);

      expect(result.matches).toHaveLength(2);
      
      // Player 1 and Player 2 should not be paired again
      const allPairings = result.matches.flatMap(match => [
        [match.player1.playerId, match.player2.playerId],
        [match.player2.playerId, match.player1.playerId]
      ]);

      const player1vs2 = allPairings.some(pair => 
        pair[0] === 'player-1' && pair[1] === 'player-2'
      );

      expect(player1vs2).toBe(false);
    });

    it('should throw error for unsupported tournament format', async () => {
      const unsupportedTournament = {
        ...mockTournament,
        format: 'unsupported-format',
      };

      mockPrisma.tournament.findUnique.mockResolvedValue(unsupportedTournament);

      await expect(generatePairings('tournament-1', 2)).rejects.toThrow(
        'Unsupported tournament format: unsupported-format'
      );
    });

    it('should throw error when tournament not found', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue(null);

      await expect(generatePairings('tournament-1', 2)).rejects.toThrow(
        'Tournament not found'
      );
    });

    it('should support sealed format with Swiss pairings', async () => {
      const sealedTournament = {
        ...mockTournament,
        format: 'sealed',
      };

      mockPrisma.tournament.findUnique.mockResolvedValue(sealedTournament);

      const result = await generatePairings('tournament-1', 2);

      expect(result).toBeDefined();
      expect(result.matches).toHaveLength(2);
      expect(result.byes).toHaveLength(0);
    });

    it('should support draft format with Swiss pairings', async () => {
      const draftTournament = {
        ...mockTournament,
        format: 'draft',
      };

      mockPrisma.tournament.findUnique.mockResolvedValue(draftTournament);

      const result = await generatePairings('tournament-1', 2);

      expect(result).toBeDefined();
      expect(result.matches).toHaveLength(2);
      expect(result.byes).toHaveLength(0);
    });
  });

  describe('createRoundMatches', () => {
    const mockPairings: TournamentPairingResult = {
      matches: [
        {
          player1: {
            playerId: 'player-1',
            displayName: 'Player 1',
            matchPoints: 6,
            gameWinPercentage: 0.75,
            opponentMatchWinPercentage: 0.60,
            isEliminated: false,
          },
          player2: {
            playerId: 'player-2',
            displayName: 'Player 2',
            matchPoints: 6,
            gameWinPercentage: 0.70,
            opponentMatchWinPercentage: 0.55,
            isEliminated: false,
          },
        },
      ],
      byes: [
        {
          playerId: 'player-3',
          displayName: 'Player 3',
          matchPoints: 3,
          gameWinPercentage: 0.50,
          opponentMatchWinPercentage: 0.50,
          isEliminated: false,
        },
      ],
    };

    it('should create match records in database', async () => {
      const mockMatch = { id: 'match-1' };
      mockPrisma.match.create.mockResolvedValue(mockMatch);
      mockPrisma.playerStanding.updateMany.mockResolvedValue({});
      mockPrisma.playerStanding.update.mockResolvedValue({});

      const result = await createRoundMatches('tournament-1', 'round-1', mockPairings);

      expect(result).toEqual(['match-1']);
      expect(mockPrisma.match.create).toHaveBeenCalledWith({
        data: {
          tournamentId: 'tournament-1',
          roundId: 'round-1',
          status: 'pending',
          players: [
            { id: 'player-1', displayName: 'Player 1' },
            { id: 'player-2', displayName: 'Player 2' },
          ],
        },
      });
    });

    it('should handle byes by giving automatic wins', async () => {
      const mockMatch = { id: 'match-1' };
      mockPrisma.match.create.mockResolvedValue(mockMatch);
      mockPrisma.playerStanding.updateMany.mockResolvedValue({});
      mockPrisma.playerStanding.update.mockResolvedValue({});

      await createRoundMatches('tournament-1', 'round-1', mockPairings);

      // Verify bye player gets automatic win
      expect(mockPrisma.playerStanding.update).toHaveBeenCalledWith({
        where: {
          tournamentId_playerId: {
            tournamentId: 'tournament-1',
            playerId: 'player-3',
          },
        },
        data: {
          wins: { increment: 1 },
          matchPoints: { increment: 3 },
          currentMatchId: null,
        },
      });
    });

    it('should update current match IDs for paired players', async () => {
      const mockMatch = { id: 'match-1' };
      mockPrisma.match.create.mockResolvedValue(mockMatch);
      mockPrisma.playerStanding.updateMany.mockResolvedValue({});
      mockPrisma.playerStanding.update.mockResolvedValue({});

      await createRoundMatches('tournament-1', 'round-1', mockPairings);

      expect(mockPrisma.playerStanding.updateMany).toHaveBeenCalledWith({
        where: {
          tournamentId: 'tournament-1',
          playerId: { in: ['player-1', 'player-2'] },
        },
        data: {
          currentMatchId: 'match-1',
        },
      });
    });
  });

  describe('updateStandingsAfterMatch', () => {
    beforeEach(() => {
      mockPrisma.playerStanding.update.mockResolvedValue({});
      mockPrisma.playerStanding.updateMany.mockResolvedValue({});
      mockPrisma.tournament.findUnique.mockResolvedValue({
        standings: [
          { playerId: 'player-1', wins: 1, losses: 0, draws: 0 },
          { playerId: 'player-2', wins: 0, losses: 1, draws: 0 },
        ],
        matches: [],
      });
    });

    it('should update standings for match win', async () => {
      await updateStandingsAfterMatch('tournament-1', 'match-1', {
        winnerId: 'player-1',
        loserId: 'player-2',
      });

      // Winner gets 3 points
      expect(mockPrisma.playerStanding.update).toHaveBeenCalledWith({
        where: {
          tournamentId_playerId: {
            tournamentId: 'tournament-1',
            playerId: 'player-1',
          },
        },
        data: {
          wins: { increment: 1 },
          matchPoints: { increment: 3 },
          currentMatchId: null,
        },
      });

      // Loser gets 0 points
      expect(mockPrisma.playerStanding.update).toHaveBeenCalledWith({
        where: {
          tournamentId_playerId: {
            tournamentId: 'tournament-1',
            playerId: 'player-2',
          },
        },
        data: {
          losses: { increment: 1 },
          currentMatchId: null,
        },
      });
    });

    it('should handle draw results correctly', async () => {
      await updateStandingsAfterMatch('tournament-1', 'match-1', {
        winnerId: 'player-1',
        loserId: 'player-2',
        isDraw: true,
      });

      // Both players get 1 point for draw
      expect(mockPrisma.playerStanding.updateMany).toHaveBeenCalledWith({
        where: {
          tournamentId: 'tournament-1',
          playerId: { in: ['player-1', 'player-2'] },
        },
        data: {
          draws: { increment: 1 },
          matchPoints: { increment: 1 },
          currentMatchId: null,
        },
      });
    });

    it('should recalculate tiebreakers after match', async () => {
      await updateStandingsAfterMatch('tournament-1', 'match-1', {
        winnerId: 'player-1',
        loserId: 'player-2',
      });

      // Should call tournament.findUnique to get data for tiebreaker calculation
      expect(mockPrisma.tournament.findUnique).toHaveBeenCalledWith({
        where: { id: 'tournament-1' },
        include: {
          standings: true,
          matches: {
            where: { status: 'completed' },
          },
        },
      });
    });
  });

  describe('Swiss Pairing Algorithm Logic', () => {
    it('should pair players with similar match points', async () => {
      const players: PlayerPairing[] = [
        {
          playerId: 'player-1',
          displayName: 'Player 1',
          matchPoints: 9,
          gameWinPercentage: 1.0,
          opponentMatchWinPercentage: 0.70,
          isEliminated: false,
        },
        {
          playerId: 'player-2',
          displayName: 'Player 2',
          matchPoints: 6,
          gameWinPercentage: 0.75,
          opponentMatchWinPercentage: 0.65,
          isEliminated: false,
        },
        {
          playerId: 'player-3',
          displayName: 'Player 3',
          matchPoints: 6,
          gameWinPercentage: 0.70,
          opponentMatchWinPercentage: 0.60,
          isEliminated: false,
        },
        {
          playerId: 'player-4',
          displayName: 'Player 4',
          matchPoints: 3,
          gameWinPercentage: 0.50,
          opponentMatchWinPercentage: 0.55,
          isEliminated: false,
        },
      ];

      mockPrisma.tournament.findUnique.mockResolvedValue({
        format: 'constructed',
        standings: players,
        matches: [],
      });

      const result = await generatePairings('tournament-1', 1);
      
      // Should have 2 matches for 4 players
      expect(result.matches).toHaveLength(2);
      
      // Swiss pairing pairs players in order after sorting by rank
      // Player 1 (9 points) should be paired with Player 2 (6 points)
      const topMatch = result.matches.find(match =>
        (match.player1.matchPoints === 9 && match.player2.matchPoints === 6) ||
        (match.player1.matchPoints === 6 && match.player2.matchPoints === 9)
      );
      expect(topMatch).toBeDefined();
      
      // Player 3 (6 points) should be paired with Player 4 (3 points)
      const bottomMatch = result.matches.find(match =>
        (match.player1.matchPoints === 6 && match.player2.matchPoints === 3) ||
        (match.player1.matchPoints === 3 && match.player2.matchPoints === 6)
      );
      expect(bottomMatch).toBeDefined();
    });

    it('should handle basic pairing requirements', async () => {
      const basicPlayers = [
        {
          playerId: 'player-1',
          displayName: 'Player 1',
          matchPoints: 6,
          gameWinPercentage: 0.75,
          opponentMatchWinPercentage: 0.60,
          isEliminated: false,
        },
        {
          playerId: 'player-2',
          displayName: 'Player 2',
          matchPoints: 3,
          gameWinPercentage: 0.50,
          opponentMatchWinPercentage: 0.55,
          isEliminated: false,
        },
      ];

      mockPrisma.tournament.findUnique.mockResolvedValue({
        format: 'constructed',
        standings: basicPlayers,
        matches: [],
      });

      const result = await generatePairings('tournament-1', 1);

      // Should create 1 match with 2 players
      expect(result.matches).toHaveLength(1);
      expect(result.byes).toHaveLength(0);
      expect(result.matches[0].player1.playerId).toBeDefined();
      expect(result.matches[0].player2.playerId).toBeDefined();
    });
  });
});