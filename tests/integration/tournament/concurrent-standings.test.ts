/**
 * Integration Test: Concurrent Standings Updates
 *
 * Tests that concurrent match completions don't cause data loss.
 * Bug: Non-transactional updates allow race conditions
 * Fix: Wrap updates in prisma.$transaction
 *
 * Expected: Test FAILS (race condition causes data loss)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestTournament,
  generateTestPlayers,
  registerTestPlayers,
  startTournament,
  completeMatch,
  getStandings,
} from '../../helpers/tournament-test-utils';

describe('Integration: Concurrent Standings Updates', () => {
  let tournamentId: string;
  let players: ReturnType<typeof generateTestPlayers>;

  beforeEach(async () => {
    // Create 4-player constructed tournament
    const { id } = await createTestTournament({
      format: 'constructed',
      playerCount: 4,
      settings: {
        pairingFormat: 'swiss',
        totalRounds: 1,
      },
    });
    tournamentId = id;

    players = generateTestPlayers(4);
    await registerTestPlayers(tournamentId, players);
    await startTournament(tournamentId);
  });

  it('should handle concurrent match completions without data loss', async () => {
    // This will FAIL until T015 (transaction wrapper)
    // Get match IDs (2 matches: P1 vs P2, P3 vs P4)
    const matches = await fetch(
      `http://localhost:3000/api/tournaments/${tournamentId}/matches`
    ).then((r) => r.json());

    const match1 = matches[0];
    const match2 = matches[1];

    // Complete both matches simultaneously
    await Promise.all([
      completeMatch(match1.id, players[0].id, players[1].id, false),
      completeMatch(match2.id, players[2].id, players[3].id, false),
    ]);

    // Verify all standings are correct
    const standings = await getStandings(tournamentId);

    expect(standings).toHaveLength(4);

    // Player 0 (winner): wins=1, losses=0, matchPoints=3
    const p0 = standings.find((s: { playerId: string }) => s.playerId === players[0].id);
    expect(p0?.wins).toBe(1);
    expect(p0?.losses).toBe(0);
    expect(p0?.matchPoints).toBe(3);

    // Player 1 (loser): wins=0, losses=1, matchPoints=0
    const p1 = standings.find((s: { playerId: string }) => s.playerId === players[1].id);
    expect(p1?.wins).toBe(0);
    expect(p1?.losses).toBe(1);
    expect(p1?.matchPoints).toBe(0);

    // Player 2 (winner): wins=1, losses=0, matchPoints=3
    const p2 = standings.find((s: { playerId: string }) => s.playerId === players[2].id);
    expect(p2?.wins).toBe(1);
    expect(p2?.losses).toBe(0);
    expect(p2?.matchPoints).toBe(3);

    // Player 3 (loser): wins=0, losses=1, matchPoints=0
    const p3 = standings.find((s: { playerId: string }) => s.playerId === players[3].id);
    expect(p3?.wins).toBe(0);
    expect(p3?.losses).toBe(1);
    expect(p3?.matchPoints).toBe(0);
  });

  it('should not lose data when run 10 times', async () => {
    // Run the concurrent completion test 10 times to increase chance of catching race condition
    for (let i = 0; i < 10; i++) {
      // Reset tournament
      const { id } = await createTestTournament({
        format: 'constructed',
        playerCount: 4,
      });
      const testPlayers = generateTestPlayers(4);
      await registerTestPlayers(id, testPlayers);
      await startTournament(id);

      const matches = await fetch(`http://localhost:3000/api/tournaments/${id}/matches`).then(
        (r) => r.json()
      );

      await Promise.all([
        completeMatch(matches[0].id, testPlayers[0].id, testPlayers[1].id, false),
        completeMatch(matches[1].id, testPlayers[2].id, testPlayers[3].id, false),
      ]);

      const standings = await getStandings(id);
      const totalWins = standings.reduce((sum: number, s: { wins: number }) => sum + s.wins, 0);
      const totalLosses = standings.reduce(
        (sum: number, s: { losses: number }) => sum + s.losses,
        0
      );

      // Should have exactly 2 wins and 2 losses
      expect(totalWins).toBe(2);
      expect(totalLosses).toBe(2);
    }
  });
});
