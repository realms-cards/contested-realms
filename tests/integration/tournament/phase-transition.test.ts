/**
 * Integration Test: Phase Transition Without Reload
 *
 * Tests that tournament phase changes are broadcast to clients
 * automatically without requiring page reload.
 *
 * Bug: Global broadcasts cause all clients to receive all events
 * Fix: Remove io.emit() calls, use io.to(room) only
 *
 * Expected: Test FAILS (global broadcasts still present)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestTournament,
  generateTestPlayers,
  registerTestPlayers,
  startTournament,
  createMockSocketClient,
  waitForSocketEvent,
  countSocketEvents,
  joinTournamentRoom,
  deleteTestTournament,
} from '../../helpers/tournament-test-utils';
import type { Socket } from 'socket.io-client';

// These tests require a running socket server and database
// Skip in CI, run manually in integration environment
describe('Integration: Phase Transition Without Reload', () => {
  let tournamentId: string;
  let socket: Socket;

  beforeEach(async () => {
    // Create tournament with 8 players
    const { id } = await createTestTournament({
      format: 'draft',
      playerCount: 8,
      settings: {
        pairingFormat: 'swiss',
        totalRounds: 3,
      },
    });
    tournamentId = id;

    // Register players
    const players = generateTestPlayers(8);
    await registerTestPlayers(tournamentId, players);

    // Create Socket.IO client
    socket = createMockSocketClient();
    await new Promise((resolve) => socket.on('connect', resolve));

    // Join tournament room
    await joinTournamentRoom(socket, tournamentId);
  });

  afterEach(async () => {
    socket?.disconnect();
    await deleteTestTournament(tournamentId);
  });

  it('should receive exactly 1 PHASE_CHANGED event when tournament starts', async () => {
    // This test will FAIL until T014 (remove global broadcasts)
    // Current behavior: Receives 2 events (room + global)

    // Count events over 2 seconds
    const eventCountPromise = countSocketEvents(socket, 'PHASE_CHANGED', 2000);

    // Start tournament (triggers phase change)
    await startTournament(tournamentId);

    const eventCount = await eventCountPromise;

    // Expected: Exactly 1 event (room broadcast only)
    // Actual (before fix): 2 events (room + global broadcast)
    expect(eventCount).toBe(1);
  });

  it('should receive PHASE_CHANGED event with correct payload', async () => {
    // Wait for PHASE_CHANGED event
    const eventPromise = waitForSocketEvent<{
      tournamentId: string;
      newPhase: string;
      newStatus: string;
      timestamp: string;
    }>(socket, 'PHASE_CHANGED', 5000);

    // Start tournament
    await startTournament(tournamentId);

    const event = await eventPromise;

    // Verify event structure
    expect(event.tournamentId).toBe(tournamentId);
    expect(event.newPhase).toBe('preparing');
    expect(event.newStatus).toBe('preparing');
    expect(event.timestamp).toBeDefined();
    expect(typeof event.timestamp).toBe('string');
  });

  it('should NOT receive events for other tournaments', async () => {
    // Create a second tournament
    const { id: otherTournamentId } = await createTestTournament({
      format: 'constructed',
      playerCount: 4,
    });
    const players = generateTestPlayers(4);
    await registerTestPlayers(otherTournamentId, players);

    // Count PHASE_CHANGED events
    const eventCountPromise = countSocketEvents(socket, 'PHASE_CHANGED', 2000);

    // Start OTHER tournament (should not trigger event for this socket)
    await startTournament(otherTournamentId);

    const eventCount = await eventCountPromise;

    // Expected: 0 events (we're only in first tournament's room)
    // Actual (before fix): 1 event (global broadcast reaches all clients)
    expect(eventCount).toBe(0);

    // Cleanup
    await deleteTestTournament(otherTournamentId);
  });

  it('should transition through multiple phases without reload', async () => {
    const receivedPhases: string[] = [];

    // Listen for all phase changes
    socket.on('PHASE_CHANGED', (data: { newPhase: string }) => {
      receivedPhases.push(data.newPhase);
    });

    // Start tournament (preparing phase)
    await startTournament(tournamentId);

    // Wait for draft to start automatically
    await waitForSocketEvent(socket, 'DRAFT_READY', 10000);

    // Verify phase transitions received
    expect(receivedPhases).toContain('preparing');
    // More phases may follow depending on tournament flow
    expect(receivedPhases.length).toBeGreaterThan(0);
  });

  it('should NOT trigger infinite request loops', async () => {
    let phaseChangeCount = 0;
    let apiCallCount = 0;

    // Track PHASE_CHANGED events
    socket.on('PHASE_CHANGED', () => {
      phaseChangeCount++;

      // Simulate client making API call in response to event
      // (This is what causes the loop in the bug)
      apiCallCount++;
    });

    // Start tournament
    await startTournament(tournamentId);

    // Wait 3 seconds to see if loop occurs
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Expected: 1-2 phase changes (preparing, maybe draft)
    // Actual (with bug): 10+ due to loop
    expect(phaseChangeCount).toBeLessThan(5);
    expect(apiCallCount).toBeLessThan(5);
  });

  it('should broadcast to all clients in tournament room', async () => {
    // Create second socket client
    const socket2 = createMockSocketClient();
    await new Promise((resolve) => socket2.on('connect', resolve));
    await joinTournamentRoom(socket2, tournamentId);

    // Both sockets should receive event
    const event1Promise = waitForSocketEvent(socket, 'PHASE_CHANGED', 5000);
    const event2Promise = waitForSocketEvent(socket2, 'PHASE_CHANGED', 5000);

    // Start tournament
    await startTournament(tournamentId);

    // Both should receive event
    const [event1, event2] = await Promise.all([event1Promise, event2Promise]);

    expect(event1).toBeDefined();
    expect(event2).toBeDefined();
    expect((event1 as { tournamentId: string }).tournamentId).toBe(tournamentId);
    expect((event2 as { tournamentId: string }).tournamentId).toBe(tournamentId);

    socket2.disconnect();
  });
});
