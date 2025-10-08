/**
 * Performance Test: Broadcast Latency
 *
 * Measures latency from API call to Socket.IO client receipt.
 * Target: p50 <50ms, p95 <100ms
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestTournament,
  generateTestPlayers,
  registerTestPlayers,
  createMockSocketClient,
  joinTournamentRoom,
} from '../helpers/tournament-test-utils';
import type { Socket } from 'socket.io-client';

// These tests require a running socket server and database
// Skip in CI, run manually in integration environment
describe('Performance: Broadcast Latency', () => {
  let tournamentId: string;
  let socket: Socket;

  beforeEach(async () => {
    const { id } = await createTestTournament({
      format: 'constructed',
      playerCount: 8,
    });
    tournamentId = id;

    const players = generateTestPlayers(8);
    await registerTestPlayers(tournamentId, players);

    socket = createMockSocketClient();
    await new Promise((resolve) => socket.on('connect', resolve));
    await joinTournamentRoom(socket, tournamentId);
  });

  afterEach(() => {
    socket?.disconnect();
  });

  it('should have p50 broadcast latency <50ms and p95 <100ms', async () => {
    const latencies: number[] = [];

    // Run 100 iterations
    for (let i = 0; i < 100; i++) {
      const start = Date.now();

      // Wait for event
      await new Promise<void>((resolve) => {
        socket.once('PHASE_CHANGED', () => {
          const latency = Date.now() - start;
          latencies.push(latency);
          resolve();
        });

        // Trigger broadcast
        fetch(`http://localhost:3000/api/tournaments/${tournamentId}/start`, {
          method: 'POST',
        });
      });
    }

    // Calculate percentiles
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];

    console.log(`Broadcast latency - p50: ${p50}ms, p95: ${p95}ms`);

    expect(p50).toBeLessThan(50);
    expect(p95).toBeLessThan(100);
  });
});
