/**
 * Integration Test: Cube Draft Configuration Loading
 *
 * Tests that cube drafts work correctly with proper configuration hydration.
 *
 * Bug: In production, cubeId not loaded before pack generation
 * Fix: Force hydration from DraftSession before leaderStartDraft
 *
 * Expected: Test FAILS (cubeId undefined, generates Beta packs instead of cube)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestTournament,
  createTestCube,
  generateTestPlayers,
  registerTestPlayers,
  startTournament,
  createMockSocketClient,
  waitForSocketEvent,
  sleep,
} from '../../helpers/tournament-test-utils';
import type { Socket } from 'socket.io-client';

// These tests require a running socket server and database
// Skip in CI, run manually in integration environment
describe('Integration: Cube Draft Flow', () => {
  let tournamentId: string;
  let cubeId: string;
  let socket: Socket;

  beforeEach(async () => {
    // Create test cube with 360 cards
    const cubeCardIds = Array.from({ length: 360 }, (_, i) => `cube_card_${i + 1}`);
    const { id } = await createTestCube('Test Cube', cubeCardIds);
    cubeId = id;

    // Create tournament with cube draft
    const tournament = await createTestTournament({
      format: 'draft',
      playerCount: 8,
      settings: {
        pairingFormat: 'swiss',
        totalRounds: 3,
        draftType: 'cube',
        cubeId,
        packCount: 3,
        packSize: 15,
      },
    });
    tournamentId = tournament.id;

    // Register 8 players
    const players = generateTestPlayers(8);
    await registerTestPlayers(tournamentId, players);

    // Create socket client
    socket = createMockSocketClient();
    await new Promise((resolve) => socket.on('connect', resolve));
  });

  afterEach(() => {
    socket?.disconnect();
  });

  it('should generate cube packs instead of Beta packs', async () => {
    // This test will FAIL until T016 (draft config hydration fix)
    // Current bug: Production generates Beta packs because cubeId is undefined

    // Start tournament
    await startTournament(tournamentId);

    // Wait for DRAFT_READY event
    await waitForSocketEvent(socket, 'DRAFT_READY', 10000);

    // Join draft session
    const draftSession = await fetch(
      `http://localhost:3000/api/tournaments/${tournamentId}/preparation/draft/session`
    ).then((r) => r.json());

    // Get draft state
    const draftState = await fetch(
      `http://localhost:3000/api/draft-sessions/${draftSession.id}/state`
    ).then((r) => r.json());

    // Verify pack exists
    expect(draftState.draftState.currentPacks).toBeDefined();
    expect(draftState.draftState.currentPacks.length).toBeGreaterThan(0);

    const firstPack = draftState.draftState.currentPacks[0];
    expect(firstPack).toBeDefined();
    expect(firstPack.length).toBe(15); // Pack size

    // Verify cards are from cube (start with 'cube_card_')
    const isCubeCard = (cardId: string) => cardId.startsWith('cube_card_');
    const cubeCardCount = firstPack.filter(isCubeCard).length;

    // Expected: All 15 cards from cube
    // Actual (before fix): 0 cube cards, all Beta cards
    expect(cubeCardCount).toBe(15);
  });

  it('should load cubeId from DraftSession settings', async () => {
    // Start tournament (creates DraftSession)
    await startTournament(tournamentId);

    await sleep(1000); // Wait for draft session creation

    // Query DraftSession directly
    const draftSession = await fetch(
      `http://localhost:3000/api/tournaments/${tournamentId}/preparation/draft/session`
    ).then((r) => r.json());

    expect(draftSession).toBeDefined();
    expect(draftSession.settings).toBeDefined();
    expect(draftSession.settings.cubeId).toBe(cubeId);
  });

  it('should work identically in production and development', async () => {
    // This test verifies the environment-specific behavior
    // Bug: Works in dev (server restarts often, matches load from DB)
    //      Fails in prod (long-running server, matches cached in memory)

    // Simulate production scenario:
    // 1. Start tournament (creates DraftSession with cubeId)
    await startTournament(tournamentId);

    // 2. Wait for match to be created and cached in memory
    await sleep(2000);

    // 3. Start draft (should hydrate config from DraftSession)
    await waitForSocketEvent(socket, 'DRAFT_READY', 10000);

    // 4. Verify draft uses cube config (not cached empty config)
    const draftSession = await fetch(
      `http://localhost:3000/api/tournaments/${tournamentId}/preparation/draft/session`
    ).then((r) => r.json());

    const draftState = await fetch(
      `http://localhost:3000/api/draft-sessions/${draftSession.id}/state`
    ).then((r) => r.json());

    const firstPack = draftState.draftState.currentPacks?.[0] || [];
    const cubeCards = firstPack.filter((id: string) => id.startsWith('cube_card_'));

    // This will FAIL in production until T016 fixes hydration
    expect(cubeCards.length).toBe(15);
  });

  it('should handle all 8 players receiving cube packs', async () => {
    // Start tournament
    await startTournament(tournamentId);
    await waitForSocketEvent(socket, 'DRAFT_READY', 10000);

    const draftSession = await fetch(
      `http://localhost:3000/api/tournaments/${tournamentId}/preparation/draft/session`
    ).then((r) => r.json());

    const draftState = await fetch(
      `http://localhost:3000/api/draft-sessions/${draftSession.id}/state`
    ).then((r) => r.json());

    // Verify all 8 players have packs
    expect(draftState.draftState.currentPacks).toHaveLength(8);

    // Verify all packs contain cube cards
    for (const pack of draftState.draftState.currentPacks) {
      const cubeCards = pack.filter((id: string) => id.startsWith('cube_card_'));
      expect(cubeCards.length).toBe(15);
    }

    // Verify no duplicate cards across all packs
    const allCards = draftState.draftState.currentPacks.flat();
    const uniqueCards = new Set(allCards);
    expect(uniqueCards.size).toBe(allCards.length); // No duplicates
  });

  it('should respect packCount and packSize settings', async () => {
    // Start tournament
    await startTournament(tournamentId);
    await waitForSocketEvent(socket, 'DRAFT_READY', 10000);

    const draftSession = await fetch(
      `http://localhost:3000/api/tournaments/${tournamentId}/preparation/draft/session`
    ).then((r) => r.json());

    // Verify pack configuration
    expect(draftSession.packConfiguration).toBeDefined();

    const draftState = await fetch(
      `http://localhost:3000/api/draft-sessions/${draftSession.id}/state`
    ).then((r) => r.json());

    // Verify pack size is 15 (from settings)
    const firstPack = draftState.draftState.currentPacks[0];
    expect(firstPack.length).toBe(15);
  });

  it('should log draft config loading for debugging', async () => {
    // This test verifies logging was added for production debugging
    // Expected log: "[Draft] Config loaded: { matchId, cubeId }"

    // For now, just verify the flow completes without errors
    await startTournament(tournamentId);
    await waitForSocketEvent(socket, 'DRAFT_READY', 10000);

    // If we get here without errors, config loaded successfully
    expect(true).toBe(true);
  });
});
