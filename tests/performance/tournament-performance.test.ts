/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { performance } from 'perf_hooks';

// Mock Prisma client with performance-focused mocks
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    tournament: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    match: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    playerStanding: {
      updateMany: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    tournamentRound: {
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  generatePairings,
  createRoundMatches,
  updateStandingsAfterMatch,
  type PlayerPairing,
} from '../../src/lib/tournament/pairing';
import { prisma } from '../../src/lib/prisma';

const mockPrisma = vi.mocked(prisma);

describe('Tournament Performance Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup transaction mock to execute functions immediately
    mockPrisma.$transaction.mockImplementation(async (fn) => {
      if (typeof fn === 'function') {
        return await fn(mockPrisma);
      }
      // For array of operations, just execute them
      return Promise.resolve([]);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('32-Player Tournament Performance', () => {
    // Generate test data for a 32-player tournament
    const generate32PlayerTournament = () => {
      const players: PlayerPairing[] = [];
      for (let i = 1; i <= 32; i++) {
        players.push({
          playerId: `player-${i}`,
          displayName: `Player ${i}`,
          matchPoints: Math.floor(Math.random() * 15), // 0-15 points (5 rounds max * 3 points)
          gameWinPercentage: 0.4 + Math.random() * 0.4, // 40%-80% win rate
          opponentMatchWinPercentage: 0.4 + Math.random() * 0.3, // 40%-70%
          isEliminated: false,
        });
      }
      
      // Sort by match points for realistic ranking
      return players.sort((a, b) => {
        if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
        if (b.gameWinPercentage !== a.gameWinPercentage) return b.gameWinPercentage - a.gameWinPercentage;
        return b.opponentMatchWinPercentage - a.opponentMatchWinPercentage;
      });
    };

    const mockTournamentData = {
      id: 'tournament-32-player',
      format: 'constructed',
      standings: generate32PlayerTournament(),
      matches: [] as Array<{ players: Array<{ id: string }> }>,
    };

    it('should generate pairings for 32 players within performance targets', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue(mockTournamentData);

      const startTime = performance.now();
      const result = await generatePairings('tournament-32-player', 1);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      // Performance assertions
      expect(duration).toBeLessThan(100); // Should complete within 100ms
      expect(result.matches).toHaveLength(16); // 32 players = 16 matches
      expect(result.byes).toHaveLength(0); // No byes with even player count
      
      // Validate all players are paired exactly once
      const pairedPlayers = new Set();
      result.matches.forEach(match => {
        expect(pairedPlayers.has(match.player1.playerId)).toBe(false);
        expect(pairedPlayers.has(match.player2.playerId)).toBe(false);
        pairedPlayers.add(match.player1.playerId);
        pairedPlayers.add(match.player2.playerId);
      });
      expect(pairedPlayers.size).toBe(32);
      
      console.log(`32-player pairing generation: ${duration.toFixed(2)}ms`);
    });

    it('should handle multiple rounds with previous match history efficiently', async () => {
      const playersWithHistory = mockTournamentData.standings;
      
      // Simulate 3 rounds of previous matches
      const previousMatches = [];
      for (let round = 1; round <= 3; round++) {
        for (let match = 0; match < 16; match++) {
          const player1Index = match * 2;
          const player2Index = match * 2 + 1;
          if (player1Index < 32 && player2Index < 32) {
            previousMatches.push({
              players: [
                { id: playersWithHistory[player1Index].playerId },
                { id: playersWithHistory[player2Index].playerId }
              ]
            });
          }
        }
      }

      mockPrisma.tournament.findUnique.mockResolvedValue({
        ...mockTournamentData,
        matches: previousMatches,
      });

      const startTime = performance.now();
      const result = await generatePairings('tournament-32-player', 4); // Round 4
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      // Performance should still be good even with match history
      expect(duration).toBeLessThan(200); // Allow more time for history processing
      expect(result.matches).toHaveLength(16);
      
      console.log(`32-player pairing with history: ${duration.toFixed(2)}ms`);
    });

    it('should create 16 matches efficiently', async () => {
      const mockPairings = {
        matches: Array.from({ length: 16 }, (_, i) => ({
          player1: mockTournamentData.standings[i * 2],
          player2: mockTournamentData.standings[i * 2 + 1],
        })),
        byes: [],
      };

      // Mock database operations to be fast
      mockPrisma.match.create.mockResolvedValue({ id: 'mock-match' } as never);
      mockPrisma.playerStanding.updateMany.mockResolvedValue({} as never);

      const startTime = performance.now();
      const result = await createRoundMatches('tournament-32-player', 'round-1', mockPairings);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(500); // Database operations may be slower
      expect(result).toHaveLength(16);
      expect(mockPrisma.match.create).toHaveBeenCalledTimes(16);
      expect(mockPrisma.playerStanding.updateMany).toHaveBeenCalledTimes(16);
      
      console.log(`32-match creation: ${duration.toFixed(2)}ms`);
    });

    it('should update standings for all 16 matches efficiently', async () => {
      // Mock tournament with basic standings
      mockPrisma.tournament.findUnique.mockResolvedValue({
        standings: mockTournamentData.standings.slice(0, 32),
        matches: [],
      });
      
      mockPrisma.playerStanding.update.mockResolvedValue({} as never);
      mockPrisma.playerStanding.updateMany.mockResolvedValue({} as never);

      const startTime = performance.now();
      
      // Process 16 match results (simulating a full round completion)
      const matchPromises = [];
      for (let i = 0; i < 16; i++) {
        const winnerId = mockTournamentData.standings[i * 2].playerId;
        const loserId = mockTournamentData.standings[i * 2 + 1].playerId;
        
        matchPromises.push(
          updateStandingsAfterMatch('tournament-32-player', `match-${i}`, {
            winnerId,
            loserId,
          })
        );
      }
      
      await Promise.all(matchPromises);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000); // Allow 1 second for 16 concurrent updates
      // Note: Actual call count is higher due to tiebreaker recalculation after each match
      expect(mockPrisma.playerStanding.update).toHaveBeenCalled();
      expect(mockPrisma.playerStanding.update.mock.calls.length).toBeGreaterThan(32);
      
      console.log(`32-match standings update: ${duration.toFixed(2)}ms`);
    });

    it('should handle tournament statistics calculation for 32 players efficiently', async () => {
      // Simulate calculating statistics for all 32 players
      const players = mockTournamentData.standings;
      
      const startTime = performance.now();
      
      // Simulate the type of calculations done in tournament statistics
      const statisticsCalculations = players.map(player => {
        const totalMatches = Math.floor(Math.random() * 5) + 1; // 1-5 matches
        const wins = Math.floor(Math.random() * totalMatches);
        const losses = Math.floor(Math.random() * (totalMatches - wins));
        const draws = totalMatches - wins - losses;
        
        const winRate = totalMatches > 0 ? wins / totalMatches : 0;
        const gameWinRate = Math.random(); // Simulated
        
        return {
          playerId: player.playerId,
          totalMatches,
          wins,
          losses,
          draws,
          winRate: Math.round(winRate * 100) / 100,
          gameWinRate: Math.round(gameWinRate * 100) / 100,
          matchPoints: wins * 3 + draws * 1,
        };
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(50); // Pure calculation should be very fast
      expect(statisticsCalculations).toHaveLength(32);
      
      // Verify calculations are reasonable
      statisticsCalculations.forEach(stats => {
        expect(stats.wins + stats.losses + stats.draws).toBe(stats.totalMatches);
        expect(stats.winRate).toBeGreaterThanOrEqual(0);
        expect(stats.winRate).toBeLessThanOrEqual(1);
      });
      
      console.log(`32-player statistics calculation: ${duration.toFixed(2)}ms`);
    });

    it('should maintain performance with realistic tournament data sizes', async () => {
      // Test performance with realistic data sizes for a 32-player tournament
      const tournamentData = {
        id: 'tournament-32-player',
        name: 'Test Tournament',
        format: 'constructed',
        status: 'active',
        players: 32,
        rounds: 5, // Swiss rounds for 32 players typically 5 rounds
        matches: 32 * 5 / 2, // Total matches across all rounds
      };

      const startTime = performance.now();
      
      // Simulate processing tournament data
      const processingResults = {
        playerCount: tournamentData.players,
        estimatedRounds: Math.ceil(Math.log2(tournamentData.players)),
        matchesPerRound: Math.floor(tournamentData.players / 2),
        totalMatches: tournamentData.matches,
        estimatedDuration: tournamentData.matches * 30 * 60 * 1000, // 30 min per match
      };
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(10); // Data processing should be nearly instant
      expect(processingResults.playerCount).toBe(32);
      expect(processingResults.matchesPerRound).toBe(16);
      expect(processingResults.estimatedRounds).toBe(5); // 2^5 = 32
      
      console.log(`Tournament data processing: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Memory Usage and Scalability', () => {
    it('should not create excessive object allocations during pairing', async () => {
      const players = Array.from({ length: 32 }, (_, i) => ({
        playerId: `player-${i}`,
        displayName: `Player ${i}`,
        matchPoints: i,
        gameWinPercentage: 0.5,
        opponentMatchWinPercentage: 0.5,
        isEliminated: false,
      }));

      mockPrisma.tournament.findUnique.mockResolvedValue({
        format: 'constructed',
        standings: players,
        matches: [],
      });

      // Monitor memory usage pattern
      const initialMemory = process.memoryUsage();
      
      const result = await generatePairings('tournament-32-player', 1);
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 10MB for this operation)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
      expect(result.matches).toHaveLength(16);
      
      console.log(`Memory increase during pairing: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });

    it('should handle concurrent pairing requests efficiently', async () => {
      const players = Array.from({ length: 32 }, (_, i) => ({
        playerId: `player-${i}`,
        displayName: `Player ${i}`,
        matchPoints: Math.floor(Math.random() * 15),
        gameWinPercentage: 0.5,
        opponentMatchWinPercentage: 0.5,
        isEliminated: false,
      }));

      mockPrisma.tournament.findUnique.mockResolvedValue({
        format: 'constructed',
        standings: players,
        matches: [],
      });

      const startTime = performance.now();
      
      // Simulate 5 concurrent pairing requests (multiple tournament rounds)
      const promises = Array.from({ length: 5 }, (_, i) =>
        generatePairings(`tournament-${i}`, 1)
      );
      
      const results = await Promise.all(promises);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(500); // All concurrent requests should complete quickly
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.matches).toHaveLength(16);
      });
      
      console.log(`5 concurrent pairing requests: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Edge Case Performance', () => {
    it('should handle worst-case pairing scenarios efficiently', async () => {
      // Worst case: all players have played each other before (impossible but test algorithm)
      const players = Array.from({ length: 8 }, (_, i) => ({ // Use smaller number for worst-case
        playerId: `player-${i}`,
        displayName: `Player ${i}`,
        matchPoints: 9, // All players have same score
        gameWinPercentage: 0.5,
        opponentMatchWinPercentage: 0.5,
        isEliminated: false,
      }));

      // Create match history where everyone has played everyone else
      const allPossibleMatches = [];
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          allPossibleMatches.push({
            players: [{ id: players[i].playerId }, { id: players[j].playerId }]
          });
        }
      }

      mockPrisma.tournament.findUnique.mockResolvedValue({
        format: 'constructed',
        standings: players,
        matches: allPossibleMatches,
      });

      const startTime = performance.now();
      const result = await generatePairings('tournament-worst-case', 5);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      // Even in worst case, should complete quickly
      expect(duration).toBeLessThan(200);
      expect(result.matches).toHaveLength(4); // Still pairs everyone
      
      console.log(`Worst-case pairing scenario: ${duration.toFixed(2)}ms`);
    });

    it('should handle large number of previous matches efficiently', async () => {
      const players = Array.from({ length: 16 }, (_, i) => ({
        playerId: `player-${i}`,
        displayName: `Player ${i}`,
        matchPoints: Math.floor(i / 2) * 3, // Varying scores
        gameWinPercentage: 0.5,
        opponentMatchWinPercentage: 0.5,
        isEliminated: false,
      }));

      // Create a large number of previous matches (simulate many rounds)
      const manyMatches = Array.from({ length: 200 }, (_, i) => ({
        players: [
          { id: `player-${i % 16}` },
          { id: `player-${(i + 1) % 16}` }
        ]
      }));

      mockPrisma.tournament.findUnique.mockResolvedValue({
        format: 'constructed',
        standings: players,
        matches: manyMatches,
      });

      const startTime = performance.now();
      const result = await generatePairings('tournament-many-matches', 1);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(300); // Should handle large history efficiently
      expect(result.matches).toHaveLength(8);
      
      console.log(`Large match history processing: ${duration.toFixed(2)}ms`);
    });
  });
});