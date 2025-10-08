/**
 * Tournament Test Utilities
 *
 * Helper functions for testing tournament flows, including:
 * - Creating test tournaments
 * - Registering test players
 * - Starting tournaments
 * - Mocking Socket.IO connections
 */

import { io, Socket } from 'socket.io-client';
import type { TournamentFormat } from '@prisma/client';

/**
 * Test tournament configuration
 */
export interface TestTournamentConfig {
  name?: string;
  format: 'draft' | 'sealed' | 'constructed';
  playerCount?: number;
  settings?: {
    pairingFormat?: 'swiss' | 'elimination' | 'round_robin';
    totalRounds?: number;
    draftType?: 'regular' | 'cube';
    cubeId?: string;
    packCount?: number;
    packSize?: number;
  };
}

/**
 * Test player data
 */
export interface TestPlayer {
  id: string;
  displayName: string;
  username: string;
}

/**
 * Create a test tournament via API
 */
export async function createTestTournament(
  config: TestTournamentConfig
): Promise<{ id: string; tournament: unknown }> {
  const response = await fetch('http://localhost:3000/api/tournaments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: config.name || `Test Tournament ${Date.now()}`,
      format: config.format,
      settings: {
        pairingFormat: config.settings?.pairingFormat || 'swiss',
        totalRounds: config.settings?.totalRounds || 3,
        ...(config.format === 'draft' && {
          draftType: config.settings?.draftType || 'regular',
          cubeId: config.settings?.cubeId,
          packCount: config.settings?.packCount || 3,
          packSize: config.settings?.packSize || 15,
        }),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create tournament: ${response.statusText}`);
  }

  const tournament = await response.json();
  return { id: tournament.id, tournament };
}

/**
 * Generate test players
 */
export function generateTestPlayers(count: number): TestPlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `test-player-${i + 1}`,
    displayName: `Player ${i + 1}`,
    username: `player${i + 1}`,
  }));
}

/**
 * Register test players to a tournament
 */
export async function registerTestPlayers(
  tournamentId: string,
  players: TestPlayer[]
): Promise<void> {
  const registrations = await Promise.all(
    players.map((player) =>
      fetch(`http://localhost:3000/api/tournaments/${tournamentId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: player.id,
          playerName: player.displayName,
        }),
      })
    )
  );

  const failures = registrations.filter((r) => !r.ok);
  if (failures.length > 0) {
    throw new Error(`Failed to register ${failures.length} players`);
  }
}

/**
 * Start a tournament via API
 */
export async function startTournament(tournamentId: string): Promise<unknown> {
  const response = await fetch(
    `http://localhost:3000/api/tournaments/${tournamentId}/start`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to start tournament: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Create a mock Socket.IO client for testing
 */
export function createMockSocketClient(
  url: string = 'http://localhost:3010'
): Socket {
  const socket = io(url, {
    transports: ['websocket'],
    reconnection: false,
  });

  return socket;
}

/**
 * Wait for a socket event with timeout
 */
export function waitForSocketEvent<T = unknown>(
  socket: Socket,
  eventName: string,
  timeoutMs: number = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timeout waiting for event: ${eventName}`));
    }, timeoutMs);

    const handler = (data: T) => {
      clearTimeout(timeout);
      socket.off(eventName, handler);
      resolve(data);
    };

    socket.on(eventName, handler);
  });
}

/**
 * Count how many times a socket event is received
 */
export function countSocketEvents(
  socket: Socket,
  eventName: string,
  durationMs: number = 1000
): Promise<number> {
  return new Promise((resolve) => {
    let count = 0;

    const handler = () => {
      count++;
    };

    socket.on(eventName, handler);

    setTimeout(() => {
      socket.off(eventName, handler);
      resolve(count);
    }, durationMs);
  });
}

/**
 * Join a tournament room via Socket.IO
 */
export async function joinTournamentRoom(
  socket: Socket,
  tournamentId: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.emit('tournament:join', { tournamentId }, (error?: string) => {
      if (error) {
        reject(new Error(error));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Complete a match via API
 */
export async function completeMatch(
  matchId: string,
  winnerId: string,
  loserId: string,
  isDraw: boolean = false
): Promise<unknown> {
  const response = await fetch(
    `http://localhost:3000/api/tournaments/matches/${matchId}/result`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        winnerId: isDraw ? undefined : winnerId,
        loserId: isDraw ? undefined : loserId,
        isDraw,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to complete match: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get tournament standings via API
 */
export async function getStandings(tournamentId: string): Promise<unknown[]> {
  const response = await fetch(
    `http://localhost:3000/api/tournaments/${tournamentId}/standings`
  );

  if (!response.ok) {
    throw new Error(`Failed to get standings: ${response.statusText}`);
  }

  const data = await response.json();
  return data.standings || data;
}

/**
 * Cleanup: Delete test tournament
 */
export async function deleteTestTournament(tournamentId: string): Promise<void> {
  // Note: Add delete endpoint if it doesn't exist
  try {
    await fetch(`http://localhost:3000/api/tournaments/${tournamentId}`, {
      method: 'DELETE',
    });
  } catch (err) {
    // Ignore errors during cleanup
    console.warn('Failed to delete test tournament:', err);
  }
}

/**
 * Sleep helper for delays in tests
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a test cube via API
 */
export async function createTestCube(
  name: string,
  cardIds: string[]
): Promise<{ id: string; cube: unknown }> {
  const response = await fetch('http://localhost:3000/api/cubes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      cardIds,
      isPublic: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create cube: ${response.statusText}`);
  }

  const cube = await response.json();
  return { id: cube.id, cube };
}

/**
 * Verify event payload structure
 */
export function verifyEventPayload<T extends Record<string, unknown>>(
  payload: unknown,
  requiredFields: (keyof T)[]
): payload is T {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const obj = payload as Record<string, unknown>;
  return requiredFields.every(
    (field) => String(field) in obj && obj[String(field)] !== undefined
  );
}
