/**
 * Performance Test: Standings Update
 *
 * Measures database transaction time for standings updates.
 * Target: p50 <5ms, p95 <10ms
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestTournament,
  generateTestPlayers,
  registerTestPlayers,
  startTournament,
  completeMatch,
} from '../helpers/tournament-test-utils';

// These tests require a running socket server and database
// Skip in CI, run manually in integration environment
describe('Performance: Standings Update', () => {
  it('should have p50 standings update <5ms and p95 <10ms', async () => {
    const latencies: number[] = [];

    // Run 100 iterations
    for (let i = 0; i < 100; i++) {
      // Create fresh tournament for each iteration
      const { id } = await createTestTournament({
        format: 'constructed',
        playerCount: 4,
      });

      const players = generateTestPlayers(4);
      await registerTestPlayers(id, players);
      await startTournament(id);

      // Get match
      const matches = await fetch(`http://localhost:3000/api/tournaments/${id}/matches`).then(
        (r) => r.json()
      );

      // Measure standings update time
      const start = Date.now();
      await completeMatch(matches[0].id, players[0].id, players[1].id, false);
      const latency = Date.now() - start;

      latencies.push(latency);
    }

    // Calculate percentiles
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];

    console.log(`Standings update - p50: ${p50}ms, p95: ${p95}ms`);

    expect(p50).toBeLessThan(5);
    expect(p95).toBeLessThan(10);
  });
});
